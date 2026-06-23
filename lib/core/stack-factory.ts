// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

/**
 * Stack Factory implementation for creating CDK stacks
 */

import * as cdk from "aws-cdk-lib";
import {
    IStackFactory,
    StackAssetResources,
    DeploymentConfig,
    DeploymentMode,
} from "../interfaces";
import { SingleNodeStack } from "../stacks/single-node-stack";
import { HANodesStack } from "../stacks/ha-nodes-stack";
import { ConfigurationLoader } from "./configuration-loader";

/**
 * Stack Factory for creating blockchain node deployment stacks
 * 
 * This factory creates the appropriate CDK stack based on the deployment mode:
 * - Single Node: Creates a SingleNodeStack with a single EC2 instance
 * - HA Nodes: Creates a HANodesStack with Auto Scaling Group and Application Load Balancer
 * 
 * Each stack includes:
 * - The appropriate node construct (SingleNodeConstruct or HANodesConstruct)
 * - MonitoringConstruct for CloudWatch dashboards
 * - CloudFormation outputs for deployment information
 */
export class StackFactory implements IStackFactory {
    /**
     * Creates a single node stack for deploying a single blockchain node
     * @param app The CDK app
     * @param config The deployment configuration
     * @param stackName The name of the stack to be deployed
     * @param resources Resources for stack creation such as user data script file path and path to CloudWatch dashboard
     * @returns The created single node stack
     */
    createSingleNodeStack(
        app: cdk.App,
        config: DeploymentConfig,
        stackName: string,
        resources: StackAssetResources
    ): SingleNodeStack {
        const { environment } = config;

        // Create SingleNodeStack which includes monitoring and outputs
        return new SingleNodeStack(app, stackName, {
            deploymentConfig: config,
            userDataScriptPath: resources.userDataScriptPath,
            vpc: resources?.vpc,
            dashboardTemplatePath: resources.dashboardTemplatePath,
            env: {
                account: environment.AWS_ACCOUNT_ID,
                region: environment.AWS_REGION,
            },
        });
    }

    /**
     * Creates a high availability nodes stack with auto scaling and load balancing
     * @param app The CDK app
     * @param config The deployment configuration
     * @param stackName The name of the stack to be deployed
     * @param resources Resources for stack creation such as user data script file path and path to CloudWatch dashboard
     * @returns The created HA nodes stack
     */
    createHANodesStack(
        app: cdk.App,
        config: DeploymentConfig,
        stackName: string,
        resources: StackAssetResources
    ): HANodesStack {
        const { environment } = config;

        // Validate HA configuration is present
        const configurationLoader = new ConfigurationLoader();
        const validationResultHA = configurationLoader.validateHAConfigVariables(environment);
        if (!validationResultHA.isValid) {
            throw new Error(
                `Configuration validation for HA setup is failed:\n${validationResultHA.errors.map(e => `  - ${e}`).join('\n')}`
            );
        }

        // Create HANodesStack which includes monitoring and outputs
        return new HANodesStack(app, stackName, {
            deploymentConfig: config,
            userDataScriptPath: resources.userDataScriptPath,
            vpc: resources?.vpc,
            dashboardTemplatePath: resources.dashboardTemplatePath,
            env: {
                account: environment.AWS_ACCOUNT_ID,
                region: environment.AWS_REGION,
            },
        });
    }

    /**
     * Creates the appropriate stack based on deployment mode
     * @param app The CDK app
     * @param config The deployment configuration
     * @param stackName The name of the stack to be deployed
     * @param resources Resources for stack creation such as user data script file path and path to CloudWatch dashboard
     * @returns The created stack
     */
    createStack(
        app: cdk.App,
        config: DeploymentConfig,
        stackName: string,
        resources: StackAssetResources
    ): cdk.Stack {
        const { environment } = config;

        switch (environment.DEPLOYMENT_MODE) {
            case DeploymentMode.SINGLE_NODE:
                return this.createSingleNodeStack(app, config, stackName, resources);
            case DeploymentMode.HA_NODES:
                return this.createHANodesStack(app, config, stackName, resources);
            default:
                throw new Error(`Unsupported deployment mode: ${environment.DEPLOYMENT_MODE}`);
        }
    }
}
