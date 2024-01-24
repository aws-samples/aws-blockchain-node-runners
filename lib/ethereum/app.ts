#!/usr/bin/env node
import 'dotenv/config'
import "source-map-support/register";
import * as cdk from "aws-cdk-lib";
import * as nag from "cdk-nag";
import * as config from "./lib/config/ethConfig";
import { EthNodeRole } from "./lib/config/ethConfig.interface";

import { EthSingleNodeStack } from "./lib/single-node-stack";
import { EthCommonStack } from "./lib/common-stack";
import { EthRpcNodesStack } from "./lib/rpc-nodes-stack";

const app = new cdk.App();
cdk.Tags.of(app).add("Project", "Ethereum");

new EthCommonStack(app, "eth-common", {
    env: { account: config.baseConfig.accountId, region: config.baseConfig.region },
    stackName: `eth-nodes-common`,
});

new EthSingleNodeStack(app, "eth-sync-node", {
    stackName: `eth-sync-node-${config.baseConfig.clientCombination}`,

    env: { account: config.baseConfig.accountId, region: config.baseConfig.region },
    ethClientCombination: config.baseConfig.clientCombination,
    nodeRole: <EthNodeRole> "sync-node",
    instanceType: config.syncNodeConfig.instanceType,
    instanceCpuType: config.syncNodeConfig.instanceCpuType,
    dataVolumes: config.syncNodeConfig.dataVolumes,
});

new EthSingleNodeStack(app, "eth-single-node", {
    stackName: `eth-single-node-${config.baseConfig.clientCombination}`,

    env: { account: config.baseConfig.accountId, region: config.baseConfig.region },
    ethClientCombination: config.baseConfig.clientCombination,
    nodeRole: <EthNodeRole> "single-node",
    instanceType: config.syncNodeConfig.instanceType,
    instanceCpuType: config.syncNodeConfig.instanceCpuType,
    dataVolumes: config.syncNodeConfig.dataVolumes,
});

new EthRpcNodesStack(app, "eth-rpc-nodes", {
    stackName: `eth-rpc-nodes-${config.baseConfig.clientCombination}`,

    env: { account: config.baseConfig.accountId, region: config.baseConfig.region },
    ethClientCombination: config.baseConfig.clientCombination,
    nodeRole: <EthNodeRole> "rpc-node",
    instanceType: config.rpcNodeConfig.instanceType,
    instanceCpuType: config.rpcNodeConfig.instanceCpuType,
    numberOfNodes: config.rpcNodeConfig.numberOfNodes,
    albHealthCheckGracePeriodMin: config.rpcNodeConfig.albHealthCheckGracePeriodMin,
    heartBeatDelayMin: config.rpcNodeConfig.heartBeatDelayMin,
    dataVolumes: config.syncNodeConfig.dataVolumes,
});


// Security Check
cdk.Aspects.of(app).add(
    new nag.AwsSolutionsChecks({
        verbose: false,
        reports: true,
        logIgnores: false,
    })
);
