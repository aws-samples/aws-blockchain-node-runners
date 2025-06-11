#!/usr/bin/env node
import 'dotenv/config';
import { App, Aspects } from 'aws-cdk-lib';
import { AwsSolutionsChecks } from 'cdk-nag';
import { BitcoinCommonStack } from './lib/common-infra';
import { SingleNodeBitcoinCoreStack } from './lib/single-node-stack';
import { HABitcoinCoreNodeStack } from './lib/ha-node-stack';
import * as config from './lib/config/bitcoinConfig';

const app = new App();

Aspects.of(app).add(new AwsSolutionsChecks({ verbose: true }));

const env = {
  account: process.env.AWS_ACCOUNT_ID,
  region: process.env.AWS_REGION,
};

const commonStack = new BitcoinCommonStack(app, 'BitcoinCommonStack', { env });
new SingleNodeBitcoinCoreStack(app, 'SingleNodeBitcoinCoreStack', {
    env,
    instanceRole: commonStack.instanceRole,
    ...config.baseNodeConfig,
});

new HABitcoinCoreNodeStack(app, 'HABitcoinCoreNodeStack', {
    env,
    instanceRole: commonStack.instanceRole,
    ...config.baseNodeConfig,
    ...config.haNodeConfig,
});
