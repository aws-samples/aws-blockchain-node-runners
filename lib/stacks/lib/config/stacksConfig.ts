import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as configTypes from "./stacksConfig.interface";
import * as constants from "../../../constructs/constants";
import "./stacksConfigDefaults";
import { DEFAULT_STACKS_NETWORK, DEFAULT_STACKS_NODE_CONFIGURATION, stacksNodeConfigDefaults } from "./stacksConfigDefaults";

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

export const baseConfig: configTypes.StacksBaseConfig = {
    accountId: process.env.AWS_ACCOUNT_ID || "xxxxxxxxxxx",
    region: process.env.AWS_REGION || "us-east-2",
}

// Get configuration values for the parameters that determine the rest of the default values.
const stacksNetwork: configTypes.StacksNetwork =
    <configTypes.StacksNetwork> process.env.STACKS_NETWORK || DEFAULT_STACKS_NETWORK;
const stacksNodeConfiguration: configTypes.StacksNodeConfiguration =
    <configTypes.StacksNodeConfiguration> process.env.STACKS_NODE_CONFIGURATION || DEFAULT_STACKS_NODE_CONFIGURATION;

// Generate default configurations based on the determining parameters.
export const defaults: configTypes.StacksHAConfig = stacksNodeConfigDefaults(stacksNetwork, stacksNodeConfiguration);

// Generate the node config from the defaults.
export const baseNodeConfig: configTypes.StacksBaseNodeConfig = {
    instanceType: process.env.STACKS_INSTANCE_TYPE ? new ec2.InstanceType(process.env.STACKS_INSTANCE_TYPE) : defaults.instanceType,
    instanceCpuType: process.env.STACKS_CPU_TYPE?.toLowerCase() === "x86_64" ? ec2.AmazonLinuxCpuType.X86_64 : ec2.AmazonLinuxCpuType.ARM_64,
    stacksNetwork: stacksNetwork,
    stacksVersion: process.env.STACKS_VERSION || defaults.stacksVersion,
    stacksNodeConfiguration: <configTypes.StacksNodeConfiguration> process.env.STACKS_NODE_CONFIGURATION || defaults.stacksNodeConfiguration,
    stacksBootstrapNode: process.env.STACKS_BOOTSTRAP_NODE || defaults.stacksBootstrapNode,
    stacksChainstateArchive: process.env.STACKS_CHAINSTATE_ARCHIVE || defaults.stacksChainstateArchive,
    stacksP2pPort: process.env.STACKS_P2P_PORT ? parseInt(process.env.STACKS_P2P_PORT) : defaults.stacksP2pPort,
    stacksRpcPort: process.env.STACKS_RPC_PORT ? parseInt(process.env.STACKS_RPC_PORT) : defaults.stacksRpcPort,
    bitcoinPeerHost: process.env.BITCOIN_PEER_HOST || defaults.bitcoinPeerHost,
    bitcoinRpcUsername: process.env.BITCOIN_RPC_USERNAME || defaults.bitcoinRpcUsername,
    bitcoinRpcPassword: process.env.BITCOIN_RPC_PASSWORD || defaults.bitcoinRpcPassword,
    bitcoinRpcPort: process.env.BITCOIN_RPC_PORT ? parseInt(process.env.BITCOIN_RPC_PORT) : defaults.bitcoinRpcPort,
    bitcoinP2pPort: process.env.BITCOIN_P2P_PORT ? parseInt(process.env.BITCOIN_P2P_PORT) : defaults.bitcoinP2pPort,
    stacksSignerSecretArn: process.env.STACKS_SIGNER_SECRET_ARN || defaults.stacksSignerSecretArn,
    stacksMinerSecretArn: process.env.STACKS_MINER_SECRET_ARN || defaults.stacksMinerSecretArn,
    dataVolume: {
        sizeGiB: process.env.STACKS_DATA_VOL_SIZE ? parseInt(process.env.STACKS_DATA_VOL_SIZE) : defaults.dataVolume.sizeGiB,
        type: process.env.STACKS_DATA_VOL_TYPE ? parseDataVolumeType(process.env.STACKS_DATA_VOL_TYPE?.toLowerCase()) : defaults.dataVolume.type,
        iops: process.env.STACKS_DATA_VOL_IOPS ? parseInt(process.env.STACKS_DATA_VOL_IOPS) : defaults.dataVolume.iops,
        throughput: process.env.STACKS_DATA_VOL_THROUGHPUT ? parseInt(process.env.STACKS_DATA_VOL_THROUGHPUT) : defaults.dataVolume.throughput,
    },
    // Ssh access for debugging. TODO: delete before merge to upstream repo.
    debugKeyName: process.env.DEBUG_KEY_NAME,
};

export const haNodeConfig: configTypes.StacksHAConfig = {
    ...baseNodeConfig,
    albHealthCheckGracePeriodMin: process.env.STACKS_HA_ALB_HEALTHCHECK_GRACE_PERIOD_MIN
        ? parseInt(process.env.STACKS_HA_ALB_HEALTHCHECK_GRACE_PERIOD_MIN)
        : defaults.albHealthCheckGracePeriodMin,
    heartBeatDelayMin: process.env.STACKS_HA_NODES_HEARTBEAT_DELAY_MIN
        ? parseInt(process.env.STACKS_HA_NODES_HEARTBEAT_DELAY_MIN)
        : defaults.heartBeatDelayMin,
    numberOfNodes: process.env.STACKS_HA_NUMBER_OF_NODES
        ? parseInt(process.env.STACKS_HA_NUMBER_OF_NODES)
        : defaults.numberOfNodes,
};
