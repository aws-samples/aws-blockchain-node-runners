import * as configTypes from "../../../constructs/config.interface";

export type BaseNetworkId = "mainnet" ;
export type BaseNodeConfiguration = "full" ;

export {AMBEthereumNodeNetworkId} from "../../../constructs/config.interface";

export interface BaseDataVolumeConfig extends configTypes.DataVolumeConfig {
}

export interface BaseAccountsVolumeConfig extends configTypes.DataVolumeConfig {
}

export interface BaseBaseConfig extends configTypes.BaseConfig {
}

export interface BaseBaseNodeConfig extends configTypes.BaseNodeConfig {
    baseNetworkId: BaseNetworkId;
    dataVolume: BaseDataVolumeConfig;
    restoreFromSnapshot: boolean;
    l1Endpoint: string;
}
