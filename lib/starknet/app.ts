#!/usr/bin/env node
import 'dotenv/config'
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import * as config from "./lib/config/starknetConfig";
import {StarknetCommonStack} from "./lib/common-stack";
import {StarknetSingleNodeStack} from "./lib/single-node-stack";

const app = new cdk.App();
cdk.Tags.of(app).add("Project", "AWSStarknet");

new StarknetCommonStack(app, "starknet-common", {
  stackName: `starknet-nodes-common`,
  env: { account: config.baseConfig.accountId, region: config.baseConfig.region },
});

new StarknetSingleNodeStack(app, "starknet-single-node", {
  stackName: `starknet-single-node`,
  env: { account: config.baseConfig.accountId, region: config.baseConfig.region },
  
  instanceType: config.baseNodeConfig.instanceType,
  instanceCpuType: config.baseNodeConfig.instanceCpuType,
  dataVolume: config.baseNodeConfig.dataVolume,
  starknetNetworkId: config.baseNodeConfig.starknetNetworkId,
  starknetL1Endpoint: config.baseNodeConfig.starknetL1Endpoint,
  starknetNodeVersion: config.baseNodeConfig.starknetNodeVersion,
});
