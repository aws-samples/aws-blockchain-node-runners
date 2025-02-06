import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as configTypes from "../../../constructs/config.interface";
import * as constants from "../../../constructs/constants";
import * as xrp from "./XRPConfig.interface";


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

export const baseConfig: configTypes.BaseConfig = {
    accountId: process.env.AWS_ACCOUNT_ID || "xxxxxxxxxxx",
    region: process.env.AWS_REGION || "us-east-2",
}



export const baseNodeConfig: xrp.XRPBaseNodeConfig = {
    instanceType: new ec2.InstanceType(process.env.XRP_INSTANCE_TYPE ? process.env.XRP_INSTANCE_TYPE : "r6a.8xlarge"),
    instanceCpuType: process.env.XRP_CPU_TYPE?.toLowerCase() == "x86_64" ? ec2.AmazonLinuxCpuType.X86_64 : ec2.AmazonLinuxCpuType.ARM_64,
    dataVolume: {
        sizeGiB: process.env.DATA_VOL_SIZE ? parseInt(process.env.DATA_VOL_SIZE): 2000,
        type: parseDataVolumeType(process.env.DATA_VOL_TYPE?.toLowerCase() ? process.env.DATA_VOL_TYPE?.toLowerCase() : "gp3"),
        iops: process.env.DATA_VOL_IOPS ? parseInt(process.env.DATA_VOL_IOPS): 12000,
        throughput: process.env.DATA_VOL_THROUGHPUT ? parseInt(process.env.DATA_VOL_THROUGHPUT): 700,
    },
    hubNetworkID: process.env.HUB_NETWORK_ID || "testnet"
};



export const haNodeConfig: xrp.HAXRPBaseNodeConfig = {
    ...baseNodeConfig,
    albHealthCheckGracePeriodMin: process.env.XRP_HA_ALB_HEALTHCHECK_GRACE_PERIOD_MIN ? parseInt(process.env.XRP_HA_ALB_HEALTHCHECK_GRACE_PERIOD_MIN) : 10,
    heartBeatDelayMin: process.env.XRP_HA_NODES_HEARTBEAT_DELAY_MIN ? parseInt(process.env.XRP_HA_NODES_HEARTBEAT_DELAY_MIN) : 40,
    numberOfNodes: process.env.XRP_HA_NUMBER_OF_NODES ? parseInt(process.env.XRP_HA_NUMBER_OF_NODES) : 2,
};
