import { BlockchainNodeASG } from './constructs/blockchain-node-asg';
import { CertificateValidation, DnsValidatedCertificate } from 'aws-cdk-lib/aws-certificatemanager';
import { AwsCustomResource, AwsCustomResourcePolicy, PhysicalResourceId } from 'aws-cdk-lib/custom-resources';
import { ArnPrincipal, Effect, ManagedPolicy, PolicyStatement, Role, ServicePrincipal } from 'aws-cdk-lib/aws-iam';
import {
  AsgCapacityProvider,
  CfnService,
  CfnTaskDefinition,
  Cluster,
  ContainerImage,
  Ec2TaskDefinition,
  LogDriver,
  NetworkMode,
  PlacementConstraint,
  Protocol as ECSProtocol,
} from 'aws-cdk-lib/aws-ecs';
import { NetworkLoadBalancedEc2Service } from 'aws-cdk-lib/aws-ecs-patterns';
import {
  CfnSubnet,
  FlowLog,
  FlowLogDestination,
  FlowLogResourceType,
  IInterfaceVpcEndpointService,
  InterfaceVpcEndpoint,
  InterfaceVpcEndpointAwsService,
  ISecurityGroup,
  InstanceClass,
  InstanceSize,
  InstanceType,
  IVpc,
  Peer,
  Port,
  SecurityGroup,
  SubnetType,
  Vpc,
  VpcEndpointService,
  Instance,
} from 'aws-cdk-lib/aws-ec2';
import { CfnListener, Protocol, Protocol as ELBProtocol, SslPolicy } from 'aws-cdk-lib/aws-elasticloadbalancingv2';
import { Rule } from 'aws-cdk-lib/aws-events';
import { LambdaFunction } from 'aws-cdk-lib/aws-events-targets';
import { Key } from 'aws-cdk-lib/aws-kms';
import { App, aws_ec2, CfnOutput, Duration, RemovalPolicy, Stack, StackProps, Environment } from 'aws-cdk-lib';
import { LogGroup, RetentionDays } from 'aws-cdk-lib/aws-logs';
import { ARecord, PrivateHostedZone, RecordTarget, VpcEndpointServiceDomainName } from 'aws-cdk-lib/aws-route53';
import { BlockPublicAccess, Bucket, BucketEncryption, ObjectOwnership } from 'aws-cdk-lib/aws-s3';
import { Fn } from 'aws-cdk-lib';
import {
  getAutoscalingGroupName,
  getShardZoneName,
  getValidatorClusterName,
  getValidatorFleetClusterName,
  getValidatorHostName,
  ResourceName,
} from './constants/resource-names';
import { NETWORK_CONFIG } from './constants/network';
import { PUBLIC_KEYS_BASE64 } from './constants/keys';

import { BootNodeArtifactGenerator } from './constructs/bootnode-artifact-generator';
import { DLMPolicy } from './constructs/dlm-policy';
import { GenesisGenerator } from './constructs/genesis-generator';
import { InstanceLaunchHook } from './constructs/instance-launch-hook';
import { InstanceTerminationHook } from './constructs/instance-termination-hook';
import { ValidatorInfoTable } from './constructs/validator-info-table';
import { ValidatorInfoTableEntries } from './constructs/validator-info-table-entries';
import { ValidatorECCKeySet } from './constructs/validator-ecc-keyset';

import { getASGAvailabilityZones, getServiceAvailabilityZones } from './constants/availability-zones';
import {
  BESU_IMAGE_TAG,
  CHAIN_CONFIG,
  CLIENT_CONFIG,
} from './constants/besu';
import {
  EC2_DATA_DIR,
  NLB_HEALTH_CHECK_GRACE_PERIOD,
  NLB_HEALTH_CHECK_INTERVAL,
} from './constants/ecs';
import { EC2DefaultPolicy } from './constants/iam-utils';
import { NodeType } from './constants/node-type';

import { getUserData } from './helper/ec2-helper';
import { getBootnodesFileName, getGenesisFileName } from './helper/genesis-helper';
import { NagSuppressions } from 'cdk-nag';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as path from 'path';
import { HostedZone } from 'aws-cdk-lib/aws-route53';

