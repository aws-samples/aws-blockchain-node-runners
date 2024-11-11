#!/usr/bin/env node
import 'dotenv/config'
import "source-map-support/register";
import * as cdk from "aws-cdk-lib";
import * as nag from "cdk-nag";
import * as config from "./lib/config/solanaConfig";

import { SolanaSingleNodeStack } from "./lib/single-node-stack";
import { SolanaCommonStack } from "./lib/common-stack";
import { SolanaHANodesStack } from "./lib/ha-nodes-stack";

const app = new cdk.App();
cdk.Tags.of(app).add("Project", "AWSSolana");

new SolanaCommonStack(app, "solana-common", {
    stackName: `solana-nodes-common`,
    env: { account: config.baseConfig.accountId, region: config.baseConfig.region },
});

new SolanaSingleNodeStack(app, "solana-single-node", {
    stackName: `solana-single-node-${config.baseNodeConfig.nodeConfiguration}`,
    env: { account: config.baseConfig.accountId, region: config.baseConfig.region },

    instanceType: config.baseNodeConfig.instanceType,
    instanceCpuType: config.baseNodeConfig.instanceCpuType,
    solanaCluster: config.baseNodeConfig.solanaCluster,
    solanaVersion: config.baseNodeConfig.solanaVersion,
    nodeConfiguration: config.baseNodeConfig.nodeConfiguration,
    dataVolume: config.baseNodeConfig.dataVolume,
    accountsVolume: config.baseNodeConfig.accountsVolume,
    solanaNodeIdentitySecretARN: config.baseNodeConfig.solanaNodeIdentitySecretARN,
    voteAccountSecretARN: config.baseNodeConfig.voteAccountSecretARN,
    authorizedWithdrawerAccountSecretARN: config.baseNodeConfig.authorizedWithdrawerAccountSecretARN,
    registrationTransactionFundingAccountSecretARN: config.baseNodeConfig.registrationTransactionFundingAccountSecretARN,
});

if (app.node.tryGetContext('deployHA') === 'true') {
    if (config.baseNodeConfig.nodeConfiguration !== "consensus") {
        new SolanaHANodesStack(app, "solana-ha-nodes", {
            stackName: `solana-ha-nodes-${config.baseNodeConfig.nodeConfiguration}`,
            env: { account: config.baseConfig.accountId, region: config.baseConfig.region },

            instanceType: config.baseNodeConfig.instanceType,
            instanceCpuType: config.baseNodeConfig.instanceCpuType,
            solanaCluster: config.baseNodeConfig.solanaCluster,
            solanaVersion: config.baseNodeConfig.solanaVersion,
            nodeConfiguration: config.baseNodeConfig.nodeConfiguration,
            dataVolume: config.baseNodeConfig.dataVolume,
            accountsVolume: config.baseNodeConfig.accountsVolume,

            albHealthCheckGracePeriodMin: config.haNodeConfig.albHealthCheckGracePeriodMin,
            heartBeatDelayMin: config.haNodeConfig.heartBeatDelayMin,
            numberOfNodes: config.haNodeConfig.numberOfNodes,
        });
    } else {
        throw new Error("Consensus node configuration is not yet supported for HA setup");
    }
}

// Security Check
cdk.Aspects.of(app).add(
    new nag.AwsSolutionsChecks({
        verbose: false,
        reports: true,
        logIgnores: false,
    })
);
