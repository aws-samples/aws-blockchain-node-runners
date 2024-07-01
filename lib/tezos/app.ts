import 'dotenv/config'
import "source-map-support/register";
import * as cdk from "aws-cdk-lib";
import * as config from "./lib/config/tzConfig";
import * as configTypes from "./lib/config/tzConfig.interface";
import { TzCommonStack } from "./lib/common-stack";
import { TzSingleNodeStack } from "./lib/single-node-stack";
import { TzHANodesStack } from "./lib/ha-nodes-stack";
import * as nag from "cdk-nag";
import { TzSnapshotNodeStack } from './lib/snapshot-node-stack';

const app = new cdk.App();
cdk.Tags.of(app).add("Project", "AWS_TZ");

const commonStack = new TzCommonStack(app, "tz-common", {
    stackName: `tz-nodes-common`,
    env: { account: config.baseConfig.accountId, region: config.baseConfig.region }
});

const singleNodeStack = new TzSingleNodeStack(app, "tz-single-node", {
    stackName: `tz-single-node-${config.baseNodeConfig.historyMode}-${config.baseNodeConfig.tzNetwork}`,

    env: { account: config.baseConfig.accountId, region: config.baseConfig.region },
    nodeRole: <configTypes.TzNodeRole> "single-node",
    instanceType: config.baseNodeConfig.instanceType,
    instanceCpuType: config.baseNodeConfig.instanceCpuType,
    tzNetwork: config.baseNodeConfig.tzNetwork,
    historyMode: config.baseNodeConfig.historyMode,
    snapshotsUrl:config.baseNodeConfig.snapshotsUrl,
    octezDownloadUri: config.baseNodeConfig.octezDownloadUri,
    downloadSnapshot: config.baseNodeConfig.downloadSnapshot == "true",
    dataVolume: config.baseNodeConfig.dataVolume,
});
singleNodeStack.addDependency(commonStack);

const snapshotNode = new TzSnapshotNodeStack(app, "tz-snapshot-node", {
    stackName: `tz-snapshot-node-${config.baseNodeConfig.historyMode}-${config.baseNodeConfig.tzNetwork}`,
    env: { account: config.baseConfig.accountId, region: config.baseConfig.region },
    nodeRole: <configTypes.TzNodeRole> "rpc-node",
    instanceType: config.baseNodeConfig.instanceType,
    instanceCpuType: config.baseNodeConfig.instanceCpuType,
    tzNetwork: config.baseNodeConfig.tzNetwork,
    historyMode: config.baseNodeConfig.historyMode,
    snapshotsUrl:config.baseNodeConfig.snapshotsUrl,
    downloadSnapshot: config.baseNodeConfig.downloadSnapshot == "true"
})

const haNodeStack = new TzHANodesStack(app, "tz-ha-nodes", {
    stackName: `tz-ha-nodes-${config.baseNodeConfig.historyMode}-${config.baseNodeConfig.tzNetwork}`,
    env: { account: config.baseConfig.accountId, region: config.baseConfig.region },
    nodeRole: <configTypes.TzNodeRole> "rpc-node",
    instanceType: config.baseNodeConfig.instanceType,
    instanceCpuType: config.baseNodeConfig.instanceCpuType,
    tzNetwork: config.baseNodeConfig.tzNetwork,
    historyMode: config.baseNodeConfig.historyMode,
    snapshotsUrl:config.baseNodeConfig.snapshotsUrl,
    dataVolume: config.baseNodeConfig.dataVolume,

    albHealthCheckGracePeriodMin: config.haNodeConfig.albHealthCheckGracePeriodMin,
    heartBeatDelayMin: config.haNodeConfig.heartBeatDelayMin,
    numberOfNodes: config.haNodeConfig.numberOfNodes,
    downloadSnapshot: config.baseNodeConfig.downloadSnapshot == "true"
});
haNodeStack.addDependency(commonStack);
haNodeStack.addDependency(snapshotNode);

// Security Check
cdk.Aspects.of(app).add(
    new nag.AwsSolutionsChecks({
        verbose: false,
        reports: true,
        logIgnores: false
    })
);
