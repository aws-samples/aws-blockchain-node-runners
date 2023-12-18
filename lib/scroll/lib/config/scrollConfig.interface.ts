import * as configTypes from "../../../constructs/config.interface";

export type ScrollNetworkId = "mainnet" ;
export type ScrollNodeConfiguration = "full" ;

export {AMBEthereumNodeNetworkId} from "../../../constructs/config.interface";

export interface ScrollDataVolumeConfig extends configTypes.DataVolumeConfig {
}

export interface ScrollAccountsVolumeConfig extends configTypes.DataVolumeConfig {
}

export interface ScrollBaseConfig extends configTypes.BaseConfig {
}

export interface ScrollBaseNodeConfig extends configTypes.BaseNodeConfig {
    ambEntereumNodeNetworkId: configTypes.AMBEthereumNodeNetworkId;
    ambEntereumNodeInstanceType: string;
    scrollNetworkId: ScrollNetworkId;
    scrollVersion: string;
    nodeConfiguration: ScrollNodeConfiguration;
    dataVolume: ScrollDataVolumeConfig;
}
