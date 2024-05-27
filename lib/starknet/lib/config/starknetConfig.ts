import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as configTypes from "./starknetConfig.interface";
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

export const baseConfig: configTypes.StarknetBaseConfig = {
    accountId: process.env.AWS_ACCOUNT_ID || "xxxxxxxxxxx",
    region: process.env.AWS_REGION || "us-east-1",
}

export const baseNodeConfig: configTypes.StarknetBaseNodeConfig = {
    ambEntereumNodeNetworkId: <configTypes.AMBEthereumNodeNetworkId> process.env.AMB_ENTEREUM_NODE_NETWORK_ID || "mainnet",
    ambEntereumNodeInstanceType: process.env.AMB_ETHEREUM_NODE_INSTANCE_TYPE || "bc.m5.xlarge",
    instanceType: new ec2.InstanceType(process.env.STARKNET_INSTANCE_TYPE ? process.env.STARKNET_INSTANCE_TYPE : "m6a.2xlarge"),
    instanceCpuType: ec2.AmazonLinuxCpuType.X86_64,
    starknetNetworkId: <configTypes.StarknetNetworkId> process.env.STARKNET_NETWORK_ID || "mainnet",
    starknetNodeVersion: process.env.STARKNET_NODE_VERSION || "v0.11.7",
    starknetL1Endpoint: process.env.STARKNET_L1_ENDPOINT || constants.NoneValue,
    dataVolume: {
        sizeGiB: process.env.STARKNET_DATA_VOL_SIZE ? parseInt(process.env.STARKNET_DATA_VOL_SIZE): 250,
        type: parseDataVolumeType(process.env.STARKNET_DATA_VOL_TYPE?.toLowerCase() ? process.env.STARKNET_DATA_VOL_TYPE?.toLowerCase() : "gp3"),
        iops: process.env.STARKNET_DATA_VOL_IOPS ? parseInt(process.env.STARKNET_DATA_VOL_IOPS): 3000,
        throughput: process.env.STARKNET_DATA_VOL_THROUGHPUT ? parseInt(process.env.STARKNET_DATA_VOL_THROUGHPUT): 250,
    },
    snapshotUrl: process.env.STARKNET_SNAPSHOT_URL || constants.NoneValue,
};
