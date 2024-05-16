import * as configTypes from "../../../constructs/config.interface";

export type IndyClientCombination = "steward" | "trustee";

export interface IndyDataVolumeConfig extends configTypes.DataVolumeConfig {
}

export interface IndyBaseConfig extends configTypes.BaseConfig {
}

export interface IndyNodeConfig extends configTypes.SingleNodeConfig {
}