export interface ValidatorFleetInfrastructureProps extends StackProps {
  readonly stage: string;
  readonly shardId: string;
  readonly allowedPrincipals: ArnPrincipal[];
  readonly imageProviderAccount: string;
  readonly fleetVpc: IVpc;
  readonly fleetSecurityGroup: SecurityGroup;
  readonly fleetConfigBucket: Bucket;
  readonly env: Environment;
}

export class ValidatorFleetInfrastructure extends Stack {
  public static readonly STACK_NAME = 'PrivateChainValidatorFleet';
  private validatorKeyTable: ValidatorInfoTable;
  private ValidatorECCKeySet: ValidatorECCKeySet;
  public readonly shardId: string;

  private vpc: IVpc;

  private ecsCluster: Cluster;

  private validatorSecurityGroup: SecurityGroup;
  private validatorVPCEService: VpcEndpointService;

  private vpcEndpointSecurityGroup: ISecurityGroup;

  private validatorEc2TaskDefinition: Ec2TaskDefinition;

  private ddbEntries: ValidatorInfoTableEntries;

  private asgCapacityProvider: AsgCapacityProvider;

  private launchHookEventRule: Rule;

  private terminationHookEventRule: Rule;

  private validatorHostedZone: PrivateHostedZone;

  private configBucket: Bucket;

  private stage: string;

  private validatorServiceDomainName: string;

  private ecsService: NetworkLoadBalancedEc2Service;
  private validatorEcsService: NetworkLoadBalancedEc2Service;

  private dlmPolicy: DLMPolicy;

  private validatorASG: BlockchainNodeASG;

  private dlmPolicyResource: AwsCustomResource;

  private privateChainValidatorInfoTableKey: Key;
  private ebsVolumeEncryptionKey: Key;
  private numValidators: number;

  region: string;

  constructor(scope: App, id: string, props: ValidatorFleetInfrastructureProps) {
    super(scope, id, props);
    this.shardId = props.shardId;
    this.stage = props.stage;
    this.region = props.env.region ?? 'us-east-1';
    const stackAccount = props.env.account ?? '';

    this.vpc = props.fleetVpc;
    this.configBucket = props.fleetConfigBucket;
    this.validatorSecurityGroup = props.fleetSecurityGroup;

    this.numValidators = process.env.NUM_VALIDATORS ? parseInt(process.env.NUM_VALIDATORS) : PUBLIC_KEYS_BASE64.length;
    if (this.numValidators != PUBLIC_KEYS_BASE64.length && !process.env.FIRST_DEPLOY) {
      console.error('Number of Public Keys does not match desired Number of Validators.');
      console.error('Please correct this by adding or removing public keys in the file /lib/constants/keys.ts');
      throw new Error('Invalid Configuration.');
    }

    this.createEncryptionKeys();

    this.createDDB();
    this.createKMSKeysAndRoles();
    this.createGenesis(stackAccount);

    this.createBootNodeArtifacts(stackAccount);

    this.createSnapshotManagement();

    this.createValidatorDNS();

    this.createECSCluster(props.imageProviderAccount);
    this.createASGInstanceLaunchHook(stackAccount);
    this.createASGInstanceTerminationHook(stackAccount);
    this.createASG();
    this.createVPCEndpointService(props.allowedPrincipals);
    NagSuppressions.addStackSuppressions(this, [
      {
        id: 'AwsSolutions-SMG4',
        reason: 'The validator to key mapping will remain constant throughout the life of the blockchain unless the customer chooses to rotate keys/validators, which is possible with manual work on the customer’s side but is beyond the scope of this node runners project.',
      },
      {
        id: 'AwsSolutions-ELB2',
        reason: 'Access logs are configured to be stored in an S3 bucket.',
      },
      {
        id: 'AwsSolutions-AS3',
        reason: 'When the ASG launches a new validator, an ASG lifecycle hook will make a call to an AWS Lambda function which will assign one of the available keys to this new validator. The Lambda function will also assign the IAM role required to make use of this key to this new validator. The Auto Scaling group is configured to run a maximum of 3 instances, but it is possible to increase this and extend the Lambdas functionality to incorporate a notification.',
      },
      {
        id: 'AwsSolutions-IAM4',
        reason: 'AWS managed policies are used to provide the necessary permissions for the validator nodes to interact with other AWS services within the isolated VPC environment.',
      },
      {
        id: 'AwsSolutions-ECS2',
        reason: 'The environment variables in the task definition are used to configure the Besu client running in the validator nodes. These variables do not contain sensitive information and are necessary for the proper operation of the private blockchain.',
      },
      {
        id: 'AwsSolutions-L1',
        reason: 'The Lambda function is used for a specific purpose within the deployment and has been tested with the current runtime version. Upgrading to the latest runtime may introduce compatibility issues and is not recommended for this deployment.',
      },
      {
        id: 'AwsSolutions-IAM5',
        reason: 'Wildcard permissions are required to provide flexibility for managing dynamically created resources during Auto Scaling operations, encryption key re-encryption across multiple KMS keys, and interaction with S3 buckets for artifact management, while IAM roles are scoped to specific principals and resource tags to mitigate potential security risks.',
      },
      {
        id: 'AwsSolutions-EC23',
        reason: 'This security group rule is intentionally permissive to allow essential peer-to-peer communication within the validator node fleet. It enables necessary data synchronization, consensus mechanisms, and other critical operations for the blockchain network. The rule is restricted to internal communication between validator nodes and does not expose the system to external threats.',
      },
      {
        id: 'AwsSolutions-SNS2',
        reason: 'Encryption not required for this SNS topic'
      },
      {
        id: 'AwsSolutions-SNS3',
        reason: 'SSL not required for this SNS topic'
      }
    ]);
  }

