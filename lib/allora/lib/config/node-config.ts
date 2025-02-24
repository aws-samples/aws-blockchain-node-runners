import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as configTypes from "./node-config.interface";
import * as constants from "../../../constructs/constants";


const parseDataVolumeType = (dataVolumeType: string) => {
    switch (dataVolumeType) {
        case "gp3":
            return ec2.EbsDeviceVolumeType.GP3;
        case "io2":
            return ec2.EbsDeviceVolumeType.IO2;
        case "io1":
            return ec2.EbsDeviceVolumeType.IO1;
        case "instance-store":
            return constants.InstanceStoreageDeviceVolumeType;
        default:
            return ec2.EbsDeviceVolumeType.GP3;
    }
}

export const baseConfig: configTypes.AlloraBaseConfig = {
    accountId: process.env.AWS_ACCOUNT_ID || "xxxxxxxxxxx",          // Set your target AWS Account ID
    region: process.env.AWS_REGION || "us-east-1",               // Set your target AWS Region
};

export const singleNodeConfig: configTypes.AlloraSingleNodeConfig = {
    instanceType: new ec2.InstanceType(process.env.AWS_INSTANCE_TYPE || 't3.medium'),
    instanceCpuType: process.env.AWS_INSTANCE_CPU_TYPE?.toLowerCase() == "x86_64" ? ec2.AmazonLinuxCpuType.X86_64 : ec2.AmazonLinuxCpuType.ARM_64,
    resourceNamePrefix: process.env.AWS_RESOURCE_NAME_PREFIX || 'AlloraWorkerx',
    dataVolumes: [{
      sizeGiB: process.env.EDGE_DATA_VOL_SIZE ? parseInt(process.env.EDGE_DATA_VOL_SIZE) : 256,
      type: parseDataVolumeType(process.env.EDGE_DATA_VOL_TYPE?.toLowerCase() ? process.env.EDGE_DATA_VOL_TYPE?.toLowerCase() : "gp3"),
      iops: process.env.EDGE_DATA_VOL_IOPS ? parseInt(process.env.EDGE_DATA_VOL_IOPS) : 10000,
      throughput: process.env.EDGE_DATA_VOL_THROUGHPUT ? parseInt(process.env.EDGE_DATA_VOL_THROUGHPUT) : 700
    }],
    alloraWorkerName: process.env.ALLORA_WORKER_NAME || 'aws',
    alloraEnv: process.env.ALLORA_ENV || 'dev',
    modelRepo: process.env.MODEL_REPO || 'https://github.com/allora-network/basic-coin-prediction-node',
    modelEnvVars: process.env.MODEL_ENV_VARS || `
TOKEN="ETH"
TRAINING_DAYS="1"
TIMEFRAME="4h"
MODEL="LinearRegression"
REGION="US"
DATA_PROVIDER="coingecko"
CG_API_KEY="secret"
`,
  
    //Wallet config
    alloraWalletAddressKeyName: process.env.ALLORA_WALLET_ADDRESS_KEY_NAME || 'secret',
    alloraWalletAddressRestoreMnemonic: process.env.ALLORA_WALLET_ADDRESS_RESTORE_MNEMONIC || 'secret',
    alloraWalletHomeDir: process.env.ALLORA_WALLET_HOME_DIR || '',
    alloraWalletGas: process.env.ALLORA_WALLET_GAS || '1000000',
    alloraWalletGasAdjustment: process.env.ALLORA_WALLET_GAS_ADJUSTMENT || '1.0',
  
    alloraWalletGasPrices: process.env.ALLORA_WALLET_GAS_PRICES || 'auto',
    alloraWalletGasPriceInterval: process.env.ALLORA_WALLET_GAS_PRICE_INTERVAL || '60',
    alloraWalletRetryDelay: process.env.ALLORA_WALLET_RETRY_DELAY || '3',
    alloraWalletBlockDurationEstimated: process.env.ALLORA_WALLET_BLOCK_DURATION_ESTIMATED || '10',
    alloraWalletWindowCorrectionFactor: process.env.ALLORA_WALLET_WINDOW_CORRECTION_FACTOR || '0.8',
    alloraWalletAccountSequenceRetryDelay: process.env.ALLORA_WALLET_ACCOUNT_SEQUENCE_RETRY_DELAY || '5',
  
    alloraWalletNodeRpc: process.env.ALLORA_WALLET_NODE_RPC || 'https://localhost:26657',
    alloraWalletMaxRetries: process.env.ALLORA_WALLET_MAX_RETRIES || '1',
    alloraWalletDelay: process.env.ALLORA_WALLET_DELAY || '1',
    alloraWalletSubmitTx: process.env.ALLORA_WALLET_SUBMIT_TX || 'false',
    alloraWalletMaxFees: process.env.ALLORA_WALLET_MAX_FEES || '500000',
  
    //Worker Properties
    alloraWorkerTopicId: process.env.ALLORA_WORKER_TOPIC_ID || '1',
    alloraWorkerInferenceEntrypointName: process.env.ALLORA_WORKER_INFERENCE_ENTRYPOINT_NAME || 'api-worker-reputer',
    alloraWorkerInferenceEndpoint: process.env.ALLORA_WORKER_INFERENCE_ENDPOINT || 'http://source:8000/inference/{Token}',
    alloraWorkerLoopSeconds: process.env.ALLORA_WORKER_LOOP_SECONDS || '30',
    alloraWorkerToken: process.env.ALLORA_WORKER_TOKEN || 'ethereum',
  
    //Reputer Properties
    alloraReputerTopicId: process.env.ALLORA_REPUTER_TOPIC_ID || '1',
    alloraReputerEntrypointName: process.env.ALLORA_REPUTER_ENTRYPOINT_NAME || 'api-worker-reputer',
    alloraReputerSourceOfTruthEndpoint: process.env.ALLORA_REPUTER_SOURCE_OF_TRUTH_ENDPOINT || 'http://source:8888/truth/{Token}/{BlockHeight}',
  
    alloraReputerLossFunctionService: process.env.ALLORA_REPUTER_LOSS_FUNCTION_SERVICE || 'http://localhost:5000',
    alloraReputerLossMethodOptionsLossMethod: process.env.ALLORA_REPUTER_LOSS_METHOD_OPTIONS_LOSS_METHOD || 'sqe',
  
    alloraReputerLoopSeconds: process.env.ALLORA_REPUTER_LOOP_SECONDS || '30',
    alloraReputerToken: process.env.ALLORA_REPUTER_TOKEN || 'ethereum',
    alloraReputerMinStake: process.env.ALLORA_REPUTER_MIN_STAKE || '100000',
};


