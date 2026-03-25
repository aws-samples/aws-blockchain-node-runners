#!/usr/bin/env node
import 'dotenv/config'
import "source-map-support/register";
import * as cdk from "aws-cdk-lib";
import * as nag from "cdk-nag";
import * as config from "./lib/config/node-config";

import { PolygonSingleNodeStack } from "./lib/single-node-stack";
import { PolygonHaNodesStack } from "./lib/ha-nodes-stack";
import { PolygonCommonStack } from "./lib/common-stack";

const app = new cdk.App();
cdk.Tags.of(app).add("Project", "AWSPolygon");

new PolygonCommonStack(app, "polygon-common", {
    stackName: `polygon-nodes-common`,
    env: { account: config.baseConfig.accountId, region: config.baseConfig.region },
});

new PolygonSingleNodeStack(app, "polygon-single-node", {
    stackName: `polygon-single-node-${config.baseConfig.network}`,
    env: { account: config.baseConfig.accountId, region: config.baseConfig.region },
    network: config.baseConfig.network,
    erigonImage: config.baseConfig.erigonImage,
    heimdallApiUrl: config.baseConfig.heimdallApiUrl,
    instanceType: config.singleNodeConfig.instanceType,
    instanceCpuType: config.singleNodeConfig.instanceCpuType,
    dataVolume: config.singleNodeConfig.dataVolumes[0],
});

new PolygonHaNodesStack(app, "polygon-ha-nodes", {
    stackName: `polygon-ha-nodes-${config.baseConfig.network}`,
    env: { account: config.baseConfig.accountId, region: config.baseConfig.region },
    network: config.baseConfig.network,
    erigonImage: config.baseConfig.erigonImage,
    heimdallApiUrl: config.baseConfig.heimdallApiUrl,
    instanceType: config.haNodeConfig.instanceType,
    instanceCpuType: config.haNodeConfig.instanceCpuType,
    numberOfNodes: config.haNodeConfig.numberOfNodes,
    albHealthCheckGracePeriodMin: config.haNodeConfig.albHealthCheckGracePeriodMin,
    heartBeatDelayMin: config.haNodeConfig.heartBeatDelayMin,
    dataVolume: config.haNodeConfig.dataVolumes[0],
});

cdk.Aspects.of(app).add(
    new nag.AwsSolutionsChecks({
        verbose: false,
        reports: true,
        logIgnores: false,
    })
);
