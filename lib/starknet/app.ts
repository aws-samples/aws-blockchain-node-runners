#!/usr/bin/env node
import 'dotenv/config'
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import * as nag from "cdk-nag";
import * as config from "./lib/config/starknetConfig";
import {StarknetCommonStack} from "./lib/common-stack";
import {StarknetAMBEthereumSingleNodeStack} from "./lib/amb-ethereum-single-node-stack";
import {StarknetSingleNodeStack} from "./lib/single-node-stack";

const app = new cdk.App();
cdk.Tags.of(app).add("Project", "AWSStarknet");

new StarknetCommonStack(app, "starknet-common", {
  stackName: `starknet-nodes-common`,
  env: { account: config.baseConfig.accountId, region: config.baseConfig.region },
});

new StarknetAMBEthereumSingleNodeStack(app, "starknet-ethereum-l1-node", {
  stackName: `starknet-amb-ethereum-single-node-${config.baseNodeConfig.ambEntereumNodeNetworkId}`,
  env: { account: config.baseConfig.accountId, region: config.baseConfig.region },

  ambEthereumNodeNetworkId: config.baseNodeConfig.ambEntereumNodeNetworkId,
  ambEthereumNodeInstanceType: config.baseNodeConfig.ambEntereumNodeInstanceType,
});

new StarknetSingleNodeStack(app, "starknet-single-node", {
  stackName: `starknet-single-node-${config.baseNodeConfig.starknetNetworkId}`,
  env: { account: config.baseConfig.accountId, region: config.baseConfig.region },
  
  instanceType: config.baseNodeConfig.instanceType,
  instanceCpuType: config.baseNodeConfig.instanceCpuType,
  dataVolume: config.baseNodeConfig.dataVolume,
  starknetNetworkId: config.baseNodeConfig.starknetNetworkId,
  starknetL1Endpoint: config.baseNodeConfig.starknetL1Endpoint,
  starknetNodeVersion: config.baseNodeConfig.starknetNodeVersion,
  snapshotUrl: config.baseNodeConfig.snapshotUrl
});

// Security Check
cdk.Aspects.of(app).add(
    new nag.AwsSolutionsChecks({
        verbose: false,
        reports: true,
        logIgnores: false,
    })
);