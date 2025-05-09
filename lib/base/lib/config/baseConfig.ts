import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as configTypes from "./baseConfig.interface";
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

const getClientConfiguration = (client: configTypes.BaseClient, nodeConfiguration: configTypes.BaseNodeConfiguration) => {
    switch (client) {
        case "reth":
            return "archive";
        case "geth":
            return "full";
        default:
            return "full";
    }
}

export const baseConfig: configTypes.BaseBaseConfig = {
    accountId: process.env.AWS_ACCOUNT_ID || "xxxxxxxxxxx",
    region: process.env.AWS_REGION || "us-east-1",
}

export const baseNodeConfig: configTypes.BaseBaseNodeConfig = {
    instanceType: new ec2.InstanceType(process.env.BASE_INSTANCE_TYPE ? process.env.BASE_INSTANCE_TYPE : "m7g.2xlarge"),
    instanceCpuType: process.env.BASE_CPU_TYPE?.toLowerCase() == "x86_64" ? ec2.AmazonLinuxCpuType.X86_64 : ec2.AmazonLinuxCpuType.ARM_64,
    baseNetworkId: <configTypes.BaseNetworkId> process.env.BASE_NETWORK_ID || "mainnet",
    baseClient: <configTypes.BaseClient> process.env.BASE_CLIENT || "geth",
    baseNodeConfiguration: getClientConfiguration(<configTypes.BaseClient> process.env.BASE_CLIENT, <configTypes.BaseNodeConfiguration> process.env.BASE_NODE_CONFIGURATION),
    restoreFromSnapshot: process.env.BASE_RESTORE_FROM_SNAPSHOT?.toLowerCase() == "true" ? true : false,
    l1ExecutionEndpoint: process.env.BASE_L1_EXECUTION_ENDPOINT || constants.NoneValue,
    l1ConsensusEndpoint: process.env.BASE_L1_CONSENSUS_ENDPOINT || constants.NoneValue,
    snapshotUrl: process.env.BASE_SNAPSHOT_URL || constants.NoneValue,
    dataVolume: {
        sizeGiB: process.env.BASE_DATA_VOL_SIZE ? parseInt(process.env.BASE_DATA_VOL_SIZE): 1000,
        type: parseDataVolumeType(process.env.BASE_DATA_VOL_TYPE?.toLowerCase() ? process.env.BASE_DATA_VOL_TYPE?.toLowerCase() : "gp3"),
        iops: process.env.BASE_DATA_VOL_IOPS ? parseInt(process.env.BASE_DATA_VOL_IOPS): 5000,
        throughput: process.env.BASE_DATA_VOL_THROUGHPUT ? parseInt(process.env.BASE_DATA_VOL_THROUGHPUT): 700,
    },
};

export const haNodeConfig: configTypes.BaseHAConfig = {
    albHealthCheckGracePeriodMin: process.env.BASE_HA_ALB_HEALTHCHECK_GRACE_PERIOD_MIN ? parseInt(process.env.BASE_HA_ALB_HEALTHCHECK_GRACE_PERIOD_MIN) : 10,
    heartBeatDelayMin: process.env.BASE_HA_NODES_HEARTBEAT_DELAY_MIN ? parseInt(process.env.BASE_HA_NODES_HEARTBEAT_DELAY_MIN) : 40,
    numberOfNodes: process.env.BASE_HA_NUMBER_OF_NODES ? parseInt(process.env.BASE_HA_NUMBER_OF_NODES) : 2
};
