import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as configTypes from "./scrollConfig.interface";
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

export const baseConfig: configTypes.ScrollBaseConfig = {
    accountId: process.env.AWS_ACCOUNT_ID || "xxxxxxxxxxx",
    region: process.env.AWS_REGION || "us-east-2",
}

export const baseNodeConfig: configTypes.ScrollBaseNodeConfig = {
    instanceType: new ec2.InstanceType(process.env.SCROLL_INSTANCE_TYPE ? process.env.SCROLL_INSTANCE_TYPE : "t3.2xlarge"),
    instanceCpuType: process.env.SCROLL_CPU_TYPE?.toLowerCase() == "x86_64" ? ec2.AmazonLinuxCpuType.X86_64 : ec2.AmazonLinuxCpuType.ARM_64,
    scrollCluster: <configTypes.ScrollCluster> process.env.SCROLL_CLUSTER || "mainnet",
    scrollVersion: process.env.SCROLL_VERSION || "1.16.15",
    nodeConfiguration: <configTypes.ScrollNodeConfiguration> process.env.SCROLL_NODE_CONFIGURATION || "baserpc",
    dataVolume: {
        sizeGiB: process.env.SCROLL_DATA_VOL_SIZE ? parseInt(process.env.SCROLL_DATA_VOL_SIZE): 2000,
        type: parseDataVolumeType(process.env.SCROLL_DATA_VOL_TYPE?.toLowerCase() ? process.env.SCROLL_DATA_VOL_TYPE?.toLowerCase() : "gp3"),
        iops: process.env.SCROLL_DATA_VOL_IOPS ? parseInt(process.env.SCROLL_DATA_VOL_IOPS): 12000,
        throughput: process.env.SCROLL_DATA_VOL_THROUGHPUT ? parseInt(process.env.SCROLL_DATA_VOL_THROUGHPUT): 700,
    },
    scrollNodeIdentitySecretARN: process.env.SCROLL_NODE_IDENTITY_SECRET_ARN || "none",
    voteAccountSecretARN: process.env.SCROLL_VOTE_ACCOUNT_SECRET_ARN || "none",
    authorizedWithdrawerAccountSecretARN: process.env.SCROLL_AUTHORIZED_WITHDRAWER_ACCOUNT_SECRET_ARN || "none",
    registrationTransactionFundingAccountSecretARN: process.env.SCROLL_REGISTRATION_TRANSACTION_FUNDING_ACCOUNT_SECRET_ARN || "none",
    l1Endpoint: process.env.L2GETH_L1_ENDPOINT || "http://xxx",
};

export const haNodeConfig: configTypes.ScrollHAConfig = {
    albHealthCheckGracePeriodMin: process.env.SCROLL_HA_ALB_HEALTHCHECK_GRACE_PERIOD_MIN ? parseInt(process.env.SCROLL_HA_ALB_HEALTHCHECK_GRACE_PERIOD_MIN) : 10,
    heartBeatDelayMin: process.env.SCROLL_HA_NODES_HEARTBEAT_DELAY_MIN ? parseInt(process.env.SCROLL_HA_NODES_HEARTBEAT_DELAY_MIN) : 40,
    numberOfNodes: process.env.SCROLL_HA_NUMBER_OF_NODES ? parseInt(process.env.SCROLL_HA_NUMBER_OF_NODES) : 2,
};
