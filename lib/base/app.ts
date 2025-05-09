#!/usr/bin/env node
import 'dotenv/config'
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import * as nag from "cdk-nag";
import * as config from "./lib/config/baseConfig";
import {BaseCommonStack} from "./lib/common-stack";
import {BaseSingleNodeStack} from "./lib/single-node-stack";
import {BaseHANodesStack} from "./lib/ha-nodes-stack";

const app = new cdk.App();
cdk.Tags.of(app).add("Project", "AWSBase");

new BaseCommonStack(app, "base-common", {
  stackName: `base-nodes-common`,
  env: { account: config.baseConfig.accountId, region: config.baseConfig.region },
});

new BaseSingleNodeStack(app, "base-single-node", {
  stackName: `base-single-node-${config.baseNodeConfig.baseClient}-${config.baseNodeConfig.baseNodeConfiguration}-${config.baseNodeConfig.baseNetworkId}`,
  env: { account: config.baseConfig.accountId, region: config.baseConfig.region },

  instanceType: config.baseNodeConfig.instanceType,
  instanceCpuType: config.baseNodeConfig.instanceCpuType,
  baseNetworkId: config.baseNodeConfig.baseNetworkId,
  baseClient: config.baseNodeConfig.baseClient,
  baseNodeConfiguration: config.baseNodeConfig.baseNodeConfiguration,
  restoreFromSnapshot: config.baseNodeConfig.restoreFromSnapshot,
  l1ExecutionEndpoint: config.baseNodeConfig.l1ExecutionEndpoint,
  l1ConsensusEndpoint: config.baseNodeConfig.l1ConsensusEndpoint,
  snapshotUrl: config.baseNodeConfig.snapshotUrl,
  dataVolume: config.baseNodeConfig.dataVolume,
});

new BaseHANodesStack(app, "base-ha-nodes", {
  stackName: `base-ha-nodes-${config.baseNodeConfig.baseClient}-${config.baseNodeConfig.baseNodeConfiguration}-${config.baseNodeConfig.baseNetworkId}`,
  env: { account: config.baseConfig.accountId, region: config.baseConfig.region },

  instanceType: config.baseNodeConfig.instanceType,
  instanceCpuType: config.baseNodeConfig.instanceCpuType,
  baseNetworkId: config.baseNodeConfig.baseNetworkId,
  baseClient: config.baseNodeConfig.baseClient,
  baseNodeConfiguration: config.baseNodeConfig.baseNodeConfiguration,
  restoreFromSnapshot: config.baseNodeConfig.restoreFromSnapshot,
  l1ExecutionEndpoint: config.baseNodeConfig.l1ExecutionEndpoint,
  l1ConsensusEndpoint: config.baseNodeConfig.l1ConsensusEndpoint,
  snapshotUrl: config.baseNodeConfig.snapshotUrl,
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
      logIgnores: false,
  })
);
