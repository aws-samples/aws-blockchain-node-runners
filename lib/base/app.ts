#!/usr/bin/env node
import 'dotenv/config'
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import * as config from "./lib/config/baseConfig";
import {BaseCommonStack} from "./lib/common-stack";
import {BaseAMBEthereumSingleNodeStack} from "./lib/amb-ethereum-single-node-stack";
import {BaseSingleNodeStack} from "./lib/single-node-stack";

const app = new cdk.App();
cdk.Tags.of(app).add("Project", "AWSBase");

new BaseCommonStack(app, "base-common", {
  stackName: `base-nodes-common`,
  env: { account: config.baseConfig.accountId, region: config.baseConfig.region },
});

new BaseAMBEthereumSingleNodeStack(app, "base-ethereum-l1-node", {
  stackName: `base-amb-ethereum-single-node-${config.baseNodeConfig.baseNetworkId}`,
  env: { account: config.baseConfig.accountId, region: config.baseConfig.region },

  ambEthereumNodeNetworkId: config.baseNodeConfig.ambEntereumNodeNetworkId,
  ambEthereumNodeInstanceType: config.baseNodeConfig.ambEntereumNodeInstanceType,
});

new BaseSingleNodeStack(app, "base-single-node", {
  stackName: `base-single-node-${config.baseNodeConfig.baseNetworkId}`,
  env: { account: config.baseConfig.accountId, region: config.baseConfig.region },

  instanceType: config.baseNodeConfig.instanceType,
  instanceCpuType: config.baseNodeConfig.instanceCpuType,
  baseNetworkId: config.baseNodeConfig.baseNetworkId,
  restoreFromSnapshot: config.baseNodeConfig.restoreFromSnapshot,
  dataVolume: config.baseNodeConfig.dataVolume,
});
