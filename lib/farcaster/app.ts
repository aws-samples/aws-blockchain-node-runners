#!/usr/bin/env node
import 'dotenv/config'
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import * as config from "./lib/config/hubbleConfig";
import {HubbleCommonStack} from "./lib/common-stack";
import {HubbleAMBEthereumSingleNodeStack} from "./lib/amb-ethereum-single-node-stack";
import {HubbleSingleNodeStack} from "./lib/single-node-stack";

const app = new cdk.App();
cdk.Tags.of(app).add("Project", "AWSHubble");

new HubbleCommonStack(app, "hubble-common", {
  stackName: `hubble-nodes-common`,
  env: { account: config.baseConfig.accountId, region: config.baseConfig.region },
});

new HubbleAMBEthereumSingleNodeStack(app, "hubble-ethereum-l1-node", {
  stackName: `hubble-amb-ethereum-single-node-${config.baseNodeConfig.nodeConfiguration}`,
  env: { account: config.baseConfig.accountId, region: config.baseConfig.region },

  ambEthereumNodeNetworkId: config.baseNodeConfig.ambEntereumNodeNetworkId,
  ambEthereumNodeInstanceType: config.baseNodeConfig.ambEntereumNodeInstanceType,
});

new HubbleSingleNodeStack(app, "hubble-single-node", {
  stackName: `hubble-single-node-${config.baseNodeConfig.nodeConfiguration}`,
  env: { account: config.baseConfig.accountId, region: config.baseConfig.region },

  instanceType: config.baseNodeConfig.instanceType,
  instanceCpuType: config.baseNodeConfig.instanceCpuType,
  hubbleNetworkId: config.baseNodeConfig.hubbleNetworkId,
  nodeConfiguration: config.baseNodeConfig.nodeConfiguration,
  dataVolume: config.baseNodeConfig.dataVolume,
});
