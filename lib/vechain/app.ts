import * as cdk from "aws-cdk-lib";
import "dotenv/config";
import { VetCommonStack } from "./lib/common-stack";
import * as config from "./lib/config/node-config";
import { VETHaNodeStack } from "./lib/ha-node-stack";
import { VETSingleNodeStack } from "./lib/single-node-stack";

const app = new cdk.App();
cdk.Tags.of(app).add("Project", "AWSVet");

const commonStack = new VetCommonStack(app, "vet-common", {
    stackName: `vet-common`,
    env: { account: config.baseConfig.accountId, region: config.baseConfig.region },
});

new VETSingleNodeStack(app, `vet-single-node`, {
    env: { account: config.baseConfig.accountId, region: config.baseConfig.region },
    vetNodeType: config.baseNodeConfig.vetNodeType,
    syncFromPublicSnapshot: config.baseNodeConfig.syncFromPublicSnapshot,
    instanceType: config.baseNodeConfig.instanceType,
    instanceCpuType: config.baseNodeConfig.instanceCpuType,
    dataVolume: config.baseNodeConfig.dataVolume,
    network: config.baseNodeConfig.network,
    vetContainerImage: config.baseNodeConfig.vetContainerImage,
    instanceRole: commonStack.instanceRole,
});

// Note: The Load balancer is not exposed to the public internet
// therefore you can only access the nodes from within the VPC
// HA nodes are only supported for public nodes
new VETHaNodeStack(app, `vet-ha-node`, {
    env: { account: config.baseConfig.accountId, region: config.baseConfig.region },
    vetNodeType: config.baseNodeConfig.vetNodeType,
    syncFromPublicSnapshot: config.baseNodeConfig.syncFromPublicSnapshot,
    instanceType: config.baseNodeConfig.instanceType,
    instanceCpuType: config.baseNodeConfig.instanceCpuType,
    dataVolume: config.baseNodeConfig.dataVolume,
    network: config.baseNodeConfig.network,
    vetContainerImage: config.baseNodeConfig.vetContainerImage,
    instanceRole: commonStack.instanceRole,
    albHealthCheckGracePeriodMin: config.haNodeConfig.albHealthCheckGracePeriodMin,
    heartBeatDelayMin: config.haNodeConfig.heartBeatDelayMin,
    numberOfNodes: config.haNodeConfig.numberOfNodes,
});
