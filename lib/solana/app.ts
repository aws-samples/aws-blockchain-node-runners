#!/usr/bin/env node
import 'dotenv/config'
import "source-map-support/register";
import * as cdk from "aws-cdk-lib";
import * as nag from "cdk-nag";
import * as config from "./lib/config/node-config";

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

    ...config.baseNodeConfig
});

new SolanaHANodesStack(app, "solana-ha-nodes", {
    stackName: `solana-ha-nodes-${config.baseNodeConfig.nodeConfiguration}`,
    env: { account: config.baseConfig.accountId, region: config.baseConfig.region },

    ...config.baseNodeConfig,
    ...config.haNodeConfig,
});


// Security Check
cdk.Aspects.of(app).add(
    new nag.AwsSolutionsChecks({
        verbose: false,
        reports: true,
        logIgnores: false,
    })
);
