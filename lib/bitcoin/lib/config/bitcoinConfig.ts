import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as configTypes from "./bitcoinConfig.interface";
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

export const baseConfig: configTypes.BitcoinBaseConfig = {
    accountId: process.env.AWS_ACCOUNT_ID || "xxxxxxxxxxx",
    region: process.env.AWS_REGION || "us-east-1",
    network: <configTypes.BitcoinNetwork>process.env.BITCOIN_NETWORK || "mainnet",
};

export const nodeConfig: configTypes.BitcoinNodeConfig = {
    txindex: process.env.BITCOIN_TXINDEX?.toLowerCase() === "true",
    server: process.env.BITCOIN_SERVER?.toLowerCase() !== "false",  // default true
    listen: process.env.BITCOIN_LISTEN?.toLowerCase() !== "false",  // default true
    dbcache: process.env.BITCOIN_DBCACHE ? parseInt(process.env.BITCOIN_DBCACHE) : 4096,
    maxconnections: process.env.BITCOIN_MAXCONNECTIONS ? parseInt(process.env.BITCOIN_MAXCONNECTIONS) : 125,
    rpcallowip: process.env.BITCOIN_RPCALLOWIP || "127.0.0.1",
    rpcauth: process.env.BITCOIN_RPCAUTH || "none",
    prune: process.env.BITCOIN_PRUNE ? parseInt(process.env.BITCOIN_PRUNE) : 0,
    maxmempool: process.env.BITCOIN_MAXMEMPOOL ? parseInt(process.env.BITCOIN_MAXMEMPOOL) : 300,
    mempoolexpiry: process.env.BITCOIN_MEMPOOLEXPIRY ? parseInt(process.env.BITCOIN_MEMPOOLEXPIRY) : 336,
    maxorphantx: process.env.BITCOIN_MAXORPHANTX ? parseInt(process.env.BITCOIN_MAXORPHANTX) : 100,
    blocksonly: process.env.BITCOIN_BLOCKSONLY?.toLowerCase() === "true",
    assumevalid: process.env.BITCOIN_ASSUMEVALID || "none",
    zmqpubrawblock: process.env.BITCOIN_ZMQPUBRAWBLOCK || "none",
    zmqpubrawtx: process.env.BITCOIN_ZMQPUBRAWTX || "none",
    zmqpubhashblock: process.env.BITCOIN_ZMQPUBHASHBLOCK || "none",
    zmqpubhashtx: process.env.BITCOIN_ZMQPUBHASHTX || "none",
};

export const snapshotConfig: configTypes.BitcoinSnapshotConfig = {
    restoreFromSnapshot: process.env.BITCOIN_RESTORE_FROM_SNAPSHOT?.toLowerCase() === "true",
    snapshotUrl: process.env.BITCOIN_SNAPSHOT_URL || "none",
};

export const singleNodeConfig: configTypes.BitcoinSingleNodeConfig = {
    instanceType: new ec2.InstanceType(process.env.BITCOIN_INSTANCE_TYPE ? process.env.BITCOIN_INSTANCE_TYPE : "m7g.large"),
    instanceCpuType: process.env.BITCOIN_CPU_TYPE?.toLowerCase() == "x86_64" ? ec2.AmazonLinuxCpuType.X86_64 : ec2.AmazonLinuxCpuType.ARM_64,
    bitcoinNetwork: baseConfig.network,
    bitcoinVersion: process.env.BITCOIN_VERSION || "28.0",
    nodeConfig: nodeConfig,
    snapshotConfig: snapshotConfig,
    dataVolumes: [
        {
            sizeGiB: process.env.BITCOIN_DATA_VOL_SIZE ? parseInt(process.env.BITCOIN_DATA_VOL_SIZE) : 700,
            type: parseDataVolumeType(process.env.BITCOIN_DATA_VOL_TYPE?.toLowerCase() ? process.env.BITCOIN_DATA_VOL_TYPE?.toLowerCase() : "gp3"),
            iops: process.env.BITCOIN_DATA_VOL_IOPS ? parseInt(process.env.BITCOIN_DATA_VOL_IOPS) : 5000,
            throughput: process.env.BITCOIN_DATA_VOL_THROUGHPUT ? parseInt(process.env.BITCOIN_DATA_VOL_THROUGHPUT) : 250,
        }
    ],
};

export const haNodeConfig: configTypes.BitcoinHAConfig = {
    albHealthCheckGracePeriodMin: process.env.BITCOIN_HA_ALB_HEALTHCHECK_GRACE_PERIOD_MIN ? parseInt(process.env.BITCOIN_HA_ALB_HEALTHCHECK_GRACE_PERIOD_MIN) : 10,
    heartBeatDelayMin: process.env.BITCOIN_HA_NODES_HEARTBEAT_DELAY_MIN ? parseInt(process.env.BITCOIN_HA_NODES_HEARTBEAT_DELAY_MIN) : 60,
    numberOfNodes: process.env.BITCOIN_HA_NUMBER_OF_NODES ? parseInt(process.env.BITCOIN_HA_NUMBER_OF_NODES) : 2,
};