  private createEncryptionKeys(): void {
    // DynamoDB keys
    this.privateChainValidatorInfoTableKey = new Key(this, 'PrivateChainValidatorInfoTableKey', {
      alias: 'PrivateChainValidatorInfoTableKey',
      description: 'KMS Key for Private Chain validator key DynamoDB table.',
      enableKeyRotation: true,
      removalPolicy: RemovalPolicy.DESTROY,
    });


    // S3 keys
    const privateChainValidatorInfrastructureS3BucketKey = new Key(
      this,
      'PrivateChainValidatorInfrastructureS3BucketKey',
      {
        alias: 'PrivateChainValidatorInfrastructureS3BucketKey',
        description: 'KMS Key for Private Chain validator node infrastructure buckets',
        enableKeyRotation: true,
        removalPolicy: RemovalPolicy.DESTROY,
      },
    );

    // EBS volume keys
    this.ebsVolumeEncryptionKey = new Key(this, 'PrivateChainEbsVolumeEncryptionKey', {
      alias: 'PrivateChainEbsVolumeEncryptionKey',
      description: 'KMS Key for Private Chain EBS volume encryption.',
      enableKeyRotation: true,
      removalPolicy: RemovalPolicy.DESTROY,
    });
  }

  private createDDB(): void {
    this.validatorKeyTable = new ValidatorInfoTable(this, ResourceName.Table.ValidatorKeys, {
      shardId: this.shardId,
      encryptionKey: this.privateChainValidatorInfoTableKey,
    });
  }

  private createGenesis(serviceAccount: string): void {
    const genesisGenerator = new GenesisGenerator(this, 'GenesisGenerator', {
      resourcePrefix: 'Validator',
      serviceAccount: serviceAccount,
      region: this.region,
      shardId: this.shardId,
      configBucket: this.configBucket,
      validatorKeySet: this.ValidatorECCKeySet,
      version: process.env.FIRST_DEPLOY ? 0 : 1
    });
  }

  private createBootNodeArtifacts(serviceAccount: string): void {
    const bootNodeArtifactGenerator = new BootNodeArtifactGenerator(this, 'BootNodeArtifactGenerator', {
      resourcePrefix: 'Validator',
      serviceAccount: serviceAccount,
      region: this.region,
      shardId: this.shardId,
      configBucket: this.configBucket,
      validatorKeySet: this.ValidatorECCKeySet,
      version: process.env.FIRST_DEPLOY ? 0 : 1
    });
  }

  private createKMSKeysAndRoles() {
    // Create KMS Keys and associated Roles.
    this.ValidatorECCKeySet = new ValidatorECCKeySet(this, `kms-keyset`, {
      numberOfKeys: this.numValidators,
      region: this.region,
      stage: this.stage,
      namePrefix: `Shard-${this.shardId}-`,
      retainRoles: false,
    });

    for (const role of this.ValidatorECCKeySet.getAllRoles()) {
      // Grant all roles DDB read access.
      this.validatorKeyTable.table.grantReadData(role);
      this.grantAccessToDeploymentBucket(role);
    }
    // Sync all roles and kms keys with entries in the DDB table.
    this.ddbEntries = new ValidatorInfoTableEntries(this, `key-ddb-rows`, {
      ValidatorECCKeys: this.ValidatorECCKeySet,
      tableArn: this.validatorKeyTable.table.tableArn,
      tableName: this.validatorKeyTable.tableName,
      safeDelete: false,
      validatorKeyTableEncryptionKey: this.privateChainValidatorInfoTableKey,
    });
  }

