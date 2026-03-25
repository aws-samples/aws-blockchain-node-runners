import * as configTypes from "../../../constructs/config.interface";

export type PolygonNetwork = "mainnet" | "amoy";

export interface PolygonDataVolumeConfig extends configTypes.DataVolumeConfig {}

export interface PolygonBaseConfig extends configTypes.BaseConfig {
    network: PolygonNetwork;
    erigonImage: string;
    heimdallApiUrl: string;
}

export interface PolygonSingleNodeConfig extends configTypes.SingleNodeConfig {}

export interface PolygonHaNodeConfig extends configTypes.HaNodesConfig {}
