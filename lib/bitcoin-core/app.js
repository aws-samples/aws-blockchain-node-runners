#!/usr/bin/env node
require('dotenv').config(); // Load .env first
const cdk = require('aws-cdk-lib');
const { Aspects } = require('aws-cdk-lib');
const { AwsSolutionsChecks } = require('cdk-nag');
const { BitcoinCommonStack } = require('./lib/common-infra');
const { SingleNodeBitcoinCoreStack } = require('./lib/single-node-stack');
const { HABitcoinCoreNodeStack } = require('./lib/ha-node-stack');

const app = new cdk.App();

Aspects.of(app).add(new AwsSolutionsChecks({ verbose: true }));

const env = {
    account: process.env.AWS_ACCOUNT_ID,
    region: process.env.AWS_REGION,
};

const commonStack = new BitcoinCommonStack(app, 'BitcoinCommonStack', { env });
new SingleNodeBitcoinCoreStack(app, 'SingleNodeBitcoinCoreStack', {
    env,
    instanceRole: commonStack.instanceRole,
});

new HABitcoinCoreNodeStack(app, 'HABitcoinCoreNodeStack', {
    env,
    instanceRole: commonStack.instanceRole,
});
