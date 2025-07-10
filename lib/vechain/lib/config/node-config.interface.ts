import * as configTypes from "../../../constructs/config.interface";

export type VetNodeType = "authority" | "public";

export type VetNetwork = "mainnet" | "testnet";

export type SnapshotType = "s3" | "none";

export interface VetBaseNodeConfig extends configTypes.BaseNodeConfig {
    network: VetNetwork
    vetNodeType: VetNodeType;
    vetContainerImage: string;
    dataVolume: configTypes.DataVolumeConfig;
    syncFromPublicSnapshot: boolean;
}

export interface VetHaNodesConfig extends VetBaseNodeConfig {
    albHealthCheckGracePeriodMin: number;
    heartBeatDelayMin: number;
    numberOfNodes: number;
}
