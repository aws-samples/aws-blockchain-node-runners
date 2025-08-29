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
};

export const baseConfig: configTypes.BitcoinBaseConfig = {
    accountId: process.env.AWS_ACCOUNT_ID || "xxxxxxxxxxx",
    region: process.env.AWS_REGION || "us-east-1",
};

export const baseNodeConfig: configTypes.BitcoinBaseNodeConfig = {
    instanceType: new ec2.InstanceType(process.env.BTC_INSTANCE_TYPE ? process.env.BTC_INSTANCE_TYPE : "t3a.large"),
    instanceCpuType: process.env.CPU_ARCHITECTURE?.toUpperCase() === "ARM64" ? ec2.AmazonLinuxCpuType.ARM_64 : ec2.AmazonLinuxCpuType.X86_64,
    dataVolume: {
        sizeGiB: process.env.EBS_VOLUME_SIZE ? parseInt(process.env.EBS_VOLUME_SIZE) : 1000,
        type: parseDataVolumeType(process.env.EBS_VOLUME_TYPE?.toLowerCase() || "gp3"),
        iops: process.env.GP3_IOPS ? parseInt(process.env.GP3_IOPS) : 3000,
        throughput: process.env.GP3_THROUGHPUT ? parseInt(process.env.GP3_THROUGHPUT) : 125,
    },
};

export const haNodeConfig: configTypes.BitcoinHAConfig = {
    albHealthCheckGracePeriodMin: process.env.ALB_HEALTHCHECK_GRACE_PERIOD_MIN ? parseInt(process.env.ALB_HEALTHCHECK_GRACE_PERIOD_MIN) : 10,
    heartBeatDelayMin: process.env.HEARTBEAT_DELAY_MIN ? parseInt(process.env.HEARTBEAT_DELAY_MIN) : 40,
    numberOfNodes: process.env.ASG_DESIRED_CAPACITY ? parseInt(process.env.ASG_DESIRED_CAPACITY) : 2,
};
