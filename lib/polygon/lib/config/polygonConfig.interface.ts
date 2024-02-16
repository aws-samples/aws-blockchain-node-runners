import * as configTypes from "../../../constructs/config.interface";

export type PolygonClientCombination = "bor-heimdall" | "erigon-heimdall";
export type PolygonNetwork = "mainnet" | "mumbai";

export interface PolygonDataVolumeConfig extends configTypes.DataVolumeConfig {
}

export interface PolygonBaseConfig extends configTypes.BaseConfig {
    clientCombination: PolygonClientCombination;
    network: PolygonNetwork;
    createVpcEnpointS3: boolean;
}

export interface PolygonSyncNodeConfig extends configTypes.SingleNodeConfig {
}

export interface PolygonRpcNodeConfig extends configTypes.HaNodesConfig {
}
