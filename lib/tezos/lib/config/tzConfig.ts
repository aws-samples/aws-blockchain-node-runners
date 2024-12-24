import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as configTypes from "./tzConfig.interface";
import * as constants from "../../../constructs/constants";
import { arch } from "os";

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

const getArch = (cpuType: string | undefined) => {
    switch (cpuType?.toLowerCase()) {
        case "x86_64":
            return ec2.AmazonLinuxCpuType.X86_64;
        case "arm64":
            return ec2.AmazonLinuxCpuType.ARM_64;
        default:
            return ec2.AmazonLinuxCpuType.X86_64;
    }
}

const getDownloadUri = (arch: ec2.AmazonLinuxCpuType) => {
    // defaults to v0.20
    switch (arch) {
        case ec2.AmazonLinuxCpuType.X86_64:
            return process.env.TZ_X86_OCTEZ_URI || "https://gitlab.com/tezos/tezos/-/package_files/133747462/download";
        case ec2.AmazonLinuxCpuType.ARM_64:
            return process.env.TZ_ARM64_OCTEZ_URI || "https://gitlab.com/tezos/tezos/-/package_files/133748628/download";
        default:
            return process.env.TZ_X86_OCTEZ_URI || "https://gitlab.com/tezos/tezos/-/package_files/133747462/download";
    }
}

const getSnapshotUri = (network: configTypes.TzNetwork, historyMode: configTypes.TzNodeHistoryMode, snapshotRegion: configTypes.TzSnapshotRegion, snapshotsUrl: string) => {
    if (snapshotsUrl !== constants.NoneValue) {
        return snapshotsUrl;
    }

    return `https://snapshots.${snapshotRegion}.tzinit.org/${network}/${historyMode}`
}

export const baseNodeConfig: configTypes.TzBaseNodeConfig = {
    instanceType: new ec2.InstanceType(process.env.TZ_INSTANCE_TYPE ? process.env.TZ_INSTANCE_TYPE : "c7g.xlarge"),
    instanceCpuType: getArch(process.env.TZ_CPU_TYPE),
    tzNetwork: <configTypes.TzNetwork>process.env.TZ_NETWORK || "mainnet",
    historyMode: <configTypes.TzNodeHistoryMode>process.env.TZ_HISTORY_MODE || "full",
    snapshotRegion: <configTypes.TzSnapshotRegion>process.env.TZ_SNAPSHOT_REGION || "us",
    octezDownloadUri: getDownloadUri(getArch(process.env.TZ_CPU_TYPE)),
    snapshotsUrl: getSnapshotUri(
        <configTypes.TzNetwork>process.env.TZ_NETWORK || "mainnet",
        <configTypes.TzNodeHistoryMode>process.env.TZ_HISTORY_MODE || "full",
        <configTypes.TzSnapshotRegion>process.env.TZ_SNAPSHOT_REGION || "us",
        process.env.TZ_SNAPSHOTS_URL || constants.NoneValue
    ),
    dataVolume: {
        sizeGiB: process.env.TZ_DATA_VOL_SIZE ? parseInt(process.env.TZ_DATA_VOL_SIZE) : 2000,
        type: parseDataVolumeType(process.env.TZ_DATA_VOL_TYPE?.toLowerCase() ? process.env.TZ_DATA_VOL_TYPE?.toLowerCase() : "gp3"),
        iops: process.env.TZ_DATA_VOL_IOPS ? parseInt(process.env.TZ_DATA_VOL_IOPS) : 10000,
        throughput: process.env.TZ_DATA_VOL_THROUGHPUT ? parseInt(process.env.TZ_DATA_VOL_THROUGHPUT) : 700
    },
    downloadSnapshot: process.env.TZ_DOWNLOAD_SNAPSHOT ? process.env.TZ_DOWNLOAD_SNAPSHOT : "true"
};

export const haNodeConfig: configTypes.TzHAConfig = {
    albHealthCheckGracePeriodMin: process.env.TZ_HA_ALB_HEALTHCHECK_GRACE_PERIOD_MIN ? parseInt(process.env.TZ_HA_ALB_HEALTHCHECK_GRACE_PERIOD_MIN) : 15,
    heartBeatDelayMin: process.env.TZ_HA_NODES_HEARTBEAT_DELAY_MIN ? parseInt(process.env.TZ_HA_NODES_HEARTBEAT_DELAY_MIN) : 40,
    numberOfNodes: process.env.TZ_HA_NUMBER_OF_NODES ? parseInt(process.env.TZ_HA_NUMBER_OF_NODES) : 2
};
