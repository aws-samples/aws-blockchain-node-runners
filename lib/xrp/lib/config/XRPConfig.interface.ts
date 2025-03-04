import * as configTypes from "../../../constructs/config.interface";

export interface XRPBaseNodeConfig extends configTypes.BaseNodeConfig {
    hubNetworkID: string;
    // hubNetworkIP: string;
    // onlineDelete: string;
    // advisoryDelete: string;
    // validatorListSites: string;
    // validatorListKeys: string;
    dataVolume: configTypes.DataVolumeConfig;
}

export interface HAXRPBaseNodeConfig extends XRPBaseNodeConfig {
    albHealthCheckGracePeriodMin: number;
    heartBeatDelayMin: number;
    numberOfNodes: number;
}
