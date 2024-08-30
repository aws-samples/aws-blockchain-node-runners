#!/usr/bin/env node
import 'dotenv/config';
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as constants from "../constructs/constants";
import { EdgeCommonStack } from "./lib/common-stack";
import { AlloraStack } from './lib/allora-stack';

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
};

const app = new cdk.App();

new EdgeCommonStack(app, "allora-edge-common", {
  stackName: `allora-edge-nodes-common`,
  env: { account: process.env.AWS_ACCOUNT_ID || "xxxxxxxxxxx", region: process.env.AWS_REGION || 'us-east-1' }
});

new AlloraStack(app, 'allora-single-node', {
  stackName: 'allora-single-node',
  env: { 
    account: process.env.AWS_ACCOUNT_ID || "xxxxxxxxxxx",
    region: process.env.AWS_REGION || 'us-east-1',
  },
  instanceType: process.env.AWS_INSTANCE_TYPE || 't3.medium',
  vpcMaxAzs: Number(process.env.AWS_VPC_MAX_AZS || 1),
  vpcNatGateways:  Number(process.env.AWS_VPC_NAT_GATEWAYS || 0),
  vpcSubnetCidrMask: Number(process.env.AWS_VPC_CIDR_MASK),
  resourceNamePrefix: process.env.AWS_RESOURCE_NAME_PREFIX || 'AlloraWorkerx',
  dataVolume: {
    sizeGiB: process.env.EDGE_DATA_VOL_SIZE ? parseInt(process.env.EDGE_DATA_VOL_SIZE) : 256,
    type: parseDataVolumeType(process.env.EDGE_DATA_VOL_TYPE?.toLowerCase() ? process.env.EDGE_DATA_VOL_TYPE?.toLowerCase() : "gp3"),
    iops: process.env.EDGE_DATA_VOL_IOPS ? parseInt(process.env.EDGE_DATA_VOL_IOPS) : 10000,
    throughput: process.env.EDGE_DATA_VOL_THROUGHPUT ? parseInt(process.env.EDGE_DATA_VOL_THROUGHPUT) : 700
  },
  alloraWorkerName: process.env.ALLORA_WORKER_NAME || 'aws',
  alloraEnv: process.env.ALLORA_ENV || 'dev',
  modelRepo: process.env.MODEL_REPO || 'https://github.com/allora-network/basic-coin-prediction-node',

  //Wallet config
  alloraWalletAddressKeyName: process.env.ALLORA_ACCOUNT_NAME || 'secret',
  alloraWalletAddressRestoreMnemonic: process.env.ALLORA_ACCOUNT_MNEMONIC || 'secret',
  alloraWalletHomeDir: process.env.ALLORA_WALLET_HOME_DIR || '',
  alloraWalletGas: process.env.ALLORA_WALLET_GAS || '1000000',
  alloraWalletGasAdjustment: process.env.ALLORA_WALLET_GAS_ADJUSTMENT || '1.0',
  alloraWalletNodeRpc: process.env.ALLORA_WALLET_NODE_RPC || 'https://localhost:26657',
  alloraWalletMaxRetries: process.env.ALLORA_WALLET_MAX_RETRIES || '1',
  alloraWalletDelay: process.env.ALLORA_WALLET_DELAY || '1',
  alloraWalletSubmitTx: process.env.ALLORA_WALLET_SUBMIT_TX || 'false',

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
  alloraReputerLoopSeconds: process.env.ALLORA_REPUTER_LOOP_SECONDS || '30',
  alloraReputerToken: process.env.ALLORA_REPUTER_TOKEN || 'ethereum',
  alloraReputerMinStake: process.env.ALLORA_REPUTER_MIN_STAKE || '100000',
});
