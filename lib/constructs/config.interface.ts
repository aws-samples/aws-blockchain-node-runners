import * as ec2 from "aws-cdk-lib/aws-ec2";

export interface BaseConfig {
    accountId: string;
    region: string;
}

export interface DataVolumeConfig {
    sizeGiB: number;
    type: string;
    iops: number;
    throughput: number;
}

export interface BaseNodeConfig {
    instanceType: ec2.InstanceType;
    instanceCpuType: ec2.AmazonLinuxCpuType;
}

export interface SingleNodeConfig extends BaseNodeConfig {
    dataVolumes: DataVolumeConfig[];
}

export interface HaNodesConfig extends BaseNodeConfig {
    albHealthCheckGracePeriodMin: number;
    heartBeatDelayMin: number;
    instanceAmiId?: string;
    numberOfNodes: number;
    dataVolumes: DataVolumeConfig[];
}

export type AMBEthereumNodeNetworkId = "mainnet" | "goerli";
