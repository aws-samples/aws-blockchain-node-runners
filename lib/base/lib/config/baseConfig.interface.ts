import * as configTypes from "../../../constructs/config.interface";

export type BaseNetworkId = "mainnet" | "sepolia";
export type BaseClient = "geth" | "reth";
export type BaseNodeConfiguration = "full" | "archive";

export {AMBEthereumNodeNetworkId} from "../../../constructs/config.interface";

export interface BaseDataVolumeConfig extends configTypes.DataVolumeConfig {
}

export interface BaseAccountsVolumeConfig extends configTypes.DataVolumeConfig {
}

export interface BaseBaseConfig extends configTypes.BaseConfig {
}

export interface BaseBaseNodeConfig extends configTypes.BaseNodeConfig {
    baseNetworkId: BaseNetworkId;
    baseClient: BaseClient;
    baseNodeConfiguration: BaseNodeConfiguration;
    dataVolume: BaseDataVolumeConfig;
    restoreFromSnapshot: boolean;
    l1ExecutionEndpoint: string;
    l1ConsensusEndpoint: string;
    snapshotUrl: string;
}

export interface BaseHAConfig {
    albHealthCheckGracePeriodMin: number;
    heartBeatDelayMin: number;
    numberOfNodes: number;
}
