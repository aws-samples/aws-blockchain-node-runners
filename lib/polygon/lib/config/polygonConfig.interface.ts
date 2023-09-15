import * as configTypes from "../../../constructs/config.interface";

export type PolygonClientCombination = "bor-heimdall";
export type PolygonNetwork = "mainnet" | "testnet";

export interface PolygonDataVolumeConfig extends configTypes.DataVolumeConfig {
}

export interface PolygonBaseConfig extends configTypes.BaseConfig {
    clientCombination: PolygonClientCombination;
    network: PolygonNetwork;
}

export interface PolygonSyncNodeConfig extends configTypes.SingleNodeConfig {
}

export interface PolygonRpcNodeConfig extends configTypes.HaNodesConfig {
}
