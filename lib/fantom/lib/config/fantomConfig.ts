import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as configTypes from "./fantomConfig.interface";
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
};

export const baseConfig: configTypes.FantomBaseConfig = {
    accountId: process.env.AWS_ACCOUNT_ID || "xxxxxxxxxxx",
    region: process.env.AWS_REGION || "us-east-1"
};

export const baseNodeConfig: configTypes.FantomBaseNodeConfig = {
    instanceType: new ec2.InstanceType(process.env.FANTOM_INSTANCE_TYPE ? process.env.FANTOM_INSTANCE_TYPE : "m6a.2xlarge"),
    instanceCpuType: process.env.FANTOM_CPU_TYPE?.toLowerCase() == "x86_64" ? ec2.AmazonLinuxCpuType.X86_64 : ec2.AmazonLinuxCpuType.ARM_64 ,
    fantomNetwork: <configTypes.FantomNetwork>process.env.FANTOM_CLUSTER || "mainnet",
    nodeConfiguration: <configTypes.FantomNodeConfiguration>process.env.FANTOM_NODE_CONFIGURATION || "read",
    snapshotsUrl: process.env.FANTOM_SNAPSHOTS_URL || constants.NoneValue,
    dataVolume: {
        sizeGiB: process.env.FANTOM_DATA_VOL_SIZE ? parseInt(process.env.FANTOM_DATA_VOL_SIZE) : 2000,
        type: parseDataVolumeType(process.env.FANTOM_DATA_VOL_TYPE?.toLowerCase() ? process.env.FANTOM_DATA_VOL_TYPE?.toLowerCase() : "gp3"),
        iops: process.env.FANTOM_DATA_VOL_IOPS ? parseInt(process.env.FANTOM_DATA_VOL_IOPS) : 7000,
        throughput: process.env.FANTOM_DATA_VOL_THROUGHPUT ? parseInt(process.env.FANTOM_DATA_VOL_THROUGHPUT) : 400
    }
};

export const haNodeConfig: configTypes.FantomHAConfig = {
    albHealthCheckGracePeriodMin: process.env.FANTOM_HA_ALB_HEALTHCHECK_GRACE_PERIOD_MIN ? parseInt(process.env.FANTOM_HA_ALB_HEALTHCHECK_GRACE_PERIOD_MIN) : 10,
    heartBeatDelayMin: process.env.FANTOM_HA_NODES_HEARTBEAT_DELAY_MIN ? parseInt(process.env.FANTOM_HA_NODES_HEARTBEAT_DELAY_MIN) : 40,
    numberOfNodes: process.env.FANTOM_HA_NUMBER_OF_NODES ? parseInt(process.env.FANTOM_HA_NUMBER_OF_NODES) : 2
};
