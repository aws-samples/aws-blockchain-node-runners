import * as configTypes from "../../../constructs/config.interface";

export type TzNetwork = "mainnet" | "sandbox" | "ghostnet";
export type TzNodeHistoryMode = "full" | "rolling" | "archive";

export type TzNodeRole = "sync-node" | "rpc-node" | "single-node";

export interface TzDataVolumeConfig extends configTypes.DataVolumeConfig {

}

export interface TzBaseConfig extends configTypes.BaseConfig {
}

export interface TzBaseNodeConfig extends configTypes.BaseNodeConfig {
    tzNetwork: TzNetwork;
    historyMode: TzNodeHistoryMode;
    snapshotsUrl: string;
    dataVolume: TzDataVolumeConfig;
    downloadSnapshot: string;
}

export interface TzHAConfig {
    albHealthCheckGracePeriodMin: number;
    heartBeatDelayMin: number;
    numberOfNodes: number;
}