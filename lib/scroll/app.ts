#!/usr/bin/env node
import 'dotenv/config'
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import * as config from "./lib/config/scrollConfig";
import {ScrollCommonStack} from "./lib/common-stack";
import {ScrollAMBEthereumSingleNodeStack} from "./lib/amb-ethereum-single-node-stack";
import {ScrollSingleNodeStack} from "./lib/single-node-stack";

const app = new cdk.App();
cdk.Tags.of(app).add("Project", "AWSScroll");

new ScrollCommonStack(app, "scroll-common", {
  stackName: `scroll-nodes-common`,
  env: { account: config.baseConfig.accountId, region: config.baseConfig.region },
});

new ScrollAMBEthereumSingleNodeStack(app, "scroll-ethereum-l1-node", {
  stackName: `scroll-amb-ethereum-single-node-${config.baseNodeConfig.nodeConfiguration}`,
  env: { account: config.baseConfig.accountId, region: config.baseConfig.region },

  ambEthereumNodeNetworkId: config.baseNodeConfig.ambEntereumNodeNetworkId,
  ambEthereumNodeInstanceType: config.baseNodeConfig.ambEntereumNodeInstanceType,
});

new ScrollSingleNodeStack(app, "scroll-single-node", {
  stackName: `scroll-single-node-${config.baseNodeConfig.nodeConfiguration}`,
  env: { account: config.baseConfig.accountId, region: config.baseConfig.region },

  instanceType: config.baseNodeConfig.instanceType,
  instanceCpuType: config.baseNodeConfig.instanceCpuType,
  scrollNetworkId: config.baseNodeConfig.scrollNetworkId,
  scrollVersion: config.baseNodeConfig.scrollVersion,
  nodeConfiguration: config.baseNodeConfig.nodeConfiguration,
  dataVolume: config.baseNodeConfig.dataVolume,
});
