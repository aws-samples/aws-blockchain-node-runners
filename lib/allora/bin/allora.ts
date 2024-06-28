#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { AlloraStack } from '../lib/allora-stack';

const app = new cdk.App();
new AlloraStack(app, 'AlloraStack', {
   env: { 
    region: process.env.CDK_DEFAULT_REGION || 'us-east-1',
  } 
});

/*

cdk deploy AlloraStack --profile alloralabsnode --parameters ResourceNamePrefix=Vec4AlloraWorker1 --parameters InstanceSize=t2.medium

*/