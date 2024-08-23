import 'dotenv/config'
import "source-map-support/register";
import * as cdk from "aws-cdk-lib";
import * as config from "./lib/config/bscConfig";
import { BscCommonStack } from "./lib/common-stack";
import { BscSingleNodeStack } from "./lib/single-node-stack";
import { BscHANodesStack } from "./lib/ha-nodes-stack";
import * as nag from "cdk-nag";

const app = new cdk.App();
cdk.Tags.of(app).add("Project", "AWS_BSC");

new BscCommonStack(app, "bsc-common", {
    stackName: `bsc-nodes-common`,
    env: { account: config.baseConfig.accountId, region: config.baseConfig.region }
});

new BscSingleNodeStack(app, "bsc-single-node", {
    stackName: `bsc-single-node-${config.baseNodeConfig.nodeConfiguration}-${config.baseNodeConfig.bscNetwork}`,

    env: { account: config.baseConfig.accountId, region: config.baseConfig.region },
    ...config.baseNodeConfig
});

new BscHANodesStack(app, "bsc-ha-nodes", {
    stackName: `bsc-ha-nodes-${config.baseNodeConfig.nodeConfiguration}-${config.baseNodeConfig.bscNetwork}`,
    env: { account: config.baseConfig.accountId, region: config.baseConfig.region },
    ...config.baseNodeConfig,
    ...config.haNodeConfig
});

// Security Check
cdk.Aspects.of(app).add(
    new nag.AwsSolutionsChecks({
        verbose: false,
        reports: true,
        logIgnores: false
    })
);