  private createValidatorDNS() {
    const zoneName = getShardZoneName(this.shardId);
    this.validatorHostedZone = new PrivateHostedZone(this, 'ValidatorDNSHostedZone', {
      zoneName: zoneName,
      vpc: this.vpc,
    });

    for (const keyNumber of this.ValidatorECCKeySet.eccKeys.keys()) {
      new ARecord(this, 'AliasRecord' + keyNumber, {
        zone: this.validatorHostedZone,
        // Format has to match lifecycle hook.
        recordName: getValidatorHostName(this.shardId, keyNumber),
        // Target cannot be empty. LifeCycle Launch Hook will UPSERT into this target
        // with a value corresponding to the IP address of the instance.
        target: RecordTarget.fromIpAddresses('127.0.0.1'),
      });
    }
    // Lambda function to delete Route 53 records in the hosted zone
    const cleanupFunction = new lambda.Function(this, 'HostedZoneCleanupFunction', {
      runtime: lambda.Runtime.PYTHON_3_9,
      handler: 'index.handler',
      code: lambda.Code.fromAsset(path.join(__dirname, './lambda-functions/cleanup')),  // Path to Lambda code
      environment: {
        HOSTED_ZONE_ID: this.validatorHostedZone.hostedZoneId,
      },
    });

    // Add IAM policy for Route 53 access
    cleanupFunction.addToRolePolicy(new PolicyStatement({
      actions: ['route53:ListResourceRecordSets', 'route53:ChangeResourceRecordSets'],
      resources: [`arn:aws:route53:::hostedzone/${this.validatorHostedZone.hostedZoneId}`],
    }));

    // Custom resource to trigger the cleanup function during stack deletion
    new AwsCustomResource(this, 'HostedZoneCleanupResource', {
      policy: AwsCustomResourcePolicy.fromStatements([
        new PolicyStatement({
          actions: ['lambda:InvokeFunction'],
          resources: [cleanupFunction.functionArn],
        }),
      ]),
      onDelete: {
        service: 'Lambda',
        action: 'invoke',
        parameters: {
          FunctionName: cleanupFunction.functionName,
          Payload: JSON.stringify({}),
        },
        physicalResourceId: PhysicalResourceId.of('HostedZoneCleanupTrigger'),
      },
    });
  }

