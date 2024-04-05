#!/usr/bin/env node
import "source-map-support/register";
import * as cdk from "aws-cdk-lib";
import { IndyNodeStack } from "./lib/indy-node-stack";

const app = new cdk.App();
new IndyNodeStack(app, "IndyNodeStack", {});
