import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as configTypes from "../../../constructs/config.interface";
import * as constants from "../../../constructs/constants";
import * as vet from "./node-config.interface";

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
    region: process.env.AWS_REGION || "eu-west-1",
}

export const baseNodeConfig: vet.VetBaseNodeConfig = {
    instanceType: new ec2.InstanceType(process.env.VET_INSTANCE_TYPE ? process.env.VET_INSTANCE_TYPE : "i4i.large"),
    instanceCpuType: process.env.VET_CPU_TYPE?.toLowerCase() == "x86_64" ? ec2.AmazonLinuxCpuType.X86_64 : ec2.AmazonLinuxCpuType.ARM_64,
    dataVolume: {
        sizeGiB: process.env.VET_DATA_VOL_SIZE ? parseInt(process.env.VET_DATA_VOL_SIZE) : 2000,
        type: parseDataVolumeType(process.env.VET_DATA_VOL_TYPE?.toLowerCase() ? process.env.VET_DATA_VOL_TYPE?.toLowerCase() : "gp3"),
        iops: process.env.VET_DATA_VOL_IOPS ? parseInt(process.env.VET_DATA_VOL_IOPS) : 12000,
        throughput: process.env.VET_DATA_VOL_THROUGHPUT ? parseInt(process.env.VET_DATA_VOL_THROUGHPUT) : 700,
    },
    network: (process.env.VET_NETWORK || "testnet") as vet.VetNetwork,
    vetNodeType: (process.env.VET_NODE_TYPE || "public") as vet.VetNodeType,
    vetContainerImage: process.env.VET_CONTAINER_IMAGE || "vechain/thor:v2.3.1",
    syncFromPublicSnapshot: process.env.SYNC_FROM_PUBLIC_SNAPSHOT ? process.env.SYNC_FROM_PUBLIC_SNAPSHOT === "true" : true
};

export const haNodeConfig: vet.VetHaNodesConfig = {
    ...baseNodeConfig,
    albHealthCheckGracePeriodMin: process.env.VET_HA_ALB_HEALTHCHECK_GRACE_PERIOD_MIN ? parseInt(process.env.VET_HA_ALB_HEALTHCHECK_GRACE_PERIOD_MIN) : 10,
    heartBeatDelayMin: process.env.VET_HA_NODES_HEARTBEAT_DELAY_MIN ? parseInt(process.env.VET_HA_NODES_HEARTBEAT_DELAY_MIN) : 40,
    numberOfNodes: process.env.VET_HA_NUMBER_OF_NODES ? parseInt(process.env.VET_HA_NUMBER_OF_NODES) : 2
};
