#!/usr/bin/env node
import 'dotenv/config'
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import * as nag from "cdk-nag";
import * as config from "./lib/config/suiConfig";
import {SuiCommonStack} from "./lib/common-stack";
import {SuiSingleNodeStack} from "./lib/single-node-stack";

const app = new cdk.App();
cdk.Tags.of(app).add("Project", "AWSSui");

new SuiCommonStack(app, "sui-common", {
  stackName: `sui-nodes-common`,
  env: { account: config.baseConfig.accountId, region: config.baseConfig.region },
});



new SuiSingleNodeStack(app, "sui-single-node", {
  stackName: `sui-single-node-${config.baseNodeConfig.suiNetworkId}`,
  env: { account: config.baseConfig.accountId, region: config.baseConfig.region },
  instanceType: config.baseNodeConfig.instanceType,
  instanceCpuType: config.baseNodeConfig.instanceCpuType,
  dataVolume: config.baseNodeConfig.dataVolume,
  suiNetworkId: config.baseNodeConfig.suiNetworkId,
});

// Security Check
cdk.Aspects.of(app).add(
    new nag.AwsSolutionsChecks({
        verbose: false,
        reports: true,
        logIgnores: false,
    })
);
