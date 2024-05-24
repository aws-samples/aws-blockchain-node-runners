import * as configTypes from "../../../constructs/config.interface";

export type StarknetNetworkId = "mainnet" | "sepolia" | "sepolia-integration";
export type StarknetL1Endpoint = string;

export {AMBEthereumNodeNetworkId} from "../../../constructs/config.interface";

export interface StarknetDataVolumeConfig extends configTypes.DataVolumeConfig {
}

export interface StarknetAccountsVolumeConfig extends configTypes.DataVolumeConfig {
}

export interface StarknetBaseConfig extends configTypes.BaseConfig {
}

export interface StarknetBaseNodeConfig extends configTypes.BaseNodeConfig {
    ambEntereumNodeNetworkId: configTypes.AMBEthereumNodeNetworkId;
    ambEntereumNodeInstanceType: string;
    starknetL1Endpoint: StarknetL1Endpoint;
    starknetNetworkId: StarknetNetworkId;
    starknetNodeVersion: string;
    dataVolume: StarknetDataVolumeConfig;
    snapshotUrl: string;
}
