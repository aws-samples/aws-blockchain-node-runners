import 'dotenv/config'
import "source-map-support/register";
import * as cdk from "aws-cdk-lib";
import * as config from "./lib/config/fantomConfig";
import * as configTypes from "./lib/config/fantomConfig.interface";
import { FantomCommonStack } from "./lib/common-stack";
import { FantomSingleNodeStack } from "./lib/single-node-stack";
import { FantomHANodesStack } from "./lib/ha-nodes-stack";
import * as nag from "cdk-nag";

const app = new cdk.App();
cdk.Tags.of(app).add("Project", "AWS_FANTOM");

new FantomCommonStack(app, "fantom-common", {
    stackName: `fantom-nodes-common`,
    env: { account: config.baseConfig.accountId, region: config.baseConfig.region }
});

new FantomSingleNodeStack(app, "fantom-single-node", {
    stackName: `fantom-single-node-${config.baseNodeConfig.nodeConfiguration}-${config.baseNodeConfig.fantomNetwork}`,

    env: { account: config.baseConfig.accountId, region: config.baseConfig.region },
    nodeRole: <configTypes.FantomNodeRole> "single-node",
    instanceType: config.baseNodeConfig.instanceType,
    instanceCpuType: config.baseNodeConfig.instanceCpuType,
    fantomNetwork: config.baseNodeConfig.fantomNetwork,
    nodeConfiguration: config.baseNodeConfig.nodeConfiguration,
    snapshotsUrl:config.baseNodeConfig.snapshotsUrl,
    dataVolume: config.baseNodeConfig.dataVolume,
});

new FantomHANodesStack(app, "fantom-ha-nodes", {
    stackName: `fantom-ha-nodes-${config.baseNodeConfig.nodeConfiguration}-${config.baseNodeConfig.fantomNetwork}`,
    env: { account: config.baseConfig.accountId, region: config.baseConfig.region },
    nodeRole: <configTypes.FantomNodeRole> "rpc-node",
    instanceType: config.baseNodeConfig.instanceType,
    instanceCpuType: config.baseNodeConfig.instanceCpuType,
    fantomNetwork: config.baseNodeConfig.fantomNetwork,
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
