#!/usr/bin/env node
import 'dotenv/config';
import "source-map-support/register";
import * as cdk from "aws-cdk-lib";
import * as nag from "cdk-nag";
import * as config from "./lib/config/bitcoinConfig";

import { BitcoinSingleNodeStack } from "./lib/single-node-stack";
import { BitcoinCommonStack } from "./lib/common-stack";
import { BitcoinHANodesStack } from "./lib/ha-nodes-stack";

const app = new cdk.App();
cdk.Tags.of(app).add("Project", "AWSBitcoin");

new BitcoinCommonStack(app, "bitcoin-common", {
    stackName: `bitcoin-nodes-common`,
    env: { account: config.baseConfig.accountId, region: config.baseConfig.region },
});

new BitcoinSingleNodeStack(app, "bitcoin-single-node", {
    stackName: `bitcoin-single-node-${config.baseConfig.network}`,
    env: { account: config.baseConfig.accountId, region: config.baseConfig.region },
    instanceType: config.singleNodeConfig.instanceType,
    instanceCpuType: config.singleNodeConfig.instanceCpuType,
    bitcoinNetwork: config.singleNodeConfig.bitcoinNetwork,
    bitcoinVersion: config.singleNodeConfig.bitcoinVersion,
    nodeConfig: config.singleNodeConfig.nodeConfig,
    snapshotConfig: config.singleNodeConfig.snapshotConfig,
    dataVolume: config.singleNodeConfig.dataVolumes[0],
});

new BitcoinHANodesStack(app, "bitcoin-ha-nodes", {
    stackName: `bitcoin-ha-nodes-${config.baseConfig.network}`,
    env: { account: config.baseConfig.accountId, region: config.baseConfig.region },
    instanceType: config.singleNodeConfig.instanceType,
    instanceCpuType: config.singleNodeConfig.instanceCpuType,
    bitcoinNetwork: config.singleNodeConfig.bitcoinNetwork,
    bitcoinVersion: config.singleNodeConfig.bitcoinVersion,
    nodeConfig: config.singleNodeConfig.nodeConfig,
    snapshotConfig: config.singleNodeConfig.snapshotConfig,
    dataVolume: config.singleNodeConfig.dataVolumes[0],
    albHealthCheckGracePeriodMin: config.haNodeConfig.albHealthCheckGracePeriodMin,
    heartBeatDelayMin: config.haNodeConfig.heartBeatDelayMin,
    numberOfNodes: config.haNodeConfig.numberOfNodes,
});

cdk.Aspects.of(app).add(
    new nag.AwsSolutionsChecks({
        verbose: false,
        reports: true,
        logIgnores: false,
    })
);
