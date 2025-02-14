#!/usr/bin/env node
import 'dotenv/config';
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { AlloraCommonStack } from "./lib/common-stack";
import { AlloraStack } from './lib/single-node-stack';
import { baseConfig, singleNodeConfig } from './lib/config/node-config';

const app = new cdk.App();

new AlloraCommonStack(app, "allora-common", {
  stackName: `allora-common`,
  env: { account: baseConfig.accountId, region: baseConfig.region },
});

new AlloraStack(app, 'allora-single-node', {
  stackName: 'allora-single-node',
  env: {
    account: baseConfig.accountId,
    region: baseConfig.region 
  },
  ...singleNodeConfig
});
