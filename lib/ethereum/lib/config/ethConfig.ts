import 'dotenv/config'
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as configTypes from "./ethConfig.interface";
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

export const baseConfig: configTypes.EthBaseConfig = {
    accountId: process.env.AWS_ACCOUNT_ID || "xxxxxxxxxxx",          // Set your target AWS Account ID
    region: process.env.AWS_REGION || "us-east-2",               // Set your target AWS Region
    clientCombination: <configTypes.EthClientCombination>process.env.ETH_CLIENT_COMBINATION || "geth-lighthouse", // Set the pair of EL-CL clients : "geth-lighthouse", "erigon-lighthouse", "nethermind-teku", "besu-teku"
};

export const syncNodeConfig: configTypes.EthSyncNodeConfig = {
    instanceType: new ec2.InstanceType(process.env.ETH_SYNC_INSTANCE_TYPE ? process.env.ETH_SYNC_INSTANCE_TYPE : "m6g.2xlarge"), //InstanceType.of(InstanceClass.M6G, InstanceSize.XLARGE2),
    instanceCpuType: process.env.ETH_SYNC_CPU_TYPE?.toLowerCase() == "x86_64" ? ec2.AmazonLinuxCpuType.X86_64 : ec2.AmazonLinuxCpuType.ARM_64 ,
    dataVolumes: [
        {
            sizeGiB: process.env.ETH_SYNC_DATA_VOL_SIZE ? parseInt(process.env.ETH_SYNC_DATA_VOL_SIZE): ((baseConfig.clientCombination == "erigon-lighthouse") ? 3072 : 2048), // Minimum values in Gibibytes: nethermind-teku: 2048, geth-lighthouse: 2048, besu-teku: 2048, erigon-lighthouse: 3072
            type: parseDataVolumeType(process.env.ETH_SYNC_DATA_VOL_TYPE?.toLowerCase() ? process.env.ETH_SYNC_DATA_VOL_TYPE?.toLowerCase() : "gp3"),
            iops: process.env.ETH_SYNC_DATA_VOL_IOPS ? parseInt(process.env.ETH_SYNC_DATA_VOL_IOPS): 7000,
            throughput: process.env.ETH_SYNC_DATA_VOL_THROUGHPUT ? parseInt(process.env.ETH_SYNC_DATA_VOL_THROUGHPUT): 250,
        }
    ]
};

export const rpcNodeConfig: configTypes.EthRpcNodeConfig = {
    instanceType: new ec2.InstanceType(process.env.ETH_RPC_INSTANCE_TYPE ? process.env.ETH_RPC_INSTANCE_TYPE : "m7g.2xlarge"), //InstanceType.of(InstanceClass.M7G, InstanceSize.XLARGE2),
    instanceCpuType:process.env.ETH_RPC_CPU_TYPE?.toLowerCase() == "x86_64" ? ec2.AmazonLinuxCpuType.X86_64 : ec2.AmazonLinuxCpuType.ARM_64,
    numberOfNodes: process.env.ETH_RPC_NUMBER_OF_NODES ? parseInt(process.env.ETH_RPC_NUMBER_OF_NODES) : 2, // Total number of RPC nodes to be provisioned. Default: 2
    albHealthCheckGracePeriodMin: process.env.ETH_RPC_ALB_HEALTHCHECK_GRACE_PERIOD_MIN ? parseInt(process.env.ETH_RPC_ALB_HEALTHCHECK_GRACE_PERIOD_MIN) : 10,
    heartBeatDelayMin: process.env.ETH_RPC_HA_NODES_HEARTBEAT_DELAY_MIN ? parseInt(process.env.ETH_RPC_HA_NODES_HEARTBEAT_DELAY_MIN) : 60,
    dataVolumes: [
        {
            sizeGiB: process.env.ETH_RPC_DATA_VOL_SIZE ? parseInt(process.env.ETH_RPC_DATA_VOL_SIZE): ((baseConfig.clientCombination == "erigon-lighthouse") ? 3072 : 2048), // Minimum values in Gibibytes: nethermind-teku: 2048, geth-lighthouse: 2048, besu-teku: 2048, erigon-lighthouse: 3072
            type: parseDataVolumeType(process.env.ETH_RPC_DATA_VOL_TYPE?.toLowerCase() ? process.env.ETH_RPC_DATA_VOL_TYPE?.toLowerCase() : "gp3"),
            iops: process.env.ETH_RPC_DATA_VOL_IOPS ? parseInt(process.env.ETH_RPC_DATA_VOL_IOPS): 7000,
            throughput: process.env.ETH_RPC_DATA_VOL_THROUGHPUT ? parseInt(process.env.ETH_RPC_DATA_VOL_THROUGHPUT): 250,
        }
    ],
};
