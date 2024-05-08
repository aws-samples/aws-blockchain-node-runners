import * as configTypes from "../../../constructs/config.interface";

export type FantomNetwork = "mainnet" ;
export type FantomNodeConfiguration = "read" ;

export type FantomNodeRole = "rpc-node" | "single-node";

export interface FantomDataVolumeConfig extends configTypes.DataVolumeConfig {

}

export interface FantomBaseConfig extends configTypes.BaseConfig {

}

export interface FantomBaseNodeConfig extends configTypes.BaseNodeConfig {
    fantomNetwork: FantomNetwork;
    nodeConfiguration: FantomNodeConfiguration;
    snapshotsUrl: string;
    dataVolume: FantomDataVolumeConfig;
}

export interface FantomHAConfig {
    albHealthCheckGracePeriodMin: number;
    heartBeatDelayMin: number;
    numberOfNodes: number;
}