  private createECSCluster(imageProviderAccount: string): void {
    // ECS Cluster
    this.ecsCluster = new Cluster(this, `ecs-cluster`, {
      vpc: this.vpc,
      clusterName: getValidatorClusterName(this.shardId),
      containerInsights: true,
    });
    // Makes it easier to destroy / recreate stack.
    this.ecsCluster.applyRemovalPolicy(RemovalPolicy.DESTROY);

    const mountVolumeName = 'data-volume-0';

    const taskExecutionRole = new Role(this, `Shard-${this.shardId}-taskExecutionRole`, {
      assumedBy: new ServicePrincipal('ecs-tasks.amazonaws.com'),
      roleName: `Shard-${this.shardId}-taskExecutionRole`,
    });

    taskExecutionRole.addManagedPolicy(
      ManagedPolicy.fromAwsManagedPolicyName('service-role/AmazonECSTaskExecutionRolePolicy'),
    );

    this.validatorEc2TaskDefinition = new Ec2TaskDefinition(this, 'ecstask', {
      networkMode: NetworkMode.HOST,
      executionRole: taskExecutionRole,
      volumes: [{ name: mountVolumeName, host: { sourcePath: EC2_DATA_DIR } }],
    });

    //Ec2TaskDefinition layer 2 construct automatically creates a role if no role is provided
    //This modifies the underlying layer 1 construct to set taskRole = none so task can use ec2 instance role
    const cfnTaskDef = this.validatorEc2TaskDefinition.node.defaultChild as CfnTaskDefinition;
    cfnTaskDef.taskRoleArn = '';

    const logGroup = new LogGroup(this, `Shard-${this.shardId}-Besu-LogGroup`, {
      logGroupName: `Shard-${this.shardId}-Besu-LogGroup`,
      removalPolicy: RemovalPolicy.DESTROY,
    });

    const baseCommand = this.getBesuCommand();
    const command = this.addApplicableDebugFlags(baseCommand);

    const container = this.validatorEc2TaskDefinition.addContainer('container', {
      image: ContainerImage.fromRegistry(
        `${imageProviderAccount}.dkr.ecr.${this.region}.amazonaws.com/besu:${BESU_IMAGE_TAG}`,
      ),
      memoryLimitMiB: process.env.BESU_MEMORY_LIMIT_GB ? parseInt(process.env.BESU_MEMORY_LIMIT_GB) * 1000 : 12000,
      containerName: `blockchain-service-shard-${this.shardId}`,
      command: command,
      environment: {
        BESU_NETWORK_ID: '' + (CHAIN_CONFIG.DEFAULT_NETWORK_ID + parseInt(this.shardId) - 1),
        BESU_RPC_HTTP_CORS_ORIGINS: 'all',
        BESU_RPC_HTTP_ENABLED: 'true',
        BESU_RPC_HTTP_HOST: '0.0.0.0',
        BESU_HOST_ALLOWLIST: '*',
        OTEL_EXPORTER_OTLP_ENDPOINT: `http://localhost:${CLIENT_CONFIG.OTEL_PORT}`,
        // CloudWatch does not provide an HTTPS endpoint for OTEL.
        OTEL_EXPORTER_OTLP_INSECURE: 'true',
        OTEL_EXPORTER_OTLP_PROTOCOL: 'grpc',
        OTEL_METRIC_EXPORT_INTERVAL: '15000',
        OTEL_TRACES_SAMPLER: 'always_off',
      },
      logging: LogDriver.awsLogs({
        logGroup: logGroup,
        streamPrefix: 'ChainLogs',
      }),
      portMappings: [
        {
          containerPort: CLIENT_CONFIG.HTTP_RPC_PORT,
          hostPort: CLIENT_CONFIG.HTTP_RPC_PORT,
          protocol: ECSProtocol.TCP,
        },
        {
          containerPort: CLIENT_CONFIG.DISCOVERY_PORT,
          hostPort: CLIENT_CONFIG.DISCOVERY_PORT,
          protocol: ECSProtocol.TCP,
        },
        {
          containerPort: CLIENT_CONFIG.DISCOVERY_PORT,
          hostPort: CLIENT_CONFIG.DISCOVERY_PORT,
          protocol: ECSProtocol.UDP,
        },
      ],
    });
    container.addMountPoints({
      containerPath: CLIENT_CONFIG.DATA_DIR,
      sourceVolume: mountVolumeName,
      readOnly: false,
    });
  }

  private getBesuCommand(): string[] {
    return [
      `--data-path=${CLIENT_CONFIG.DATA_DIR}`,
      `--genesis-file=${CLIENT_CONFIG.CONFIG_DIR}/${CLIENT_CONFIG.GENESIS_FILE_NAME}`,
      `--static-nodes-file=${CLIENT_CONFIG.CONFIG_DIR}/${CLIENT_CONFIG.BOOTNODES_FILE_NAME}`,
      '--Xdns-enabled=true',
      `--p2p-port=${CLIENT_CONFIG.DISCOVERY_PORT}`,
      '--rpc-http-enabled=true',
      `--rpc-http-port=${CLIENT_CONFIG.HTTP_RPC_PORT}`,
      `--rpc-http-api=${process.env.ALLOWED_RPC_APIS ?? CLIENT_CONFIG.DEFAULT_ALLOWED_RPCS}`,
      '--rpc-http-cors-origins=all',
      '--logging=INFO',
      '--min-gas-price=0',
      `--node-private-key-file=${CLIENT_CONFIG.CONFIG_DIR}/${CLIENT_CONFIG.PRIVATE_KEY_FILE_NAME}`,
      '--metrics-enabled',
      '--metrics-protocol=opentelemetry',
      `--rpc-http-max-active-connections=${CLIENT_CONFIG.MAX_CONNECTIONS}`
    ];
  }

  private addApplicableDebugFlags(command: string[]): string[] {
    return [...command, '--revert-reason-enabled=true'];
  }

