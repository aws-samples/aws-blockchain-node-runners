import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as s3deploy from 'aws-cdk-lib/aws-s3-deployment';
import { SingleNodeConstruct, SingleNodeConstructCustomProps } from "../../constructs/single-node"
import * as fs from 'fs';
import * as path from 'path';
import * as nag from "cdk-nag";
import * as iam from "aws-cdk-lib/aws-iam";
import * as configTypes from "../../constructs/config.interface";
import * as nodeCwDashboard from "./assets/node-cw-dashboard"
import * as cw from 'aws-cdk-lib/aws-cloudwatch';

interface AlloraStackEnvironment extends cdk.Environment {
  account: string;
  region: string;
}

export interface AlloraStackProps extends cdk.StackProps {
  instanceType: string;
  vpcMaxAzs: number;
  vpcNatGateways: number
  vpcSubnetCidrMask: number;
  resourceNamePrefix: string;
  dataVolume: configTypes.DataVolumeConfig;
  env: AlloraStackEnvironment
  alloraWorkerName: string;
  alloraEnv: string;
  modelRepo: string;
  modelEnvVars: string;

  alloraWalletAddressKeyName: string;
  alloraWalletAddressRestoreMnemonic: string;
  alloraWalletHomeDir: string;
  alloraWalletGas: string,
  alloraWalletGasAdjustment: string;

  alloraWalletGasPrices: string;
  alloraWalletGasPriceInterval: string;
  alloraWalletRetryDelay: string;
  alloraWalletBlockDurationEstimated: string;
  alloraWalletWindowCorrectionFactor: string;
  alloraWalletMaxFees: string;
  alloraWalletAccountSequenceRetryDelay: string;

  alloraWalletNodeRpc: string;
  alloraWalletMaxRetries: string;
  alloraWalletDelay: string;
  alloraWalletSubmitTx: string;

  alloraWorkerTopicId: string;
  alloraWorkerInferenceEntrypointName: string;
  alloraWorkerInferenceEndpoint: string;
  alloraWorkerLoopSeconds: string;
  alloraWorkerToken: string;

  alloraReputerTopicId: string;
  alloraReputerEntrypointName: string;
  alloraReputerSourceOfTruthEndpoint: string;
  alloraReputerLoopSeconds: string;
  alloraReputerToken: string;
  alloraReputerMinStake: string;

  alloraReputerLossFunctionService: string;
  alloraReputerLossMethodOptionsLossMethod: string;
}


export class AlloraStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: AlloraStackProps) {
    super(scope, id, props);

    const {
      env, 
      instanceType, 
      resourceNamePrefix, 
      dataVolume, 
      alloraWorkerName, 
      alloraEnv,
      modelRepo,
      modelEnvVars,

      //wallet props
      alloraWalletAddressKeyName,
      alloraWalletAddressRestoreMnemonic,
      alloraWalletHomeDir,
      alloraWalletGas,
      alloraWalletGasAdjustment,

      alloraWalletGasPrices,
      alloraWalletGasPriceInterval,
      alloraWalletRetryDelay,
      alloraWalletBlockDurationEstimated,
      alloraWalletWindowCorrectionFactor,
      alloraWalletMaxFees,
      alloraWalletAccountSequenceRetryDelay,

      alloraWalletNodeRpc,
      alloraWalletMaxRetries,
      alloraWalletDelay,
      alloraWalletSubmitTx,

      //worker props
      alloraWorkerTopicId,
      alloraWorkerInferenceEntrypointName,
      alloraWorkerInferenceEndpoint,
      alloraWorkerLoopSeconds,
      alloraWorkerToken,

      //reputer props
      alloraReputerTopicId,
      alloraReputerEntrypointName,
      alloraReputerSourceOfTruthEndpoint,

      alloraReputerLossFunctionService,
      alloraReputerLossMethodOptionsLossMethod,

      alloraReputerLoopSeconds,
      alloraReputerToken,
      alloraReputerMinStake,
    } = props;
    const { region } = env;

    const STACK_NAME = cdk.Stack.of(this).stackName;
    const STACK_ID = cdk.Stack.of(this).stackId;

    

    // Create S3 Bucket
    const bucket = new s3.Bucket(this, `${resourceNamePrefix}Bucket`, {
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
    });

