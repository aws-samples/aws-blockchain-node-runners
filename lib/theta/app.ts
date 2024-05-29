import 'dotenv/config'
import "source-map-support/register";
import * as cdk from "aws-cdk-lib";
import * as config from "./lib/config/edgeConfig";
import * as configTypes from "./lib/config/edgeConfig.interface";
import { EdgeCommonStack } from "./lib/common-stack";
import { EdgeSingleNodeStack } from "./lib/single-node-stack";
import * as nag from "cdk-nag";

const app = new cdk.App();
cdk.Tags.of(app).add("Project", "AWS_THETA_EDGE");

new EdgeCommonStack(app, "theta-edge-common", {
    stackName: `theta-edge-nodes-common`,
    env: { account: config.baseConfig.accountId, region: config.baseConfig.region }
});

new EdgeSingleNodeStack(app, "theta-edge-single-node", {
    stackName: `theta-edge-single-node-${config.baseNodeConfig.edgeNetwork}`,

    env: { account: config.baseConfig.accountId, region: config.baseConfig.region },
    nodeRole: <configTypes.EdgeNodeRole> "single-node",
    instanceType: config.baseNodeConfig.instanceType,
    instanceCpuType: config.baseNodeConfig.instanceCpuType,
    edgeNetwork: config.baseNodeConfig.edgeNetwork,
    edgeNodeGpu: config.baseNodeConfig.edgeNodeGpu,
    edgeLauncherVersion: config.baseNodeConfig.edgeLauncherVersion,
    dataVolume: config.baseNodeConfig.dataVolume
});


// Security Check
cdk.Aspects.of(app).add(
    new nag.AwsSolutionsChecks({
        verbose: false,
        reports: true,
        logIgnores: false
    })
);
