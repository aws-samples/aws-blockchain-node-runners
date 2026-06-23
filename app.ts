#!/usr/bin/env node
// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

/**
 * Universal Blockchain Node Runner - CDK Application Entry Point
 * 
 * This is the main entry point for the Universal Blockchain Node Runner CDK application.
 * It loads configuration from environment variables and .env files, validates the configuration,
 * and creates the appropriate CDK stack based on the deployment mode.
 * 
 * Usage:
 *   1. Create a .env file with your configuration (see blueprints/{protocol}/samples/ for examples)
 *   2. Run: cdk deploy
 * 
 * Environment Variables:
 *   - BLOCKCHAIN_PROTOCOL: The blockchain protocol to deploy (e.g., 'dummy', 'ethereum', 'solana')
 *   - DEPLOYMENT_MODE: Either 'single-node' or 'ha-nodes'
 *   - AWS_ACCOUNT_ID: Your AWS account ID
 *   - AWS_REGION: The AWS region to deploy to
 *   - See blueprints/{protocol}/samples/.env-* for complete configuration options
 */

import * as cdk from 'aws-cdk-lib';
import * as nag from 'cdk-nag';
import * as path from 'path';

import { ConfigurationLoader } from './lib/core/configuration-loader';
import { StackFactory } from './lib/core/stack-factory';

/**
 * Main application class for the Universal Blockchain Node Runner
 */
class UniversalBlockchainNodeRunner {
    private readonly app: cdk.App;
    private readonly blueprintsPath: string;
    private readonly assetsPath: string;

    constructor() {
        this.app = new cdk.App();
        this.blueprintsPath = path.join(process.cwd(), 'blueprints');
        this.assetsPath = path.join(process.cwd(), 'assets', 'common');
    }

    /**
     * Run the application
     */
    run(): void {
        try {
            console.log('='.repeat(60));
            console.log('Universal Blockchain Node Runner');
            console.log('='.repeat(60));

            // Load and validate all configuration
            const configLoader = new ConfigurationLoader(this.blueprintsPath);
            const deploymentConfig = configLoader.loadDeploymentConfig();

            const protocolName = deploymentConfig.protocol.BLOCKCHAIN_PROTOCOL;
            const envConfig = deploymentConfig.environment;

            console.log(`\nProtocol: ${protocolName}`);
            console.log(`Deployment Mode: ${envConfig.DEPLOYMENT_MODE}`);
            console.log(`Instance Type: ${envConfig.INSTANCE_TYPE}`);
            console.log(`Region: ${envConfig.AWS_REGION}`);

            // Enforce the .env AWS_REGION as the deployment region.
            // CDK resolves the stack region from process.env.CDK_DEFAULT_REGION (set by the CLI
            // profile) unless we override it here. Setting AWS_DEFAULT_REGION ensures the stack
            // env { region } in StackFactory always wins over the profile default.
            if (envConfig.AWS_REGION) {
                const cdkRegion = process.env.CDK_DEFAULT_REGION;
                if (cdkRegion && cdkRegion !== envConfig.AWS_REGION) {
                    console.log(`  Note: deploying to ${envConfig.AWS_REGION} (from .env), AWS CLI profile default is ${cdkRegion}`);
                }
                process.env.CDK_DEFAULT_REGION = envConfig.AWS_REGION;
            }

            // Get dashboard template path based on deployment mode (HA deployments don't have dashboards)
            let dashboardTemplatePath: string | undefined;
            try {
                dashboardTemplatePath = configLoader.getDashboardTemplatePath(
                    protocolName,
                    envConfig.DEPLOYMENT_MODE
                );
            } catch {
                dashboardTemplatePath = undefined;
            }
            const userDataScriptPath = configLoader.getUserDataScriptPath(deploymentConfig, this.assetsPath);
            const stackName = configLoader.getStackName(deploymentConfig);

            // Create stack using StackFactory
            console.log('\nCreating CDK stack...');
            const stackFactory = new StackFactory();
            const stack = stackFactory.createStack(this.app, deploymentConfig, stackName, {
                dashboardTemplatePath,
                userDataScriptPath
            });

            console.log(`Stack created: ${stack.stackName}`);

            // Apply CDK Nag security checks
            console.log('\nApplying security compliance checks...');
            cdk.Aspects.of(this.app).add(
                new nag.AwsSolutionsChecks({
                    verbose: false,
                    reports: true,
                    logIgnores: false,
                })
            );

            console.log('\n' + '='.repeat(60));
            console.log('CDK synthesis complete');
            console.log('='.repeat(60));
            console.log(`\nTo deploy, run: cdk deploy ${stack.stackName}`);

        } catch (error) {
            console.error('\n' + '='.repeat(60));
            console.error('ERROR: Deployment failed');
            console.error('='.repeat(60));

            if (error instanceof Error) {
                console.error(`\n${error.message}`);
                if (process.env.DEBUG === 'true') {
                    console.error('\nStack trace:');
                    console.error(error.stack);
                }
            } else {
                console.error(`\n${error}`);
            }

            console.error('\nFor help, see:');
            console.error('  - blueprints/{protocol}/README.md');
            console.error('  - blueprints/{protocol}/samples/ for example configurations');

            process.exit(1);
        }
    }
}

// Run the application
const runner = new UniversalBlockchainNodeRunner();
runner.run();
