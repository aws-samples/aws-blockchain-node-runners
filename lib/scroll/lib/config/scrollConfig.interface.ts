import * as configTypes from "../../../constructs/config.interface";

export type ScrollCluster = "mainnet" | "testnet" | "devnet";
export type ScrollNodeConfiguration = "consensus" | "baserpc" | "extendedrpc";

export interface ScrollDataVolumeConfig extends configTypes.DataVolumeConfig {
}

export interface ScrollAccountsVolumeConfig extends configTypes.DataVolumeConfig {
}

export interface ScrollBaseConfig extends configTypes.BaseConfig {
}

export interface ScrollBaseNodeConfig extends configTypes.BaseNodeConfig {
    scrollCluster: ScrollCluster;
    scrollVersion: string;
    nodeConfiguration: ScrollNodeConfiguration;
    dataVolume: ScrollDataVolumeConfig;
    scrollNodeIdentitySecretARN: string;
    voteAccountSecretARN: string;
    authorizedWithdrawerAccountSecretARN: string;
    registrationTransactionFundingAccountSecretARN: string;
    l1Endpoint: string;
}

export interface ScrollHAConfig {
    albHealthCheckGracePeriodMin: number;
    heartBeatDelayMin: number;
    numberOfNodes: number;
}
