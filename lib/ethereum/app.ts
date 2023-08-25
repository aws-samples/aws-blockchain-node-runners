#!/usr/bin/env node
import "source-map-support/register";
import * as cdk from "aws-cdk-lib";
import * as nag from "cdk-nag";
import * as configTypes from "./lib/config/ethConfig.interface";
import * as config from "./lib/config/ethConfig";

import { EthSyncNodeStack } from "./lib/sync-node-stack";
import { EthCommonStack } from "./lib/common-stack";
import { EthRpcNodesStack } from "./lib/rpc-nodes-stack";

const app = new cdk.App();
cdk.Tags.of(app).add("Project", "Ethereum");

const ethClientCombination: configTypes.EthClientCombination = config.baseConfig.clientCombination;

new EthCommonStack(app, "eth-common", {
    env: { account: config.baseConfig.accountId, region: config.baseConfig.region },
    stackName: `eth-nodes-common`,
});

new EthSyncNodeStack(app, "eth-sync-node", {
    stackName: `eth-sync-node-${config.baseConfig.clientCombination}`,

    env: { account: config.baseConfig.accountId, region: config.baseConfig.region },
    ethClientCombination,
    instanceType: config.syncNodeConfig.instanceType,
    instanceCpuType: config.syncNodeConfig.instanceCpuType,
    dataVolumes: config.syncNodeConfig.dataVolumes,
});

new EthRpcNodesStack(app, "eth-rpc-nodes", {
    stackName: `eth-rpc-nodes-${config.baseConfig.clientCombination}`,

    env: { account: config.baseConfig.accountId, region: config.baseConfig.region },
    ethClientCombination,
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
