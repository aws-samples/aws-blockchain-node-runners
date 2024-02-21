import * as configTypes from "../../../constructs/config.interface";

export type StacksNetwork = "mainnet" | "testnet";
export type StacksNodeConfiguration = "follower" | "signer" | "miner";

export interface StacksVolumeConfig extends configTypes.DataVolumeConfig {
}

export interface StacksBaseConfig extends configTypes.BaseConfig {
}

export interface StacksNetworkConfig {
    stacksNetwork: StacksNetwork;
    stacksBootstrapNode: string;
    stacksChainstateArchive: string;
    stacksP2pPort: number;
    stacksRpcPort: number;
    bitcoinPeerHost: string;
    bitcoinRpcUsername: string;
    bitcoinRpcPassword: string;
    bitcoinP2pPort: number;
    bitcoinRpcPort: number;
}

export interface StacksBaseNodeConfig extends StacksNetworkConfig, configTypes.BaseNodeConfig {
    stacksVersion: string;
    stacksNodeConfiguration: StacksNodeConfiguration;
    stacksSignerSecretArn: string;
    stacksMinerSecretArn: string;
    dataVolume: StacksVolumeConfig;
    // Ssh access for debugging. TODO: delete before merge to upstream repo.
    debugKeyName?: string;
}

export interface StacksHAConfig {
    albHealthCheckGracePeriodMin: number;
    heartBeatDelayMin: number;
    numberOfNodes: number;
}
