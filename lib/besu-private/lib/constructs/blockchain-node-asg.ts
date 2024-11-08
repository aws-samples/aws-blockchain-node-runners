import {
  AutoScalingGroup,
  ScalingProcess,
  Signals,
  UpdatePolicy,
  CfnAutoScalingGroup,
  DefaultResult,
  LifecycleTransition,
} from 'aws-cdk-lib/aws-autoscaling';
import { Duration, Stack, CfnResource } from 'aws-cdk-lib';
import { Construct } from 'constructs';

import {
  BlockDeviceVolume,
  InstanceType,
  IVpc,
  LaunchTemplate,
  SecurityGroup,
  UserData,
  SubnetType,
  CloudFormationInit
} from 'aws-cdk-lib/aws-ec2';
import { IRole, Role } from 'aws-cdk-lib/aws-iam';
import { EcsOptimizedImage, AmiHardwareType } from 'aws-cdk-lib/aws-ecs';

/**
 * Properties that define the deployment params for the blockchain node asg
 */
export interface BlockchainASGDeploymentProps { //Will be deprecated when userdata is extracted out to another construct
  CFN_SIGNAL_MIN_SUCCESS_PERCENTAGE: number;
  CFN_SIGNAL_TIMEOUT_DURATION: Duration;
  ROLLING_UPDATE_MAX_BATCH_SIZE: number;
  MIN_INSTANCES_IN_SERVICE_DURING_DEPLOYMENT: number
}

/**
 * Properties needed to construct a BlockchainNode
 */
export interface BlockchainNodeProps {
  instanceType: InstanceType;
  defaultInstanceRole: Role;
  rootVolumeSizeInGB: number;
}

/**
 * Properties needed to determine the size of the ASG
 */
export interface BlockchainASGCapacityProps {
  minCapacity: number;
  desiredCapacity?: number;
  maxCapacity?: number;
}
/**
 * Properties needed to construct a BlockchainNodeASG
 */
export interface BlockchainNodeASGProps {
  userData: UserData; //TODO: Create a blockchain specific construct for this along with inbuilt signalling.
  asgSizeConfiguration: BlockchainASGCapacityProps;
  name: string;
  resourcePrefix: string; //prefix added to the names of all resources created as part of this construct
  vpc: IVpc;
  securityGroup: SecurityGroup;
  availabilityZones?: string[]; //defaults to all available AZs in the region if undefined
  blockchainNodeProps: BlockchainNodeProps;
  deploymentProps: BlockchainASGDeploymentProps;
  asgLogicalId: string;
}

/**
 * ASG Which spins up a blockchain node with the latest ECS optimized AMI.
 */
export class BlockchainNodeASG extends Construct {
  private readonly stack;
  readonly asg: AutoScalingGroup;

  constructor(scope: Construct, id: string, props: BlockchainNodeASGProps) {
    super(scope, id);
    this.stack = Stack.of(scope);

    if (props.availabilityZones == undefined || props.availabilityZones.length == 0) { //create instances across all AZs if not specified by consumer
      props.availabilityZones = Stack.of(scope).availabilityZones //https://docs.aws.amazon.com/cdk/v2/guide/context.html#context_methods
    }

    // TODO : Add any custom initialization here.
    const cloudFormationInit = CloudFormationInit.fromElements();

    const launchTemplate = new LaunchTemplate(this, `${props.resourcePrefix}-launch-template`, {
      securityGroup: props.securityGroup,
      launchTemplateName: `${props.resourcePrefix}-launch-template`,
      instanceType: props.blockchainNodeProps.instanceType,
      machineImage: EcsOptimizedImage.amazonLinux2(AmiHardwareType.ARM),
      requireImdsv2: true,
      role: props.blockchainNodeProps.defaultInstanceRole,
      userData: props.userData,
      ebsOptimized: true,
      blockDevices: [
        {
          // Root Volume.
          deviceName: '/dev/xvda',
          volume: BlockDeviceVolume.ebs(props.blockchainNodeProps.rootVolumeSizeInGB, { deleteOnTermination: true, encrypted: true }),
        },
      ],
    });

    this.asg = new AutoScalingGroup(this, `${props.resourcePrefix}-asg`, {
      vpc: props.vpc,
      vpcSubnets: {
        subnetType: SubnetType.PRIVATE_ISOLATED,
        availabilityZones: props.availabilityZones,
      },
      autoScalingGroupName: props.name,
      launchTemplate: launchTemplate,
      minCapacity: props.asgSizeConfiguration.minCapacity,
      desiredCapacity: props.asgSizeConfiguration.desiredCapacity,
      maxCapacity: props.asgSizeConfiguration.maxCapacity,
      signals: Signals.waitForAll({
        minSuccessPercentage: props.deploymentProps.CFN_SIGNAL_MIN_SUCCESS_PERCENTAGE,
        timeout: props.deploymentProps.CFN_SIGNAL_TIMEOUT_DURATION, // Timeout for each instance.
      }),
      updatePolicy: UpdatePolicy.rollingUpdate({
        maxBatchSize: props.deploymentProps.ROLLING_UPDATE_MAX_BATCH_SIZE,
        minInstancesInService: props.deploymentProps.MIN_INSTANCES_IN_SERVICE_DURING_DEPLOYMENT,
        suspendProcesses: [
          ScalingProcess.HEALTH_CHECK,
          ScalingProcess.REPLACE_UNHEALTHY,
          ScalingProcess.AZ_REBALANCE,
          ScalingProcess.ALARM_NOTIFICATION,
        ],
      }),
    });

    // Modifying the AWS CloudFormation resource behind AWS constructs to add hooks as part of ASG definition
    // See https://docs.aws.amazon.com/cdk/v2/guide/cfn_layer.html
    const cfnAsg = this.asg.node.defaultChild as CfnAutoScalingGroup;
    cfnAsg.lifecycleHookSpecificationList = [
      {
        lifecycleTransition: LifecycleTransition.INSTANCE_LAUNCHING,
        lifecycleHookName: `${props.resourcePrefix}-InstanceLaunchHook`,
        defaultResult: DefaultResult.ABANDON,
        heartbeatTimeout: 300, //seconds
      },
      {
        lifecycleTransition: LifecycleTransition.INSTANCE_TERMINATING,
        lifecycleHookName: `${props.resourcePrefix}-InstanceTerminationHook`,
        defaultResult: DefaultResult.ABANDON,
        heartbeatTimeout: 180, //seconds
      },
    ];
    // Override logical ID to avoid circular dependency in specifying id in cfn signalling.
    (cfnAsg as CfnResource).overrideLogicalId(props.asgLogicalId);

    this.asg.applyCloudFormationInit(cloudFormationInit);
  }

  public getASGRole(): IRole {
    return this.asg.role;
  }
}
