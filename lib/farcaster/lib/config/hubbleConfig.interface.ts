import * as configTypes from "../../../constructs/config.interface";

export type HubbleNetworkId = "mainnet" ;
export type HubbleNodeConfiguration = "full" ;

export {AMBEthereumNodeNetworkId} from "../../../constructs/config.interface";

export interface HubbleDataVolumeConfig extends configTypes.DataVolumeConfig {
}

export interface HubbleAccountsVolumeConfig extends configTypes.DataVolumeConfig {
}

export interface HubbleBaseConfig extends configTypes.BaseConfig {
}

export interface HubbleBaseNodeConfig extends configTypes.BaseNodeConfig {
    ambEntereumNodeNetworkId: configTypes.AMBEthereumNodeNetworkId;
    ambEntereumNodeInstanceType: string;
    hubbleNetworkId: HubbleNetworkId;
    nodeConfiguration: HubbleNodeConfiguration;
    dataVolume: HubbleDataVolumeConfig;
    opMainnetUrl: string;
    hubOperatorID: string
}
