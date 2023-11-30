#!/usr/bin/env node
import 'dotenv/config'
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import {ScrollSingleNodeStack} from "../lib/single-node-stack";
import * as config from "../lib/config/scrollConfig";
import {ScrollCommonStack} from "../lib/common-stack";

const app = new cdk.App();
cdk.Tags.of(app).add("Project", "AWSScroll");

new ScrollCommonStack(app, "scroll-common", {
  stackName: `scroll-nodes-common`,
  env: { account: config.baseConfig.accountId, region: config.baseConfig.region },
});

new ScrollSingleNodeStack(app, "scroll-single-node", {
  stackName: `scroll-single-node-${config.baseNodeConfig.nodeConfiguration}`,
  env: { account: config.baseConfig.accountId, region: config.baseConfig.region },

  instanceType: config.baseNodeConfig.instanceType,
  instanceCpuType: config.baseNodeConfig.instanceCpuType,
  scrollCluster: config.baseNodeConfig.scrollCluster,
  scrollVersion: config.baseNodeConfig.scrollVersion,
  nodeConfiguration: config.baseNodeConfig.nodeConfiguration,
  dataVolume: config.baseNodeConfig.dataVolume,
  scrollNodeIdentitySecretARN: config.baseNodeConfig.scrollNodeIdentitySecretARN,
  voteAccountSecretARN: config.baseNodeConfig.voteAccountSecretARN,
  authorizedWithdrawerAccountSecretARN: config.baseNodeConfig.authorizedWithdrawerAccountSecretARN,
  registrationTransactionFundingAccountSecretARN: config.baseNodeConfig.registrationTransactionFundingAccountSecretARN,
  l1Endpoint: config.baseNodeConfig.l1Endpoint
});