import * as configTypes from "../../../constructs/config.interface";

export type EdgeNetwork = "mainnet";

export type EdgeNodeRole = "single-node";

export type EdgeNodeGPU = "enabled" | "disabled";

export type EdgeLauncherVersion = "latest" | string;



export interface EdgeDataVolumeConfig extends configTypes.DataVolumeConfig {

}

export interface EdgeBaseConfig extends configTypes.BaseConfig {

}

export interface EdgeBaseNodeConfig extends configTypes.BaseNodeConfig {
    edgeNetwork: EdgeNetwork;
    edgeNodeGpu: EdgeNodeGPU;
    edgeLauncherVersion: EdgeLauncherVersion
    dataVolume: EdgeDataVolumeConfig;
}
