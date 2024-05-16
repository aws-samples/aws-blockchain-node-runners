#!/usr/bin/env node
import 'dotenv/config'
import "source-map-support/register";
import * as cdk from "aws-cdk-lib";
import * as nag from "cdk-nag";
import * as config from "./lib/config/indyConfig";
import { IndyNodeStack } from "./lib/indy-node-stack";

const app = new cdk.App();
new IndyNodeStack(app, "indy-sample-network-stack", {
    env: { account: config.baseConfig.accountId, region: config.baseConfig.region },
});

// Security Check
cdk.Aspects.of(app).add(
    new nag.AwsSolutionsChecks({
        verbose: false,
        reports: true,
        logIgnores: false,
    })
);
