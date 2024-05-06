#!/usr/bin/env node
import 'dotenv/config'
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import * as config from "./lib/config/baseConfig";
import {BaseCommonStack} from "./lib/common-stack";
import {BaseSingleNodeStack} from "./lib/single-node-stack";

const app = new cdk.App();
cdk.Tags.of(app).add("Project", "AWSBase");

new BaseCommonStack(app, "base-common", {
  stackName: `base-nodes-common`,
  env: { account: config.baseConfig.accountId, region: config.baseConfig.region },
});

new BaseSingleNodeStack(app, "base-single-node", {
  stackName: `base-single-node-${config.baseNodeConfig.baseNodeConfiguration}-${config.baseNodeConfig.baseNetworkId}`,
  env: { account: config.baseConfig.accountId, region: config.baseConfig.region },

  instanceType: config.baseNodeConfig.instanceType,
  instanceCpuType: config.baseNodeConfig.instanceCpuType,
  baseNetworkId: config.baseNodeConfig.baseNetworkId,
  baseNodeConfiguration: config.baseNodeConfig.baseNodeConfiguration,
  restoreFromSnapshot: config.baseNodeConfig.restoreFromSnapshot,
  l1ExecutionEndpoint: config.baseNodeConfig.l1ExecutionEndpoint,
  l1ConsensusEndpoint: config.baseNodeConfig.l1ConsensusEndpoint,
  snapshotUrl: config.baseNodeConfig.snapshotUrl,
  dataVolume: config.baseNodeConfig.dataVolume,
});
