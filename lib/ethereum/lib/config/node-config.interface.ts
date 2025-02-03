import * as configTypes from "../../../constructs/config.interface";

export type EthClientCombination = "besu-teku" | "geth-lighthouse" | "erigon-lighthouse" | "erigon-prysm" | "nethermind-teku" | "reth-lighthouse";

export type EthNodeRole = "sync-node" | "rpc-node" | "single-node";

export type EthNetwork =  "mainnet" | "sepolia" | "holesky";

export type SnapshotType = "s3" | "none";

export interface EthDataVolumeConfig extends configTypes.DataVolumeConfig {
}

export interface EthBaseConfig extends configTypes.BaseConfig {
    clientCombination: EthClientCombination;
    network: EthNetwork
    consensusCheckpointSyncURL: string;
    snapshotType: SnapshotType;
    consensusSnapshotURL: string;
    executionSnapshotURL: string;
}

export interface EthSyncNodeConfig extends configTypes.SingleNodeConfig {
}

export interface EthRpcNodeConfig extends configTypes.HaNodesConfig {
}
