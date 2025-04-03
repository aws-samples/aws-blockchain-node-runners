#!/usr/bin/env node
const cdk = require('aws-cdk-lib');
const { SingleNodeBitcoinCoreStack } = require('./lib/single-node-stack');
const { HABitcoinCoreNodeStack } = require('./lib/ha-node-stack');

const app = new cdk.App();
new SingleNodeBitcoinCoreStack(app, 'SingleNodeBitcoinCoreStack');
new HABitcoinCoreNodeStack(app, 'HABitcoinCoreNodeStack');
