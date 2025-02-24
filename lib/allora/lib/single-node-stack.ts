import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as s3Assets from "aws-cdk-lib/aws-s3-assets";
import { SingleNodeConstruct } from "../../constructs/single-node"
import * as fs from 'fs';
import * as path from 'path';
import * as nag from "cdk-nag";
import * as iam from "aws-cdk-lib/aws-iam";
import * as configTypes from "../../constructs/config.interface";
import { NodeSecurityGroupConstruct } from "./constructs/node-security-group";
import * as nodeCwDashboard from "./constructs/node-cw-dashboard"
import * as cw from 'aws-cdk-lib/aws-cloudwatch';

interface AlloraStackEnvironment extends cdk.Environment {
  account: string;
  region: string;
}

export interface AlloraStackProps extends cdk.StackProps {
  instanceType: ec2.InstanceType;
  instanceCpuType: ec2.AmazonLinuxCpuType;
  resourceNamePrefix: string;
  dataVolumes: configTypes.DataVolumeConfig[];
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
      instanceCpuType,
      resourceNamePrefix,
      dataVolumes,
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
    const availabilityZones = cdk.Stack.of(this).availabilityZones;
    const chosenAvailabilityZone = availabilityZones.slice(0, 1)[0];

    // Using default VPC
    const vpc = ec2.Vpc.fromLookup(this, "vpc", { isDefault: true });

    // Setting up the security group for the node from Ethereum-specific construct
    const instanceSG = new NodeSecurityGroupConstruct (this, "security-group", {
          vpc: vpc,
      })
    
    // Making our scripts and configs from the local "assets" directory available for instance to download
    const asset = new s3Assets.Asset(this, "assets", {
          path: path.join(__dirname, "assets"),
      });

    // Getting the snapshot bucket name and IAM role ARN from the common stack
    const importedInstanceRoleArn = cdk.Fn.importValue("EdgeNodeInstanceRoleArn");

    const instanceRole = iam.Role.fromRoleArn(this, "iam-role", importedInstanceRoleArn);

    // Making sure our instance will be able to read the assets
    asset.bucket.grantRead(instanceRole);

    // Setting up the node using generic Single Node constract
    const node = new SingleNodeConstruct(this, "single-node", {
        instanceName: STACK_NAME,
        instanceType,
        dataVolumes: dataVolumes,
        machineImage:  new ec2.AmazonLinuxImage({
            generation: ec2.AmazonLinuxGeneration.AMAZON_LINUX_2023,
            kernel:ec2.AmazonLinuxKernel.KERNEL6_1,
            cpuType: instanceCpuType,
        }),
        vpc,
        availabilityZone: chosenAvailabilityZone,
        role: instanceRole,
        securityGroup: instanceSG.securityGroup,
        vpcSubnets: {
            subnetType: ec2.SubnetType.PUBLIC,
          },
      });

    const instance = node.instance;

    // Read user data script and inject variables
    const userData = fs.readFileSync(path.join(__dirname, 'assets', 'user-data-alinux.sh')).toString();
    const modifiedUserData = cdk.Fn.sub(userData, {
      _AWS_REGION_: region,
      _ASSETS_S3_PATH_: `s3://${asset.s3BucketName}/${asset.s3ObjectKey}`,
      _NODE_CF_LOGICAL_ID_: node.nodeCFLogicalId,
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

    instance.addUserData(modifiedUserData);

    const dashboardString = cdk.Fn.sub(JSON.stringify(nodeCwDashboard.SingleNodeCWDashboardJSON), {
      INSTANCE_ID: node.instanceId,
      INSTANCE_NAME: `${resourceNamePrefix}Instance`,
      REGION: region,
    });

    new cw.CfnDashboard(this, 'single-cw-dashboard', {
      dashboardName: `AlloraStack-${node.instanceId}`,
      dashboardBody: dashboardString,
    });

    new cdk.CfnOutput(this, "node-instance-id", {
      value: node.instanceId,
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
              id: "AwsSolutions-EC2",
              reason: "Unrestricted access is required for the instance to operate correctly.",
          },
      ],
      true
  );
  }
}
