import * as configTypes from "../../../constructs/config.interface";

export type BscNetwork = "mainnet" | "testnet";
export type BscNodeConfiguration = "full" ;

export interface BscDataVolumeConfig extends configTypes.DataVolumeConfig {

}

export interface BscBaseConfig extends configTypes.BaseConfig {

}

export interface BscBaseNodeConfig extends configTypes.BaseNodeConfig {
    bscNetwork: BscNetwork;
    nodeConfiguration: BscNodeConfiguration;
    dataVolume: BscDataVolumeConfig;
}

export interface BscHAConfig {
    albHealthCheckGracePeriodMin: number;
    heartBeatDelayMin: number;
    numberOfNodes: number;
}