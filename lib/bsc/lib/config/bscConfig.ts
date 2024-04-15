import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as configTypes from "./bscConfig.interface";
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

export const baseConfig: configTypes.BscBaseConfig = {
    accountId: process.env.AWS_ACCOUNT_ID || "xxxxxxxxxxx",
    region: process.env.AWS_REGION || "us-east-1"
};

export const baseNodeConfig: configTypes.BscBaseNodeConfig = {
    instanceType: new ec2.InstanceType(process.env.BSC_INSTANCE_TYPE ? process.env.BSC_INSTANCE_TYPE : "m7g.4xlarge"),
    instanceCpuType: process.env.BSC_CPU_TYPE?.toLowerCase() == "x86_64" ? ec2.AmazonLinuxCpuType.X86_64 : ec2.AmazonLinuxCpuType.ARM_64 ,
    bscNetwork: <configTypes.BscNetwork>process.env.BSC_CLUSTER || "mainnet",
    nodeConfiguration: <configTypes.BscNodeConfiguration>process.env.BSC_NODE_CONFIGURATION || "full",
    snapshotsUrl: process.env.BSC_SNAPSHOTS_URL || constants.NoneValue,
    dataVolume: {
        sizeGiB: process.env.BSC_DATA_VOL_SIZE ? parseInt(process.env.BSC_DATA_VOL_SIZE) : 4000,
        type: parseDataVolumeType(process.env.BSC_DATA_VOL_TYPE?.toLowerCase() ? process.env.BSC_DATA_VOL_TYPE?.toLowerCase() : "gp3"),
        iops: process.env.BSC_DATA_VOL_IOPS ? parseInt(process.env.BSC_DATA_VOL_IOPS) : 10000,
        throughput: process.env.BSC_DATA_VOL_THROUGHPUT ? parseInt(process.env.BSC_DATA_VOL_THROUGHPUT) : 700
    }
};

export const haNodeConfig: configTypes.BscHAConfig = {
    albHealthCheckGracePeriodMin: process.env.BSC_HA_ALB_HEALTHCHECK_GRACE_PERIOD_MIN ? parseInt(process.env.BSC_HA_ALB_HEALTHCHECK_GRACE_PERIOD_MIN) : 10,
    heartBeatDelayMin: process.env.BSC_HA_NODES_HEARTBEAT_DELAY_MIN ? parseInt(process.env.BSC_HA_NODES_HEARTBEAT_DELAY_MIN) : 40,
    numberOfNodes: process.env.BSC_HA_NUMBER_OF_NODES ? parseInt(process.env.BSC_HA_NUMBER_OF_NODES) : 2
};
