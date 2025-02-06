#!/usr/bin/env node
import "dotenv/config";
import * as cdk from "aws-cdk-lib";
import * as nag from "cdk-nag";
import * as config from "./lib/config/XRPConfig";

import { XRPSingleNodeStack } from "./lib/single-node-stack";
import { XRPCommonStack } from "./lib/common-stack";
import { XRPHANodesStack } from "./lib/ha-nodes-stack";

const app = new cdk.App();
cdk.Tags.of(app).add("Project", "AWSXRP");

const commonStack = new XRPCommonStack(app, "XRP-common", {
    stackName: `XRP-nodes-common`,
    env: { account: config.baseConfig.accountId, region: config.baseConfig.region },
});

new XRPSingleNodeStack(app, "XRP-single-node", {
    env: { account: config.baseConfig.accountId, region: config.baseConfig.region },
    stackName: `XRP-single-node`,
    instanceType: config.baseNodeConfig.instanceType,
    instanceCpuType: config.baseNodeConfig.instanceCpuType,
    dataVolume: config.baseNodeConfig.dataVolume,
    hubNetworkID: config.baseNodeConfig.hubNetworkID,
    instanceRole: commonStack.instanceRole,
});

    new XRPHANodesStack(app, "XRP-ha-nodes", {
        stackName: "xrp-ha-nodes",
        env: { account: config.baseConfig.accountId, region: config.baseConfig.region },
        instanceType: config.baseNodeConfig.instanceType,
        instanceCpuType: config.baseNodeConfig.instanceCpuType,
        dataVolume: config.baseNodeConfig.dataVolume,
        hubNetworkID: config.baseNodeConfig.hubNetworkID,
        instanceRole: commonStack.instanceRole,
        albHealthCheckGracePeriodMin: config.haNodeConfig.albHealthCheckGracePeriodMin,
        heartBeatDelayMin: config.haNodeConfig.heartBeatDelayMin,
        numberOfNodes: config.haNodeConfig.numberOfNodes,
    });

// Security Check
cdk.Aspects.of(app).add(
    new nag.AwsSolutionsChecks({
        verbose: false,
        reports: true,
        logIgnores: false,
    })
);