  private grantAccessToDeploymentBucket(role: Role): void {
    const fleetConfigBucketArn = Fn.importValue('FleetConfigBucketArn');
    const kmsKeyArn = Fn.importValue('S3BucketKeyArn');
    // Grant access to deployment bucket to get assets (e.g. lambdas)
    role.addToPolicy(
      new PolicyStatement({
        effect: Effect.ALLOW,
        actions: ['s3:GetObject', 's3:ListBucket'],
        resources: [
          // Scoped down to deployment bucket only.
          fleetConfigBucketArn,
        ],
      }),
    );

    // Grant access to decrypt kms key for deployment bucket
    role.addToPolicy(
      new PolicyStatement({
        effect: Effect.ALLOW,
        actions: [
          'kms:DescribeKey',
          'kms:Encrypt',
          'kms:Decrypt',
          'kms:ReEncrypt*',
          'kms:GenerateDataKey',
          'kms:GenerateDataKeyWithoutPlaintext',
        ],
        // Scoped down to deployment-bucket KMS key only.
        resources: [kmsKeyArn],
      }),
    );
  }

  private createASG(): void {
    const asgName = getAutoscalingGroupName(this.shardId);
    const defaultInstanceRole = new Role(this, `validator-instance-role`, {
      assumedBy: new ServicePrincipal('ec2.amazonaws.com'),
      roleName: `${asgName}-ValidatorDefaultRole`,
      inlinePolicies: EC2DefaultPolicy,
    });

    defaultInstanceRole.addManagedPolicy(ManagedPolicy.fromAwsManagedPolicyName('CloudWatchLogsFullAccess'));
    defaultInstanceRole.addManagedPolicy(ManagedPolicy.fromAwsManagedPolicyName('AmazonSSMManagedInstanceCore'));
    defaultInstanceRole.addManagedPolicy(ManagedPolicy.fromAwsManagedPolicyName('CloudWatchAgentServerPolicy'));

    this.grantAccessToDeploymentBucket(defaultInstanceRole);
    const validatorNumber = process.env.FIRST_DEPLOY ? 0 : PUBLIC_KEYS_BASE64.length;

    const validatorASG = new BlockchainNodeASG(this, ResourceName.ASG.Validators, {
      resourcePrefix: ResourceName.ASG.Validators,
      userData: getUserData(
        this.ecsCluster.clusterName,
        this.stackName,
        this.region,
        ResourceName.ASG.ValidatorASGLogicalId,
        NodeType.VALIDATOR,
      ),
      asgSizeConfiguration: {
        minCapacity: validatorNumber,
        desiredCapacity: validatorNumber,
        maxCapacity: validatorNumber,
      },
      deploymentProps: {
        CFN_SIGNAL_MIN_SUCCESS_PERCENTAGE: 100,
        CFN_SIGNAL_TIMEOUT_DURATION: Duration.minutes(15),
        MIN_INSTANCES_IN_SERVICE_DURING_DEPLOYMENT: 0,
        ROLLING_UPDATE_MAX_BATCH_SIZE: 1,
      },
      vpc: this.vpc,
      name: asgName,
      securityGroup: this.validatorSecurityGroup,
      availabilityZones: getASGAvailabilityZones(this.stage, this.region),
      blockchainNodeProps: {
        instanceType: process.env.VALIDATOR_INSTANCE_TYPE ?
          new InstanceType(process.env.VALIDATOR_INSTANCE_TYPE) :
          InstanceType.of(InstanceClass.C7G, InstanceSize.XLARGE2),
        rootVolumeSizeInGB: 42,
        defaultInstanceRole: defaultInstanceRole,
      },
      asgLogicalId: ResourceName.ASG.ValidatorASGLogicalId,
    });

    // Update the KMS keys in DDB before manipulating the ASG.
    validatorASG.node.addDependency(this.ddbEntries);
    validatorASG.node.addDependency(this.ValidatorECCKeySet);
    // Hooks need to be ready before instance launch/termination during Asg creation
    validatorASG.node.addDependency(this.launchHookEventRule);
    validatorASG.node.addDependency(this.terminationHookEventRule);

    // TODO : cfn-signal permissions?
    defaultInstanceRole.addToPolicy(
      new PolicyStatement({
        actions: ['cloudformation:Describe*', 'cloudformation:SignalResource'],
        effect: Effect.ALLOW,
        resources: [this.stackId],
      })
    );

    this.asgCapacityProvider = new AsgCapacityProvider(this, 'capacity-provider', {
      autoScalingGroup: validatorASG.asg,
      canContainersAccessInstanceRole: true,
      enableManagedScaling: false, // Managed Scaling disabled as each daemon task runs on its own EC2 instance. ASG is set to a fixed capacity of 4 (min/max), but this can be adjusted for scalability.
      enableManagedTerminationProtection: false
    });
    this.ecsCluster.addAsgCapacityProvider(this.asgCapacityProvider, {
      canContainersAccessInstanceRole: true,
    });
    this.validatorASG = validatorASG;
  }


