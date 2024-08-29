import * as configTypes from "../../../constructs/config.interface";

export type SuiNetworkId = "mainnet" | "testnet" | "devnet";
export type SuiL1Endpoint = string;

export interface SuiDataVolumeConfig extends configTypes.DataVolumeConfig {
}

export interface SuiAccountsVolumeConfig extends configTypes.DataVolumeConfig {
}

export interface SuiBaseConfig extends configTypes.BaseConfig {
}

export interface SuiBaseNodeConfig extends configTypes.BaseNodeConfig {
    suiNetworkId: SuiNetworkId;
    dataVolume: SuiDataVolumeConfig;
}
