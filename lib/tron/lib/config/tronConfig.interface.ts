import * as configTypes from "../../../constructs/config.interface";

export type TronNetwork = "mainnet" | "nile";
// "full"  - FullNode: stores complete history (~2.9TB), all HTTP/gRPC APIs
// "lite"  - Lite FullNode: state snapshot + latest 65536 blocks (~3% of full), faster start
export type TronNodeConfiguration = "full" | "lite";

// Snapshot bootstrap source:
//  "none"   - sync from genesis (slow)
//  "public" - download from TRON official snapshot host (accelerated with aria2c multi-connection)
//  "s3"     - restore from your own private S3 staging bucket populated by the snapshot node (s5cmd)
export type TronSnapshotType = "none" | "public" | "s3";

// java-tron storage engine. On ARM64 (Graviton) only ROCKSDB is supported;
// LEVELDB is deprecated for arm per java-tron config.conf.
export type TronDbEngine = "rocksdb" | "leveldb";

export type TronNodeRole = "single-node" | "rpc-node" | "snapshot-node";

export interface TronDataVolumeConfig extends configTypes.DataVolumeConfig {

}

export interface TronBaseConfig extends configTypes.BaseConfig {

}

export interface TronBaseNodeConfig extends configTypes.BaseNodeConfig {
    tronNetwork: TronNetwork;
    nodeConfiguration: TronNodeConfiguration;
    dbEngine: TronDbEngine;
    snapshotType: TronSnapshotType;
    snapshotsUrl: string;
    dataVolume: TronDataVolumeConfig;
    downloadSnapshot: boolean;
}

export interface TronHAConfig {
    albHealthCheckGracePeriodMin: number;
    heartBeatDelayMin: number;
    numberOfNodes: number;
}
