import * as cdk from "aws-cdk-lib";
import * as cdkContructs from 'constructs';
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as autoscaling from "aws-cdk-lib/aws-autoscaling";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as albv2 from "aws-cdk-lib/aws-elasticloadbalancingv2";
import * as configTypes from "./config.interface";
import * as constants from "./constants";
import * as nag from "cdk-nag";
import { HealthCheck } from "aws-cdk-lib/aws-appmesh";

export interface HANodesConstructCustomProps {
  instanceType: ec2.InstanceType,
  dataVolumes: configTypes.DataVolumeConfig[],
  rootDataVolumeDeviceName?: string,
  machineImage: cdk.aws_ec2.IMachineImage,
  role: cdk.aws_iam.IRole,
  vpc: cdk.aws_ec2.IVpc,
  securityGroup: cdk.aws_ec2.ISecurityGroup,
  userData: string,
  numberOfNodes: number;
  rpcPortForALB: number,
  albHealthCheckGracePeriodMin: number;
  healthCheckPath? : string;
  heartBeatDelayMin: number;
  lifecycleHookName: string;
  autoScalingGroupName: string;
  // Ssh access for debugging. TODO: delete before merge to upstream repo.
  debugKeyName?: string;
}
export class HANodesConstruct extends cdkContructs.Construct {
    public loadBalancerDnsName: string;
  constructor(scope: cdkContructs.Construct, id: string, props: HANodesConstructCustomProps) {
    super(scope, id);

    const STACK_NAME = cdk.Stack.of(this).stackName;

    const availabilityZones = cdk.Stack.of(this).availabilityZones;

    const {
      instanceType,
      dataVolumes,
      rootDataVolumeDeviceName,
      machineImage,
      role,
      vpc,
      securityGroup,
      userData,
      numberOfNodes,
      rpcPortForALB,
      albHealthCheckGracePeriodMin,
      healthCheckPath,
      heartBeatDelayMin,
      lifecycleHookName,
      autoScalingGroupName,
      // Ssh access for debugging. TODO: delete before merge to upstream repo.
      debugKeyName,
    } = props;

    let blockDevices: ec2.BlockDevice[] = [
      {
          // ROOT VOLUME
          deviceName: rootDataVolumeDeviceName ? rootDataVolumeDeviceName : "/dev/xvda",
          volume: autoscaling.BlockDeviceVolume.ebs(46, {
              deleteOnTermination: true,
              throughput: 125,
              encrypted: true,
              iops: 3000,
              volumeType: autoscaling.EbsDeviceVolumeType.GP3,
          }),
      },
  ]

   // Adding EBS data volumes if we are not going to use instance store
   dataVolumes.forEach( (dataVolume, arrayIndex) => {
      const dataVolumeIndex = arrayIndex +1;
      if (dataVolumeIndex > 6){
          throw new Error(`Number of data volumes can't be more than 6, current number: ${dataVolumeIndex}`);
      }

      if (dataVolume.type !== constants.InstanceStoreageDeviceVolumeType){
          blockDevices.push(
              {
                  deviceName: constants.VolumeDeviceNames[arrayIndex],
                  volume: autoscaling.BlockDeviceVolume.ebs(dataVolume.sizeGiB, {
                      deleteOnTermination: true,
                      throughput: dataVolume.throughput,
                      encrypted: true,
                      iops: dataVolume.iops,
                      volumeType: autoscaling.EbsDeviceVolumeType[dataVolume.type.toUpperCase() as keyof typeof autoscaling.EbsDeviceVolumeType],
                  }),
              }
          )
      }
   });

  const launchTemplate = new ec2.LaunchTemplate(this, 'launch-template', {
      userData: ec2.UserData.custom(userData),
      launchTemplateName: autoScalingGroupName,
      machineImage: machineImage,
      ebsOptimized: true,
      securityGroup: securityGroup,
      instanceType: instanceType,
      blockDevices: blockDevices,
      role: role,
      // Ssh access for debugging. TODO: delete before merge to upstream repo.
      keyName: debugKeyName,
    });

  const vpcSubnets= {
      subnetType: ec2.SubnetType.PUBLIC,
      onePerAz: true,
      availabilityZones: availabilityZones,
  };

  const rpcNodesAsg = new autoscaling.AutoScalingGroup(this, "auto-scaling-group", {
      launchTemplate: launchTemplate,
      vpc: vpc,
      autoScalingGroupName: autoScalingGroupName,
      minCapacity: 0,
      desiredCapacity: numberOfNodes,
      maxCapacity: 4,
      vpcSubnets: vpcSubnets,
      defaultInstanceWarmup: cdk.Duration.minutes(1),
      healthCheck: autoscaling.HealthCheck.elb({
          // Should give enough time for the node to catch up
          grace: cdk.Duration.minutes(albHealthCheckGracePeriodMin),
      }),
  });

  rpcNodesAsg.addLifecycleHook("lifecycle-hook", {
      lifecycleTransition: autoscaling.LifecycleTransition.INSTANCE_LAUNCHING,
      defaultResult: autoscaling.DefaultResult.ABANDON,
      heartbeatTimeout: cdk.Duration.minutes(heartBeatDelayMin),
      lifecycleHookName: lifecycleHookName,
  })

  cdk.Tags.of(rpcNodesAsg).add("Name", STACK_NAME, {
      applyToLaunchedInstances: true,
  });

  const albLogBucket = new s3.Bucket(this, "alb-log-bucket", {
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
      versioned: false,
      accessControl: s3.BucketAccessControl.PRIVATE,
      publicReadAccess: false,
      blockPublicAccess: new s3.BlockPublicAccess(s3.BlockPublicAccess.BLOCK_ALL),
      bucketKeyEnabled: false,
      encryption: s3.BucketEncryption.S3_MANAGED,
      enforceSSL: true,
  });

  const albSg = new ec2.SecurityGroup(this, "alb-security-group", {
      vpc,
      description: "Security Group for Load Balancer",
      allowAllOutbound: true,
  });

  albSg.addIngressRule(ec2.Peer.ipv4(vpc.vpcCidrBlock), ec2.Port.tcp(rpcPortForALB), "Blockchain Node RPC");
  securityGroup.addIngressRule(ec2.Peer.securityGroupId(albSg.securityGroupId), ec2.Port.allTcp(), "Allow access from ALB to Blockchain Node");

  const alb = new albv2.ApplicationLoadBalancer(this, "alb", {
      vpc,
      internetFacing: false,
      securityGroup: albSg,
      vpcSubnets: vpcSubnets,
  });

  alb.logAccessLogs(albLogBucket, STACK_NAME);

  const listener = alb.addListener("alb-listener", {
      port: rpcPortForALB,
      open: false,
      protocol: albv2.ApplicationProtocol.HTTP,
  });

  listener.addTargets("node-rpc", {
      port: rpcPortForALB,
      protocol: albv2.ApplicationProtocol.HTTP,
      targets: [rpcNodesAsg],
      deregistrationDelay: cdk.Duration.seconds(30),
      healthCheck: {
          enabled: true,
          healthyHttpCodes: "200-299",
          path: healthCheckPath ? healthCheckPath : "/",
          // In the future, can create a separate service to have a more reliable health check
          port: rpcPortForALB.toString(),
          unhealthyThresholdCount: 2,
          healthyThresholdCount: 3,
          interval: cdk.Duration.seconds(30),
      },
  });

    // CloudFormation Config: wait for 15 min for the node to start
    const creationPolicy: cdk.CfnCreationPolicy = {
      resourceSignal: {
        count: 1,
        timeout: "PT15M",
      },
    };

    this.loadBalancerDnsName = alb.loadBalancerDnsName;

    nag.NagSuppressions.addResourceSuppressions(
      this,
      [
          {
              id: "AwsSolutions-EC29",
              reason: "Its Ok to terminate this instance as long as we have the data in the snapshot",

          },
      ],
      true
  );
  }
}