  private createVPCEndpointService(allowedPrincipals: ArnPrincipal[]) {
    this.ecsService = new NetworkLoadBalancedEc2Service(this, `blockchain-service`, {
      cluster: this.ecsCluster,
      taskDefinition: this.validatorEc2TaskDefinition,
      listenerPort: CLIENT_CONFIG.HTTP_RPC_PORT,
      serviceName: `besu-privatechain-shard-${this.shardId}`,
      placementConstraints: [PlacementConstraint.distinctInstances()],
      publicLoadBalancer: false,
      // Settings to allow for one task at a time only deploys.
      //minHealthyPercent: Math.floor((100 * (this.ValidatorECCKeySet.size() - 1)) / this.ValidatorECCKeySet.size()) - 1,
      maxHealthyPercent: 100,
      // Max period NLB tolerates failed health checks during startup.
      // Note: this is not applicable after startup.
      healthCheckGracePeriod: Duration.seconds(NLB_HEALTH_CHECK_GRACE_PERIOD),
      circuitBreaker: { rollback: false },
    });
    this.ecsService.node.addDependency(this.validatorASG);
    this.ecsService.targetGroup.healthCheck = {
      interval: Duration.seconds(NLB_HEALTH_CHECK_INTERVAL),
      // https://besu.hyperledger.org/stable/public-networks/how-to/use-besu-api/json-rpc?h=liveness#liveness
      path: '/liveness',
      port: CLIENT_CONFIG.HTTP_RPC_PORT + '',
      protocol: Protocol.HTTP,
      healthyHttpCodes: '200',
    };

    // NetworkLoadBalancedEc2Service doesn't provide a way to set the scheduling strategy to daemon,
    // so do it manually via escape hatches
    const cfnService = this.ecsService.service.node.defaultChild as CfnService;
    cfnService.schedulingStrategy = 'DAEMON';

    // NetworkLoadBalancedEc2Service doesn't provide a way to remove the default listener.
    const cfnListener = this.ecsService.listener.node.defaultChild as CfnListener;
    cfnListener.protocol = ELBProtocol.TCP;
    cfnListener.port = 80; // NETWORK_CONFIG.TLS_PORT;

    // TODO : Add cert, make it configurable. 
    // cfnListener.sslPolicy = SslPolicy.RECOMMENDED_TLS;
    // cfnListener.certificates = [{ certificateArn: cert.certificateArn }];

    const vpcEndpointService = new VpcEndpointService(this, 'VPCEndpointService', {
      vpcEndpointServiceLoadBalancers: [this.ecsService.loadBalancer],
      acceptanceRequired: false,
      allowedPrincipals: allowedPrincipals,
    });

    // TODO : Integrate configurable DNS.
    /*
    const vpcEndpointServicePrivateDNS = new VpcEndpointServiceDomainName(this, 'EndpointDomain', {
      endpointService: this.vpcEndpointService,
      domainName: this.serviceDomainName,
      // TODO : Make Hosted Zone configurable.
      publicHostedZone: <TBD>,
    });
    */
  }

