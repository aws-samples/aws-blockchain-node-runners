import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as configTypes from "./hubbleConfig.interface";
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

export const baseConfig: configTypes.HubbleBaseConfig = {
    accountId: process.env.AWS_ACCOUNT_ID || "xxxxxxxxxxx",
    region: process.env.AWS_REGION || "us-east-2",
}

export const baseNodeConfig: configTypes.HubbleBaseNodeConfig = {
    ambEntereumNodeNetworkId: <configTypes.AMBEthereumNodeNetworkId> process.env.AMB_ENTEREUM_NODE_NETWORK_ID || "mainnet",
    ambEntereumNodeInstanceType: process.env.AMB_ETHEREUM_NODE_INSTANCE_TYPE || "bc.m5.xlarge",
    instanceType: new ec2.InstanceType(process.env.HUBBLE_INSTANCE_TYPE ? process.env.HUBBLE_INSTANCE_TYPE : "m6a.2xlarge"),
    instanceCpuType: process.env.HUBBLE_CPU_TYPE?.toLowerCase() == "x86_64" ? ec2.AmazonLinuxCpuType.X86_64 : ec2.AmazonLinuxCpuType.ARM_64,
    hubbleNetworkId: <configTypes.HubbleNetworkId> process.env.HUBBLE_NETWORK_ID || "mainnet",
    nodeConfiguration: <configTypes.HubbleNodeConfiguration> process.env.HUBBLE_NODE_CONFIGURATION || "full",
    opMainnetUrl: process.env.OPTIMISM_L2_RPC_URL || "op-mainnet-url",
    hubOperatorID: process.env.HUB_OPERATOR_FID || "hub-operator-id",
    dataVolume: {
        sizeGiB: process.env.HUBBLE_DATA_VOL_SIZE ? parseInt(process.env.HUBBLE_DATA_VOL_SIZE): 2000,
        type: parseDataVolumeType(process.env.HUBBLE_DATA_VOL_TYPE?.toLowerCase() ? process.env.HUBBLE_DATA_VOL_TYPE?.toLowerCase() : "gp3"),
        iops: process.env.HUBBLE_DATA_VOL_IOPS ? parseInt(process.env.HUBBLE_DATA_VOL_IOPS): 12000,
        throughput: process.env.HUBBLE_DATA_VOL_THROUGHPUT ? parseInt(process.env.HUBBLE_DATA_VOL_THROUGHPUT): 700,
    },
};
