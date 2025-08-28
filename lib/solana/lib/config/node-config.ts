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

const validateVersion = (version: any) => {
    if (!version.startsWith("2")) {
        throw new Error(`Versions below 2.x. are no longer supported. Invalid version: ${version}`);
    }
    return version;
  }

export const baseConfig: configTypes.SolanaBaseConfig = {
    accountId: process.env.AWS_ACCOUNT_ID || "xxxxxxxxxxx",
    region: process.env.AWS_REGION || "us-east-2",
}

export const baseNodeConfig: configTypes.SolanaBaseNodeConfig = {
    instanceType: new ec2.InstanceType(process.env.SOLANA_INSTANCE_TYPE ? process.env.SOLANA_INSTANCE_TYPE : "r6a.8xlarge"),
    instanceCpuType: process.env.SOLANA_CPU_TYPE?.toLowerCase() == "x86_64" ? ec2.AmazonLinuxCpuType.X86_64 : ec2.AmazonLinuxCpuType.ARM_64,
    solanaCluster: <configTypes.SolanaCluster> process.env.SOLANA_CLUSTER || "mainnet-beta",
    solanaVersion: validateVersion(process.env.SOLANA_VERSION) || "2.3.7",
    nodeConfiguration: <configTypes.SolanaNodeConfiguration> process.env.SOLANA_NODE_CONFIGURATION || "baserpc",
    dataVolume: {
        sizeGiB: process.env.SOLANA_DATA_VOL_SIZE ? parseInt(process.env.SOLANA_DATA_VOL_SIZE): 2000,
        type: parseDataVolumeType(process.env.SOLANA_DATA_VOL_TYPE?.toLowerCase() ? process.env.SOLANA_DATA_VOL_TYPE?.toLowerCase() : "gp3"),
        iops: process.env.SOLANA_DATA_VOL_IOPS ? parseInt(process.env.SOLANA_DATA_VOL_IOPS): 12000,
        throughput: process.env.SOLANA_DATA_VOL_THROUGHPUT ? parseInt(process.env.SOLANA_DATA_VOL_THROUGHPUT): 700,
    },
    accountsVolume: {
        sizeGiB: process.env.SOLANA_ACCOUNTS_VOL_SIZE ? parseInt(process.env.SOLANA_ACCOUNTS_VOL_SIZE): 500,
        type: parseDataVolumeType(process.env.SOLANA_ACCOUNTS_VOL_TYPE?.toLowerCase() ? process.env.SOLANA_ACCOUNTS_VOL_TYPE?.toLowerCase() : "gp3"),
        iops: process.env.SOLANA_ACCOUNTS_VOL_IOPS ? parseInt(process.env.SOLANA_ACCOUNTS_VOL_IOPS): 6000,
        throughput: process.env.SOLANA_ACCOUNTS_VOL_THROUGHPUT ? parseInt(process.env.SOLANA_ACCOUNTS_VOL_THROUGHPUT): 700,
    },
    solanaNodeIdentitySecretARN: process.env.SOLANA_NODE_IDENTITY_SECRET_ARN || "none",
    voteAccountSecretARN: process.env.SOLANA_VOTE_ACCOUNT_SECRET_ARN || "none",
    authorizedWithdrawerAccountSecretARN: process.env.SOLANA_AUTHORIZED_WITHDRAWER_ACCOUNT_SECRET_ARN || "none",
    registrationTransactionFundingAccountSecretARN: process.env.SOLANA_REGISTRATION_TRANSACTION_FUNDING_ACCOUNT_SECRET_ARN || "none",
    limitOutTrafficMbps: process.env.SOLANA_LIMIT_OUT_TRAFFIC_MBPS ? parseInt(process.env.SOLANA_LIMIT_OUT_TRAFFIC_MBPS) : 20,
};

export const haNodeConfig: configTypes.SolanaHAConfig = {
    albHealthCheckGracePeriodMin: process.env.SOLANA_HA_ALB_HEALTHCHECK_GRACE_PERIOD_MIN ? parseInt(process.env.SOLANA_HA_ALB_HEALTHCHECK_GRACE_PERIOD_MIN) : 10,
    heartBeatDelayMin: process.env.SOLANA_HA_NODES_HEARTBEAT_DELAY_MIN ? parseInt(process.env.SOLANA_HA_NODES_HEARTBEAT_DELAY_MIN) : 40,
    numberOfNodes: process.env.SOLANA_HA_NUMBER_OF_NODES ? parseInt(process.env.SOLANA_HA_NUMBER_OF_NODES) : 2,
};
