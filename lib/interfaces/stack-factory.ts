// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

/**
 * Stack Factory interface for creating CDK stacks
 */

import * as cdk from "aws-cdk-lib";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import { DeploymentConfig } from "./deployment-config";

/**
 * Options for stack creation
 */
export interface StackAssetResources {
    /**
     * Optional VPC to deploy into. If not provided, uses default VPC.
     */
    vpc?: ec2.IVpc;

    /**
     * Optional Availability Zone index [1-10]. If not provided, uses [1].
     */
    azIndex?: number;

    /**
     * Optional path to the dashboard template JSON file
     */
    dashboardTemplatePath?: string;

    /**
     * Path to the user data script
     */
    userDataScriptPath: string;
}

/**
 * Interface for creating different types of CDK stacks
 */
export interface IStackFactory {
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
    ): cdk.Stack;

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
    ): cdk.Stack;

    /**
     * Creates the appropriate stack based on deployment mode
     * @param app The CDK app
     * @param config The deployment configuration
     * @param resources Resources for stack creation such as user data script file path and path to CloudWatch dashboard
     * @returns The created stack
     */
    createStack(
        app: cdk.App,
        config: DeploymentConfig,
        stackName: string,
        resources: StackAssetResources
    ): cdk.Stack;
}
