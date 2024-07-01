#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { AlloraStack } from './lib/allora-stack';

const app = new cdk.App();
new AlloraStack(app, 'allora-single-node', {
  stackName: 'allora-single-node',
  env: { 
    account: process.env.AWS_ACCOUNT_ID || "xxxxxxxxxxx",
    region: process.env.AWS_REGION || 'us-east-1',
  },
  amiId: process.env.AWS_AMI_ID || 'ami-04b70fa74e45c3917',
  instanceType: process.env.AWS_INSTANCE_TYPE || 'ami-04b70fa74e45c3917',
  vpcMaxAzs: Number(process.env.AWS_VPC_MAX_AZS || 1),
  vpcNatGateways:  Number(process.env.AWS_VPC_NAT_GATEWAYS || 0),
  vpcSubnetCidrMask: Number(process.env.AWS_VPC_CIDR_MASK),
  resourceNamePrefix: process.env.AWS_RESOURCE_NAME_PREFIX || 'AlloraWorkerxVpc'
});
