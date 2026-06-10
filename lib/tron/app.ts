import 'dotenv/config'
import "source-map-support/register";
import * as cdk from "aws-cdk-lib";
import * as config from "./lib/config/tronConfig";
import { TronCommonStack } from "./lib/common-stack";
import { TronSingleNodeStack } from "./lib/single-node-stack";
import { TronHANodesStack } from "./lib/ha-nodes-stack";
import { TronSnapshotNodeStack } from "./lib/snapshot-node-stack";
import * as nag from "cdk-nag";

const app = new cdk.App();
cdk.Tags.of(app).add("Project", "AWS_TRON");

new TronCommonStack(app, "tron-common", {
    stackName: `tron-nodes-common`,
    env: { account: config.baseConfig.accountId, region: config.baseConfig.region }
});

new TronSingleNodeStack(app, "tron-single-node", {
    stackName: `tron-single-node-${config.baseNodeConfig.nodeConfiguration}-${config.baseNodeConfig.tronNetwork}`,

    env: { account: config.baseConfig.accountId, region: config.baseConfig.region },
    ...config.baseNodeConfig
});

new TronSnapshotNodeStack(app, "tron-snapshot-node", {
    stackName: `tron-snapshot-node-${config.baseNodeConfig.nodeConfiguration}-${config.baseNodeConfig.tronNetwork}`,
    env: { account: config.baseConfig.accountId, region: config.baseConfig.region },
    ...config.baseNodeConfig
});

new TronHANodesStack(app, "tron-ha-nodes", {
    stackName: `tron-ha-nodes-${config.baseNodeConfig.nodeConfiguration}-${config.baseNodeConfig.tronNetwork}`,
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
