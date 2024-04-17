#!/usr/bin/env node
import "source-map-support/register";
import * as cdk from "aws-cdk-lib";
import * as nag from "cdk-nag";
import { IndyNodeStack } from "./lib/indy-node-stack";

const app = new cdk.App();
new IndyNodeStack(app, "indy-sample-network-stack", {});

// Security Check
cdk.Aspects.of(app).add(
    new nag.AwsSolutionsChecks({
        verbose: false,
        reports: true,
        logIgnores: false,
    })
);
