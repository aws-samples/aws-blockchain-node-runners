import * as configTypes from "../../../constructs/config.interface";

export type BitcoinNetwork = "mainnet" | "testnet" | "signet" | "regtest";

export interface BitcoinDataVolumeConfig extends configTypes.DataVolumeConfig {
}

export interface BitcoinBaseConfig extends configTypes.BaseConfig {
    network: BitcoinNetwork;
}

export interface BitcoinSnapshotConfig {
    restoreFromSnapshot: boolean;
    snapshotUrl: string;  // User-provided URL or "none" to skip
}

export interface BitcoinNodeConfig {
    // Bitcoin Core configuration
    txindex: boolean;
    server: boolean;
    listen: boolean;
    dbcache: number;
    maxconnections: number;
    rpcallowip: string;
    rpcauth: string;
    prune: number;  // 0 = no pruning, >0 = prune to this many MB
    maxmempool: number;
    mempoolexpiry: number;
    maxorphantx: number;
    blocksonly: boolean;
    assumevalid: string;
    // ZMQ configuration
    zmqpubrawblock: string;
    zmqpubrawtx: string;
    zmqpubhashblock: string;
    zmqpubhashtx: string;
}

export interface BitcoinSingleNodeConfig extends configTypes.SingleNodeConfig {
    bitcoinNetwork: BitcoinNetwork;
    bitcoinVersion: string;
    nodeConfig: BitcoinNodeConfig;
    snapshotConfig: BitcoinSnapshotConfig;
}

export interface BitcoinHAConfig {
    albHealthCheckGracePeriodMin: number;
    heartBeatDelayMin: number;
    numberOfNodes: number;
}