    // Upload node.sh to S3
    new s3deploy.BucketDeployment(this, `${resourceNamePrefix}ScriptDeployment`, {
      sources: [s3deploy.Source.asset(path.join(__dirname, 'assets', 'user-data'))],
      destinationBucket: bucket,
      destinationKeyPrefix: 'user-data', // optional prefix in destination bucket
    });

    // Create VPC
    const vpc = new ec2.Vpc(this, `${resourceNamePrefix}Vpc`, {
      maxAzs: props.vpcMaxAzs,
      natGateways: props.vpcNatGateways,
      subnetConfiguration: [{
        cidrMask: props.vpcSubnetCidrMask,
        name:`${resourceNamePrefix}PublicSubnet`,
        subnetType: ec2.SubnetType.PUBLIC,
      }]
    });

    // Security Group with inbound TCP port 9010 open
    const securityGroup = new ec2.SecurityGroup(this, `${resourceNamePrefix}SecurityGroup`, {
      vpc,
      allowAllOutbound: true,
      description: 'Allow inbound TCP 9010',
    });
    securityGroup.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(9010), 'Allow inbound TCP 9010');

     


    // Getting the snapshot bucket name and IAM role ARN from the common stack
    const importedInstanceRoleArn = cdk.Fn.importValue("EdgeNodeInstanceRoleArn");

    const instanceRole = iam.Role.fromRoleArn(this, "iam-role", importedInstanceRoleArn);

    // Making sure our instance will be able to read the assets
    bucket.grantRead(instanceRole);


    // Define SingleNodeConstructCustomProps
    const singleNodeProps: SingleNodeConstructCustomProps = {
      instanceName: `${resourceNamePrefix}Instance`,
      instanceType: new ec2.InstanceType(instanceType),
      dataVolumes: [ dataVolume ], // Define your data volumes here
      machineImage:new ec2.AmazonLinuxImage({
        generation: ec2.AmazonLinuxGeneration.AMAZON_LINUX_2023,
        kernel:ec2.AmazonLinuxKernel.KERNEL5_X,
        cpuType: ec2.AmazonLinuxCpuType.X86_64,
      }),
      role: instanceRole,
      vpc: vpc,
      securityGroup: securityGroup,
      availabilityZone: vpc.selectSubnets({ subnetType: ec2.SubnetType.PUBLIC }).availabilityZones[0],
      vpcSubnets: { subnetType: ec2.SubnetType.PUBLIC },
    };

    // Instantiate SingleNodeConstruct
    const singleNode = new SingleNodeConstruct(this, `${resourceNamePrefix}SingleNode`, singleNodeProps);

    const instance = singleNode.instance;

    // Read user data script and inject variables
    const userData = fs.readFileSync(path.join(__dirname, 'assets', 'user-data', 'node.sh')).toString();
    const modifiedUserData = cdk.Fn.sub(userData, {
      _AWS_REGION_: region,
      _ASSETS_S3_PATH_: `s3://${bucket.bucketName}/user-data/node.sh`,
      _NODE_CF_LOGICAL_ID_: singleNode.nodeCFLogicalId,
      _STACK_NAME_: STACK_NAME,
      _STACK_ID_: STACK_ID,
      _ALLORA_WORKER_NAME_: alloraWorkerName,
      _ALLORA_ENV_: alloraEnv,
      _MODEL_REPO_: modelRepo,
      _MODEL_ENV_VARS_: modelEnvVars,

      //wallet config
      _ALLORA_WALLET_ADDRESS_KEY_NAME_ : alloraWalletAddressKeyName,
      _ALLORA_WALLET_ADDRESS_RESTORE_MNEMONIC_ : alloraWalletAddressRestoreMnemonic, 
      _ALLORA_WALLET_HOME_DIR_: alloraWalletHomeDir,
      _ALLORA_WALLET_GAS_ADJUSTMENT_: alloraWalletGasAdjustment,
      _ALLORA_WALLET_GAS_: alloraWalletGas,

      _ALLORA_WALLET_GAS_PRICES_: alloraWalletGasPrices,
      _ALLORA_WALLET_GAS_PRICE_INTERVAL_: alloraWalletGasPriceInterval,
      _ALLORA_WALLET_RETRY_DELAY_: alloraWalletRetryDelay,
      _ALLORA_WALLET_BLOCK_DURATION_ESTIMATED_: alloraWalletBlockDurationEstimated,
      _ALLORA_WALLET_WINDOW_CORRECTION_FACTOR_: alloraWalletWindowCorrectionFactor,
      _ALLORA_WALLET_MAX_FEES_: alloraWalletMaxFees,
      _ALLORA_WALLET_ACCOUNT_SEQUENCE_RETRY_DELAY_: alloraWalletAccountSequenceRetryDelay,
      
      _ALLORA_WALLET_NODE_RPC_: alloraWalletNodeRpc,
      _ALLORA_WALLET_MAX_RETRIES_: alloraWalletMaxRetries,
      _ALLORA_WALLET_DELAY_: alloraWalletDelay,
      _ALLORA_WALLET_SUBMIT_TX_: alloraWalletSubmitTx,

      //worker config
      _ALLORA_WORKER_TOPIC_ID_: alloraWorkerTopicId,
      _ALLORA_WORKER_INFERENCE_ENTRYPOINT_NAME_: alloraWorkerInferenceEntrypointName,
      _ALLORA_WORKER_INFERENCE_ENDPOINT_: alloraWorkerInferenceEndpoint,
      _ALLORA_WORKER_LOOP_SECONDS_: alloraWorkerLoopSeconds,
      _ALLORA_WORKER_TOKEN_: alloraWorkerToken,

      //reputer config
      _ALLORA_REPUTER_TOPIC_ID_: alloraReputerTopicId,
      _ALLORA_REPUTER_ENTRYPOINT_NAME_: alloraReputerEntrypointName,
      _ALLORA_REPUTER_SOURCE_OF_TRUTH_ENDPOINT_: alloraReputerSourceOfTruthEndpoint,

      _ALLORA_REPUTER_LOSS_FUNCTION_SERVICE_: alloraReputerLossFunctionService,
      _ALLORA_REPUTER_LOSS_METHOD_OPTIONS_LOSS_METHOD_: alloraReputerLossMethodOptionsLossMethod,

      _ALLORA_REPUTER_LOOP_SECONDS_: alloraReputerLoopSeconds,
      _ALLORA_REPUTER_TOKEN_: alloraReputerToken,
      _ALLORA_REPUTER_MIN_STAKE_: alloraReputerMinStake,

      
    });

   // Create UserData for EC2 instance
   const ec2UserData = ec2.UserData.forLinux();
   ec2UserData.addCommands(modifiedUserData);

    instance.addUserData(ec2UserData.render())

    const dashboardString = cdk.Fn.sub(JSON.stringify(nodeCwDashboard.SyncNodeCWDashboardJSON()), {
      INSTANCE_ID: singleNode.instanceId,
      INSTANCE_NAME: `${resourceNamePrefix}Instance`,
      REGION: region,
    });

    new cw.CfnDashboard(this, 'single-cw-dashboard', {
      dashboardName: `AlloraStack-${singleNode.instanceId}`,
      dashboardBody: dashboardString,
    });

    new cdk.CfnOutput(this, "node-instance-id", {
      value: singleNode.instanceId,
    });

    // Elastic IP
    const eip = new ec2.CfnEIP(this, `${resourceNamePrefix}EIP`);
    new ec2.CfnEIPAssociation(this, `${resourceNamePrefix}EIPAssociation`, {
      eip: eip.ref,
      instanceId: singleNode.instanceId,
    });

    nag.NagSuppressions.addResourceSuppressions(
      this,
      [
          {
              id: "AwsSolutions-EC23",
              reason: "Inbound access from any IP is required for this application.",
          },
          {
              id: "AwsSolutions-IAM4",
              reason: "This IAM role requires broad permissions to function correctly.",
          },
          {
              id: "AwsSolutions-IAM5",
              reason: "Full access is needed for administrative tasks.",
          },
          {
              id: "AwsSolutions-S1",
              reason: "Server-side encryption is not required for this bucket.",
          },
          {
              id: "AwsSolutions-EC2",
              reason: "Unrestricted access is required for the instance to operate correctly.",
          },
          {
              id: "AwsSolutions-AS3",
              reason: "No notifications needed for this specific application.",
          },
          {
              id: "AwsSolutions-S2",
              reason: "Access logging is not necessary for this bucket.",
          },
          {
              id: "AwsSolutions-S10",
              reason: "HTTPS requirement is not needed for this bucket.",
          },
      ],
      true
  );
  }
}
