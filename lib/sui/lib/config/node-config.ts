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

export const baseConfig: configTypes.SuiBaseConfig = {
    accountId: process.env.AWS_ACCOUNT_ID || "458259478447",
    region: process.env.AWS_REGION || "us-east-1",
}

export const baseNodeConfig: configTypes.SuiBaseNodeConfig = {
    instanceType: new ec2.InstanceType(process.env.SUI_INSTANCE_TYPE ? process.env.SUI_INSTANCE_TYPE : "m6i.4xlarge"),
    instanceCpuType: ec2.AmazonLinuxCpuType.X86_64,
    suiNetworkId: <configTypes.SuiNetworkId> process.env.SUI_NETWORK_ID || "testnet",
    dataVolume: {
        sizeGiB: process.env.SUI_DATA_VOL_SIZE ? parseInt(process.env.SUI_DATA_VOL_SIZE): 4000,
        type: parseDataVolumeType(process.env.SUI_DATA_VOL_TYPE?.toLowerCase() ? process.env.SUI_DATA_VOL_TYPE?.toLowerCase() : "gp3"),
        iops: process.env.SUI_DATA_VOL_IOPS ? parseInt(process.env.SUI_DATA_VOL_IOPS): 3000,
        throughput: process.env.SUI_DATA_VOL_THROUGHPUT ? parseInt(process.env.SUI_DATA_VOL_THROUGHPUT): 700,
    },
};
