import * as configTypes from "../../../constructs/config.interface";

export type EthClientCombination = "besu-teku" | "geth-lighthouse" | "erigon-lighthouse" | "erigon-prysm" | "nethermind-teku";

export type EthNodeRole = "sync-node" | "rpc-node" | "single-node";

export interface EthDataVolumeConfig extends configTypes.DataVolumeConfig {
}

export interface EthBaseConfig extends configTypes.BaseConfig {
    clientCombination: EthClientCombination;
}

export interface EthSyncNodeConfig extends configTypes.SingleNodeConfig {
}

export interface EthRpcNodeConfig extends configTypes.HaNodesConfig {
}
