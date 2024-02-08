import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as configTypes from "./baseConfig.interface";
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

export const baseConfig: configTypes.BaseBaseConfig = {
    accountId: process.env.AWS_ACCOUNT_ID || "xxxxxxxxxxx",
    region: process.env.AWS_REGION || "us-east-2",
}

export const baseNodeConfig: configTypes.BaseBaseNodeConfig = {
    instanceType: new ec2.InstanceType(process.env.BASE_INSTANCE_TYPE ? process.env.BASE_INSTANCE_TYPE : "m6a.2xlarge"),
    instanceCpuType: process.env.BASE_CPU_TYPE?.toLowerCase() == "x86_64" ? ec2.AmazonLinuxCpuType.X86_64 : ec2.AmazonLinuxCpuType.ARM_64,
    baseNetworkId: <configTypes.BaseNetworkId> process.env.BASE_NETWORK_ID || "mainnet",
    restoreFromSnapshot: process.env.BASE_RESTORE_FROM_SNAPSHOT?.toLowerCase() == "true" ? true : false,
    l1Endpoint: process.env.BASE_L1_ENDPOINT || constants.NoneValue,
    dataVolume: {
        sizeGiB: process.env.BASE_DATA_VOL_SIZE ? parseInt(process.env.BASE_DATA_VOL_SIZE): 1000,
        type: parseDataVolumeType(process.env.BASE_DATA_VOL_TYPE?.toLowerCase() ? process.env.BASE_DATA_VOL_TYPE?.toLowerCase() : "gp3"),
        iops: process.env.BASE_DATA_VOL_IOPS ? parseInt(process.env.BASE_DATA_VOL_IOPS): 5000,
        throughput: process.env.BASE_DATA_VOL_THROUGHPUT ? parseInt(process.env.BASE_DATA_VOL_THROUGHPUT): 700,
    },
};
