import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as configTypes from "./polygonConfig.interface";
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

export const baseConfig: configTypes.PolygonBaseConfig = {
    accountId: process.env.AWS_ACCOUNT_ID || "xxxxxxxxxxx",          // Set your target AWS Account ID
    region: process.env.AWS_REGION || "us-east-2",               // Set your target AWS Region
    createVpcEnpointS3: process.env.CREATE_VPC_ENDPOINT_S3 === "true" || false, // Set true to create VPC Endpoint S3
    clientCombination: <configTypes.PolygonClientCombination>process.env.POLYGON_CLIENT_COMBINATION || "bor-heimdall", // Set the pair of clients : "bor-heimdall"
    network: <configTypes.PolygonNetwork>process.env.POLYGON_NETWORK || "mainnet", // Set the network : "mainnet" or "mumbai"
};

export const syncNodeConfig: configTypes.PolygonSyncNodeConfig = {
    instanceType: new ec2.InstanceType(process.env.POLYGON_SYNC_INSTANCE_TYPE ? process.env.POLYGON_SYNC_INSTANCE_TYPE : "m6g.8xlarge"),
    instanceCpuType: process.env.POLYGON_SYNC_CPU_TYPE?.toLowerCase() == "x86_64" ? ec2.AmazonLinuxCpuType.X86_64 : ec2.AmazonLinuxCpuType.ARM_64 ,
    dataVolumes: [
        {
            sizeGiB: process.env.POLYGON_SYNC_DATA_VOL_SIZE ? parseInt(process.env.POLYGON_SYNC_DATA_VOL_SIZE): 7450,
            type: parseDataVolumeType(process.env.POLYGON_SYNC_DATA_VOL_TYPE?.toLowerCase() ? process.env.POLYGON_SYNC_DATA_VOL_TYPE?.toLowerCase() : "gp3"),
            iops: process.env.POLYGON_SYNC_DATA_VOL_IOPS ? parseInt(process.env.POLYGON_SYNC_DATA_VOL_IOPS): 7000,
            throughput: process.env.POLYGON_SYNC_DATA_VOL_THROUGHPUT ? parseInt(process.env.POLYGON_SYNC_DATA_VOL_THROUGHPUT): 500,
        }
    ]
};

export const rpcNodeConfig: configTypes.PolygonRpcNodeConfig = {
    instanceType: new ec2.InstanceType(process.env.POLYGON_RPC_INSTANCE_TYPE ? process.env.POLYGON_RPC_INSTANCE_TYPE : "m7g.4xlarge"),
    instanceCpuType:process.env.POLYGON_RPC_CPU_TYPE?.toLowerCase() == "x86_64" ? ec2.AmazonLinuxCpuType.X86_64 : ec2.AmazonLinuxCpuType.ARM_64,
    numberOfNodes: process.env.POLYGON_RPC_NUMBER_OF_NODES ? parseInt(process.env.POLYGON_RPC_NUMBER_OF_NODES) : 2, // Total number of RPC nodes to be provisioned. Default: 2
    albHealthCheckGracePeriodMin: process.env.POLYGON_RPC_ALB_HEALTHCHECK_GRACE_PERIOD_MIN ? parseInt(process.env.POLYGON_RPC_ALB_HEALTHCHECK_GRACE_PERIOD_MIN) : 10,
    heartBeatDelayMin: process.env.POLYGON_RPC_HA_NODES_HEARTBEAT_DELAY_MIN ? parseInt(process.env.POLYGON_RPC_HA_NODES_HEARTBEAT_DELAY_MIN) : 60,
    dataVolumes: [
        {
            sizeGiB: process.env.POLYGON_RPC_DATA_VOL_SIZE ? parseInt(process.env.POLYGON_RPC_DATA_VOL_SIZE): 5587,
            type: parseDataVolumeType(process.env.POLYGON_RPC_DATA_VOL_TYPE?.toLowerCase() ? process.env.POLYGON_RPC_DATA_VOL_TYPE?.toLowerCase() : "gp3"),
            iops: process.env.POLYGON_RPC_DATA_VOL_IOPS ? parseInt(process.env.POLYGON_RPC_DATA_VOL_IOPS): 10000,
            throughput: process.env.POLYGON_RPC_DATA_VOL_THROUGHPUT ? parseInt(process.env.POLYGON_RPC_DATA_VOL_THROUGHPUT): 500,
        }
    ],
};
