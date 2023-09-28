#!/usr/bin/env node
import 'dotenv/config'
import "source-map-support/register";
import * as cdk from "aws-cdk-lib";
import * as nag from "cdk-nag";
import * as config from "./lib/config/polygonConfig";

import { PolygonSyncNodeStack } from "./lib/sync-node-stack";
import { PolygonCommonStack } from "./lib/common-stack";
import { PolygonRpcNodesStack } from "./lib/rpc-nodes-stack";

const app = new cdk.App();
cdk.Tags.of(app).add("Project", "AWSPolygon");

new PolygonCommonStack(app, "polygon-common", {
    env: { account: config.baseConfig.accountId, region: config.baseConfig.region },
    stackName: `polygon-nodes-common`,
    createVpcEnpointS3: config.baseConfig.createVpcEnpointS3,
});

new PolygonSyncNodeStack(app, "polygon-sync-node", {
    stackName: `polygon-sync-node-${config.baseConfig.clientCombination}`,

    env: { account: config.baseConfig.accountId, region: config.baseConfig.region },
    polygonClientCombination: config.baseConfig.clientCombination,
    network: config.baseConfig.network,
    instanceType: config.syncNodeConfig.instanceType,
    instanceCpuType: config.syncNodeConfig.instanceCpuType,
    dataVolumes: config.syncNodeConfig.dataVolumes,
});

new PolygonRpcNodesStack(app, "polygon-rpc-nodes", {
    stackName: `polygon-rpc-nodes-${config.baseConfig.clientCombination}`,

    env: { account: config.baseConfig.accountId, region: config.baseConfig.region },
    polygonClientCombination: config.baseConfig.clientCombination,
    network: config.baseConfig.network,
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
