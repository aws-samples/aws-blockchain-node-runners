import * as configTypes from "../../../constructs/config.interface";

export type BscNetwork = "mainnet" | "testnet";
export type BscNodeConfiguration = "full" ;

export type BscNodeRole = "sync-node" | "rpc-node" | "single-node";

export interface BscDataVolumeConfig extends configTypes.DataVolumeConfig {

}

export interface BscBaseConfig extends configTypes.BaseConfig {

}

export interface BscBaseNodeConfig extends configTypes.BaseNodeConfig {
    bscNetwork: BscNetwork;
    nodeConfiguration: BscNodeConfiguration;
    snapshotsUrl: string;
    dataVolume: BscDataVolumeConfig;
}

export interface BscHAConfig {
    albHealthCheckGracePeriodMin: number;
    heartBeatDelayMin: number;
    numberOfNodes: number;
}
