import * as configTypes from "../../../constructs/config.interface";

export interface BitcoinDataVolumeConfig extends configTypes.DataVolumeConfig {}

export interface BitcoinBaseNodeConfig extends configTypes.BaseNodeConfig {
    dataVolume: BitcoinDataVolumeConfig;
}

export interface BitcoinHAConfig {
    albHealthCheckGracePeriodMin: number;
    heartBeatDelayMin: number;
    numberOfNodes: number;
}

export interface BitcoinBaseConfig extends configTypes.BaseConfig {}
