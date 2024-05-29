import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as configTypes from "./edgeConfig.interface";
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

export const baseConfig: configTypes.EdgeBaseConfig = {
    accountId: process.env.AWS_ACCOUNT_ID || "xxxxxxxxxxx",
    region: process.env.AWS_REGION || "us-east-1"
};

export const baseNodeConfig: configTypes.EdgeBaseNodeConfig = {
    instanceType: new ec2.InstanceType(process.env.EDGE_NODE_INSTANCE_TYPE ? process.env.EDGE_NODE_INSTANCE_TYPE : "c4.xlarge"),
    instanceCpuType: process.env.EDGE_NODE_CPU_TYPE?.toLowerCase() == "x86_64" ? ec2.AmazonLinuxCpuType.X86_64 : ec2.AmazonLinuxCpuType.X86_64,
    edgeNetwork: <configTypes.EdgeNetwork>process.env.EDGE_CLUSTER || "mainnet",
    edgeLauncherVersion: <configTypes.EdgeNetwork>process.env.EDGE_LAUNCHER_VERSION || "latest",
    edgeNodeGpu: <configTypes.EdgeNodeGPU>process.env.EDGE_NODE_GPU || "disabled",
    dataVolume: {
        sizeGiB: process.env.EDGE_DATA_VOL_SIZE ? parseInt(process.env.EDGE_DATA_VOL_SIZE) : 256,
        type: parseDataVolumeType(process.env.EDGE_DATA_VOL_TYPE?.toLowerCase() ? process.env.EDGE_DATA_VOL_TYPE?.toLowerCase() : "gp3"),
        iops: process.env.EDGE_DATA_VOL_IOPS ? parseInt(process.env.EDGE_DATA_VOL_IOPS) : 10000,
        throughput: process.env.EDGE_DATA_VOL_THROUGHPUT ? parseInt(process.env.EDGE_DATA_VOL_THROUGHPUT) : 700
    }
};
