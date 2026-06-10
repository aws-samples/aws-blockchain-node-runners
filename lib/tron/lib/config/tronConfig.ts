import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as configTypes from "./tronConfig.interface";
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

export const baseConfig: configTypes.TronBaseConfig = {
    accountId: process.env.AWS_ACCOUNT_ID || "xxxxxxxxxxx",
    region: process.env.AWS_REGION || "us-east-1"
};

export const baseNodeConfig: configTypes.TronBaseNodeConfig = {
    // Default to AWS Graviton (ARM64). java-tron on ARM64 requires JDK 17 (Amazon Corretto 17)
    // and ROCKSDB storage engine. Override TRON_CPU_TYPE=x86_64 for Intel/AMD.
    instanceType: new ec2.InstanceType(process.env.TRON_INSTANCE_TYPE ? process.env.TRON_INSTANCE_TYPE : "m7g.4xlarge"),
    instanceCpuType: process.env.TRON_CPU_TYPE?.toLowerCase() == "x86_64" ? ec2.AmazonLinuxCpuType.X86_64 : ec2.AmazonLinuxCpuType.ARM_64,
    tronNetwork: (process.env.TRON_NETWORK || "mainnet") as configTypes.TronNetwork,
    nodeConfiguration: (process.env.TRON_NODE_CONFIGURATION || "lite") as configTypes.TronNodeConfiguration,
    // ARM64 only supports ROCKSDB; keep rocksdb as the default.
    dbEngine: (process.env.TRON_DB_ENGINE?.toLowerCase() || "rocksdb") as configTypes.TronDbEngine,
    // Snapshot bootstrap source: none | public | s3 (default public)
    snapshotType: (process.env.TRON_SNAPSHOT_TYPE?.toLowerCase() || "public") as configTypes.TronSnapshotType,
    snapshotsUrl: process.env.TRON_SNAPSHOTS_URL || constants.NoneValue,
    downloadSnapshot: (process.env.TRON_SNAPSHOT_TYPE?.toLowerCase() || "public") !== "none",
    dataVolume: {
        // Lite FullNode needs ~200GB+headroom; FullNode needs ~4TB. Set per node type via .env.
        sizeGiB: process.env.TRON_DATA_VOL_SIZE ? parseInt(process.env.TRON_DATA_VOL_SIZE) : 600,
        type: parseDataVolumeType(process.env.TRON_DATA_VOL_TYPE?.toLowerCase() ? process.env.TRON_DATA_VOL_TYPE?.toLowerCase() : "gp3"),
        iops: process.env.TRON_DATA_VOL_IOPS ? parseInt(process.env.TRON_DATA_VOL_IOPS) : 10000,
        throughput: process.env.TRON_DATA_VOL_THROUGHPUT ? parseInt(process.env.TRON_DATA_VOL_THROUGHPUT) : 700
    }
};

export const haNodeConfig: configTypes.TronHAConfig = {
    albHealthCheckGracePeriodMin: process.env.TRON_HA_ALB_HEALTHCHECK_GRACE_PERIOD_MIN ? parseInt(process.env.TRON_HA_ALB_HEALTHCHECK_GRACE_PERIOD_MIN) : 10,
    heartBeatDelayMin: process.env.TRON_HA_NODES_HEARTBEAT_DELAY_MIN ? parseInt(process.env.TRON_HA_NODES_HEARTBEAT_DELAY_MIN) : 40,
    numberOfNodes: process.env.TRON_HA_NUMBER_OF_NODES ? parseInt(process.env.TRON_HA_NUMBER_OF_NODES) : 2
};
