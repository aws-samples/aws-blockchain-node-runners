import 'dotenv/config'
import "source-map-support/register";
import * as cdk from "aws-cdk-lib";
import * as config from "./lib/config/bscConfig";
import * as configTypes from "./lib/config/bscConfig.interface";
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
    nodeRole: <configTypes.BscNodeRole> "single-node",
    instanceType: config.baseNodeConfig.instanceType,
    instanceCpuType: config.baseNodeConfig.instanceCpuType,
    bscNetwork: config.baseNodeConfig.bscNetwork,
    nodeConfiguration: config.baseNodeConfig.nodeConfiguration,
    snapshotsUrl:config.baseNodeConfig.snapshotsUrl,
    dataVolume: config.baseNodeConfig.dataVolume,
});

new BscHANodesStack(app, "bsc-ha-nodes", {
    stackName: `bsc-ha-nodes-${config.baseNodeConfig.nodeConfiguration}-${config.baseNodeConfig.bscNetwork}`,
    env: { account: config.baseConfig.accountId, region: config.baseConfig.region },
    nodeRole: <configTypes.BscNodeRole> "rpc-node",
    instanceType: config.baseNodeConfig.instanceType,
    instanceCpuType: config.baseNodeConfig.instanceCpuType,
    bscNetwork: config.baseNodeConfig.bscNetwork,
    nodeConfiguration: config.baseNodeConfig.nodeConfiguration,
    snapshotsUrl:config.baseNodeConfig.snapshotsUrl,
    dataVolume: config.baseNodeConfig.dataVolume,

    albHealthCheckGracePeriodMin: config.haNodeConfig.albHealthCheckGracePeriodMin,
    heartBeatDelayMin: config.haNodeConfig.heartBeatDelayMin,
    numberOfNodes: config.haNodeConfig.numberOfNodes
});

// Security Check
cdk.Aspects.of(app).add(
    new nag.AwsSolutionsChecks({
        verbose: false,
        reports: true,
        logIgnores: false
    })
);

