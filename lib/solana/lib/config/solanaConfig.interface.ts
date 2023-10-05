import * as configTypes from "../../../constructs/config.interface";

export type SolanaCluster = "mainnet-beta" | "testnet" | "devnet";
export type SolanaNodeConfiguration = "consensus" | "lightrpc" | "heavyrpc";

export interface SolanaDataVolumeConfig extends configTypes.DataVolumeConfig {
}

export interface SolanaAccountsVolumeConfig extends configTypes.DataVolumeConfig {
}

export interface SolanaBaseConfig extends configTypes.BaseConfig {
}

export interface SolanaBaseNodeConfig extends configTypes.BaseNodeConfig {
    solanaCluster: SolanaCluster;
    solanaVersion: string;
    nodeConfiguration: SolanaNodeConfiguration;
    dataVolume: SolanaDataVolumeConfig;
    accountsVolume: SolanaAccountsVolumeConfig;
    solanaNodeIdentitySecretARN: string;
    voteAccountSecretARN: string;
    authorizedWithdrawerAccountSecretARN: string;
    registrationTransactionFundingAccountSecretARN: string;
}

export interface SolanaHAConfig {
    albHealthCheckGracePeriodMin: number;
    heartBeatDelayMin: number;
    numberOfNodes: number;
}
