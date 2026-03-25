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

const network = <configTypes.PolygonNetwork>process.env.POLYGON_NETWORK || "mainnet";

const defaultHeimdallApiUrl = network === "amoy"
    ? "https://heimdall-api-amoy.polygon.technology"
    : "https://heimdall-api.polygon.technology";

export const baseConfig: configTypes.PolygonBaseConfig = {
    accountId: process.env.AWS_ACCOUNT_ID || "xxxxxxxxxxx",
    region: process.env.AWS_REGION || "us-east-1",
    network,
    erigonImage: process.env.POLYGON_ERIGON_IMAGE || "0xpolygon/erigon:v3.4.0",
    heimdallApiUrl: process.env.POLYGON_HEIMDALL_API_URL || defaultHeimdallApiUrl,
};

export const singleNodeConfig: configTypes.PolygonSingleNodeConfig = {
    instanceType: new ec2.InstanceType(process.env.POLYGON_INSTANCE_TYPE || "m7g.4xlarge"),
    instanceCpuType: process.env.POLYGON_CPU_TYPE?.toLowerCase() == "x86_64" ? ec2.AmazonLinuxCpuType.X86_64 : ec2.AmazonLinuxCpuType.ARM_64,
    dataVolumes: [
        {
            sizeGiB: process.env.POLYGON_DATA_VOL_SIZE ? parseInt(process.env.POLYGON_DATA_VOL_SIZE) : 8000,
            type: parseDataVolumeType(process.env.POLYGON_DATA_VOL_TYPE?.toLowerCase() || "gp3"),
            iops: process.env.POLYGON_DATA_VOL_IOPS ? parseInt(process.env.POLYGON_DATA_VOL_IOPS) : 16000,
            throughput: process.env.POLYGON_DATA_VOL_THROUGHPUT ? parseInt(process.env.POLYGON_DATA_VOL_THROUGHPUT) : 1000,
        }
    ],
};

export const haNodeConfig: configTypes.PolygonHaNodeConfig = {
    instanceType: new ec2.InstanceType(process.env.POLYGON_RPC_INSTANCE_TYPE || "m7g.4xlarge"),
    instanceCpuType: process.env.POLYGON_RPC_CPU_TYPE?.toLowerCase() == "x86_64" ? ec2.AmazonLinuxCpuType.X86_64 : ec2.AmazonLinuxCpuType.ARM_64,
    numberOfNodes: process.env.POLYGON_RPC_NUMBER_OF_NODES ? parseInt(process.env.POLYGON_RPC_NUMBER_OF_NODES) : 2,
    albHealthCheckGracePeriodMin: process.env.POLYGON_RPC_ALB_HEALTHCHECK_GRACE_PERIOD_MIN ? parseInt(process.env.POLYGON_RPC_ALB_HEALTHCHECK_GRACE_PERIOD_MIN) : 10,
    heartBeatDelayMin: process.env.POLYGON_RPC_HA_NODES_HEARTBEAT_DELAY_MIN ? parseInt(process.env.POLYGON_RPC_HA_NODES_HEARTBEAT_DELAY_MIN) : 60,
    dataVolumes: [
        {
            sizeGiB: process.env.POLYGON_RPC_DATA_VOL_SIZE ? parseInt(process.env.POLYGON_RPC_DATA_VOL_SIZE) : 8000,
            type: parseDataVolumeType(process.env.POLYGON_RPC_DATA_VOL_TYPE?.toLowerCase() || "gp3"),
            iops: process.env.POLYGON_RPC_DATA_VOL_IOPS ? parseInt(process.env.POLYGON_RPC_DATA_VOL_IOPS) : 16000,
            throughput: process.env.POLYGON_RPC_DATA_VOL_THROUGHPUT ? parseInt(process.env.POLYGON_RPC_DATA_VOL_THROUGHPUT) : 1000,
        }
    ],
};
