import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as configTypes from "./tzConfig.interface";
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

export const baseConfig: configTypes.TzBaseConfig = {
    accountId: process.env.AWS_ACCOUNT_ID || "xxxxxxxxxxx",
    region: process.env.AWS_REGION || "us-east-1"
};

export const baseNodeConfig: configTypes.TzBaseNodeConfig = {
    instanceType: new ec2.InstanceType(process.env.TZ_INSTANCE_TYPE ? process.env.TZ_INSTANCE_TYPE : "c5.2xlarge"),
    instanceCpuType: process.env.TZ_CPU_TYPE?.toLowerCase() == "x86_64" ? ec2.AmazonLinuxCpuType.X86_64 : ec2.AmazonLinuxCpuType.ARM_64 ,
    tzNetwork: <configTypes.TzNetwork>process.env.TZ_CLUSTER || "mainnet",
    historyMode: <configTypes.TzNodeHistoryMode>process.env.TZ_HISTORY_MODE || "full",
    snapshotsUrl: process.env.TZ_SNAPSHOTS_URL || constants.NoneValue,
    dataVolume: {
        sizeGiB: process.env.TZ_DATA_VOL_SIZE ? parseInt(process.env.TZ_DATA_VOL_SIZE) : 4000,
        type: parseDataVolumeType(process.env.TZ_DATA_VOL_TYPE?.toLowerCase() ? process.env.TZ_DATA_VOL_TYPE?.toLowerCase() : "gp3"),
        iops: process.env.TZ_DATA_VOL_IOPS ? parseInt(process.env.TZ_DATA_VOL_IOPS) : 10000,
        throughput: process.env.TZ_DATA_VOL_THROUGHPUT ? parseInt(process.env.TZ_DATA_VOL_THROUGHPUT) : 700
    },
    octezVersion: process.env.TZ_OCTEZ_VERSION ? <configTypes.TzOctezVersion>process.env.TZ_OCTEZ_VERSION : "19.2",
    downloadSnapshot: process.env.TZ_DOWNLOAD_SNAPSHOT ? process.env.TZ_DOWNLOAD_SNAPSHOT : "true"
};

export const haNodeConfig: configTypes.TzHAConfig = {
    albHealthCheckGracePeriodMin: process.env.TZ_HA_ALB_HEALTHCHECK_GRACE_PERIOD_MIN ? parseInt(process.env.TZ_HA_ALB_HEALTHCHECK_GRACE_PERIOD_MIN) : 10,
    heartBeatDelayMin: process.env.TZ_HA_NODES_HEARTBEAT_DELAY_MIN ? parseInt(process.env.TZ_HA_NODES_HEARTBEAT_DELAY_MIN) : 40,
    numberOfNodes: process.env.TZ_HA_NUMBER_OF_NODES ? parseInt(process.env.TZ_HA_NUMBER_OF_NODES) : 2
};
