#!/usr/bin/env node
import 'dotenv/config'
import "source-map-support/register";
import * as cdk from "aws-cdk-lib";
import * as nag from "cdk-nag";
import * as config from "./lib/config/node-config";
import { EthNodeRole } from "./lib/config/node-config.interface";

import { EthSingleNodeStack } from "./lib/single-node-stack";
import { EthCommonStack } from "./lib/common-stack";
import { EthRpcNodesStack } from "./lib/rpc-nodes-stack";

const app = new cdk.App();
cdk.Tags.of(app).add("Project", "AWSEthereum");

new EthCommonStack(app, "eth-common", {
    stackName: `eth-nodes-common`,
    env: { account: config.baseConfig.accountId, region: config.baseConfig.region },
    snapshotType: config.baseConfig.snapshotType,
});

new EthSingleNodeStack(app, "eth-sync-node", {
    stackName: `eth-sync-node-${config.baseConfig.clientCombination}`,

    env: { account: config.baseConfig.accountId, region: config.baseConfig.region },
    ethClientCombination: config.baseConfig.clientCombination,
    network: config.baseConfig.network,
    snapshotType: config.baseConfig.snapshotType,
    consensusSnapshotURL: config.baseConfig.consensusSnapshotURL,
    executionSnapshotURL: config.baseConfig.executionSnapshotURL,
    consensusCheckpointSyncURL: config.baseConfig.consensusCheckpointSyncURL,
    nodeRole: <EthNodeRole> "sync-node",
    instanceType: config.syncNodeConfig.instanceType,
    instanceCpuType: config.syncNodeConfig.instanceCpuType,
    dataVolume: config.syncNodeConfig.dataVolumes[0],
});

new EthSingleNodeStack(app, "eth-single-node", {
    stackName: `eth-single-node-${config.baseConfig.clientCombination}`,

    env: { account: config.baseConfig.accountId, region: config.baseConfig.region },
    ethClientCombination: config.baseConfig.clientCombination,
    network: config.baseConfig.network,
    snapshotType: config.baseConfig.snapshotType,
    consensusSnapshotURL: config.baseConfig.consensusSnapshotURL,
    executionSnapshotURL: config.baseConfig.executionSnapshotURL,
    consensusCheckpointSyncURL: config.baseConfig.consensusCheckpointSyncURL,
    nodeRole: <EthNodeRole> "single-node",
    instanceType: config.rpcNodeConfig.instanceType,
    instanceCpuType: config.rpcNodeConfig.instanceCpuType,
    dataVolume: config.rpcNodeConfig.dataVolumes[0],
});

new EthRpcNodesStack(app, "eth-rpc-nodes", {
    stackName: `eth-rpc-nodes-${config.baseConfig.clientCombination}`,

    env: { account: config.baseConfig.accountId, region: config.baseConfig.region },
    ethClientCombination: config.baseConfig.clientCombination,
    network: config.baseConfig.network,
    snapshotType: config.baseConfig.snapshotType,
    consensusSnapshotURL: config.baseConfig.consensusSnapshotURL,
    executionSnapshotURL: config.baseConfig.executionSnapshotURL,
    consensusCheckpointSyncURL: config.baseConfig.consensusCheckpointSyncURL,
    nodeRole: <EthNodeRole> "rpc-node",
    instanceType: config.rpcNodeConfig.instanceType,
    instanceCpuType: config.rpcNodeConfig.instanceCpuType,
    numberOfNodes: config.rpcNodeConfig.numberOfNodes,
    albHealthCheckGracePeriodMin: config.rpcNodeConfig.albHealthCheckGracePeriodMin,
    heartBeatDelayMin: config.rpcNodeConfig.heartBeatDelayMin,
    dataVolume: config.syncNodeConfig.dataVolumes[0],
});


// Security Check
cdk.Aspects.of(app).add(
    new nag.AwsSolutionsChecks({
        verbose: false,
        reports: true,
        logIgnores: false,
    })
);