  private createASGInstanceLaunchHook(serviceAccount: string) {
    // Configure instance launch hook
    const instanceLaunchHook = new InstanceLaunchHook(this, `ValidatorInstanceLaunchHook`, {
      resourcePrefix: 'Validator',
      region: this.region,
      serviceAccount: serviceAccount,
      tableName: this.validatorKeyTable.tableName,
      shardId: this.shardId,
      autoScalingGroupName: getAutoscalingGroupName(this.shardId),
      hostedZone: this.validatorHostedZone,
      s3BucketName: this.configBucket.bucketName,
      genesisFileName: getGenesisFileName(this.ValidatorECCKeySet.keys().map(String)),
      bootnodesFileName: getBootnodesFileName(this.ValidatorECCKeySet.keys().map(String)),
      ebsEncryptionKeyArn: this.ebsVolumeEncryptionKey.keyArn,
    });

    this.launchHookEventRule = new Rule(this, 'LaunchEventRule', {
      ruleName: 'ValidatorLaunchEventRule' + this.shardId,
      eventPattern: {
        source: ['aws.autoscaling'],
        detail: {
          LifecycleTransition: ['autoscaling:EC2_INSTANCE_LAUNCHING'],
          AutoScalingGroupName: [getAutoscalingGroupName(this.shardId)],
        },
      },
    });

    this.launchHookEventRule.addTarget(new LambdaFunction(instanceLaunchHook.lambda));
    instanceLaunchHook.lambda.grantInvoke(new ServicePrincipal('events.amazonaws.com'));
  }

  private createASGInstanceTerminationHook(serviceAccount: string) {
    // Configure instance termination hook
    const instanceTerminationHook = new InstanceTerminationHook(this, `ValidatorInstanceTerminationHook`, {
      resourcePrefix: 'Validator',
      region: this.region,
      serviceAccount: serviceAccount,
      tableName: this.validatorKeyTable.tableName,
      shardId: this.shardId,
      autoScalingGroupName: getAutoscalingGroupName(this.shardId),
    });

    this.terminationHookEventRule = new Rule(this, 'TerminationEventRule', {
      ruleName: 'ValidatorTerminationEventRule' + this.shardId,
      eventPattern: {
        source: ['aws.autoscaling'],
        detail: {
          LifecycleTransition: ['autoscaling:EC2_INSTANCE_TERMINATING'],
          AutoScalingGroupName: [getAutoscalingGroupName(this.shardId)],
        },
      },
    });

    this.terminationHookEventRule.addTarget(new LambdaFunction(instanceTerminationHook.lambda));
    instanceTerminationHook.lambda.grantInvoke(new ServicePrincipal('events.amazonaws.com'));
  }

  private createSnapshotManagement() {
    const targetTag = {
      key: ResourceName.ASG.NameTagKey,
      value: `${this.stackName}/${ResourceName.ASG.Validators}/${ResourceName.ASG.Validators}-${ResourceName.LaunchTemplate.Name}`,
    };

    // Policy that takes snapshots every so often.
    this.dlmPolicy = new DLMPolicy(this, 'validatorDLMPolicyAndRoles', {
      targetTag: targetTag,
      stage: this.stage,
      region: this.region as string,
      shardId: this.shardId,
    });

    const targetTagSearch = `${targetTag.key}=${targetTag.value}`;
    const physicalResourceId = 'dlmPolicyIdFetcher';

    this.dlmPolicyResource = new AwsCustomResource(this, 'policyIdFetch', {
      policy: AwsCustomResourcePolicy.fromStatements([
        new PolicyStatement({
          actions: ['dlm:GetLifecyclePolicies'],
          effect: Effect.ALLOW,
          resources: ['*'],
        }),
      ]),
      onCreate: {
        service: 'DLM',
        action: 'getLifecyclePolicies',
        parameters: {
          TargetTags: [targetTagSearch],
        },
        physicalResourceId: PhysicalResourceId.of(physicalResourceId),
      },
      onUpdate: {
        service: 'DLM',
        action: 'getLifecyclePolicies',
        parameters: {
          TargetTags: [targetTagSearch],
        },
        physicalResourceId: PhysicalResourceId.of(physicalResourceId),
      },
    });

    this.dlmPolicyResource.node.addDependency(this.dlmPolicy);
  }

  /**
   * Return the policyId from the response within the dlmPolicyResource custom resource
   */
  public getDlmPolicyId(): string {
    return this.dlmPolicyResource.getResponseField('Policies.0.PolicyId');
  }

  /**
   * Override this method in DeploymentStack to deploy to more than 3 AZs.
   */
  public get availabilityZones(): string[] | never {
    return getServiceAvailabilityZones(this.stage, this.region);
  }

  public getServiceName(): string {
    return this.validatorVPCEService.vpcEndpointServiceName;
  }

  public getServiceEndpoint(): string {
    return `https://${this.validatorServiceDomainName}`;
  }

  public getServicePort(): number {
    return NETWORK_CONFIG.TLS_PORT;
  }

  public getEcsService(): NetworkLoadBalancedEc2Service {
    return this.validatorEcsService;
  }
}
