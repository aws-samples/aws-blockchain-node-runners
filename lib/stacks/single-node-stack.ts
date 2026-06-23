// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

/**
 * SingleNodeStack - CDK Stack for deploying a single blockchain node
 * 
 * This stack creates a self-contained deployment with:
 * - SingleNodeConstruct for EC2 instance, security group, IAM role, and EBS volumes
 * - MonitoringConstruct for CloudWatch dashboard
 * - All necessary CloudFormation outputs for deployment information
 */

import * as cdk from "aws-cdk-lib";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import { Construct } from "constructs";
import { SingleNodeConstruct } from "../common/single-node-construct";
import { MonitoringConstruct } from "../common/monitoring-construct";
import { DeploymentConfig, DeploymentMode } from "../interfaces";

/**
 * Properties for SingleNodeStack
 */
export interface SingleNodeStackProps extends cdk.StackProps {
    /**
     * Deployment configuration combining protocol and environment settings
     */
    deploymentConfig: DeploymentConfig;

    /**
     * Path to user data script to run on instance startup
     */
    userDataScriptPath: string;

    /**
     * Optional VPC to deploy into. If not provided, uses default VPC.
     */
    vpc?: ec2.IVpc;

    /**
     * Optional path to dashboard template JSON file
     */
    dashboardTemplatePath?: string;
}

/**
 * Default user data script when none is provided
 */
const DEFAULT_USER_DATA = `#!/bin/bash
echo "No user data script provided"
`;

/**
 * SingleNodeStack creates a complete single-node blockchain deployment
 * 
 * This stack is self-contained with all necessary resources:
 * - EC2 instance with configurable instance type
 * - Security group based on protocol required ports
 * - IAM role with SSM and CloudWatch permissions
 * - EBS volumes based on storage configuration
 * - CloudWatch dashboard for monitoring
 * 
 * The stack uses the default VPC unless a custom VPC is provided.
 */
export class SingleNodeStack extends cdk.Stack {
    /**
     * The SingleNodeConstruct containing the EC2 instance and related resources
     */
    public readonly singleNode: SingleNodeConstruct;

    /**
     * The MonitoringConstruct containing the CloudWatch dashboard
     */
    public readonly monitoring: MonitoringConstruct;

    /**
     * The VPC where resources are deployed
     */
    public readonly vpc: ec2.IVpc;

    constructor(scope: Construct, id: string, props: SingleNodeStackProps) {
        super(scope, id, props);

        const { deploymentConfig, userDataScriptPath, vpc: providedVpc, dashboardTemplatePath } = props;
        const { protocol } = deploymentConfig;

        // Use provided VPC or lookup default VPC
        this.vpc = providedVpc || ec2.Vpc.fromLookup(this, "DefaultVpc", { isDefault: true });

        // Create single node construct
        this.singleNode = new SingleNodeConstruct(this, "SingleNode", {
            protocolConfig: protocol,
            deploymentConfig: deploymentConfig,
            userDataScriptPath: userDataScriptPath,
            vpc: this.vpc,
        });

        // Create monitoring construct
        this.monitoring = new MonitoringConstruct(this, "Monitoring", {
            protocolName: protocol.BLOCKCHAIN_PROTOCOL,
            deploymentMode: DeploymentMode.SINGLE_NODE,
            dashboardTemplatePath: dashboardTemplatePath,
            instanceId: this.singleNode.instanceId,
            dataVolumes: deploymentConfig.environment.DATA_VOLUMES,
            clientNames: protocol.monitoring.clientNames,
            variables: {
                INSTANCE_ID: this.singleNode.instanceId,
            },
        });

        // Add CloudFormation outputs for deployment information
        this.addOutputs();
    }

    /**
     * Add CloudFormation outputs for deployment information
     */
    private addOutputs(): void {
        // Instance ID output
        new cdk.CfnOutput(this, "InstanceId", {
            value: this.singleNode.instanceId,
            description: "EC2 Instance ID",
            exportName: `${this.stackName}-InstanceId`,
        });

        // Security Group ID output
        new cdk.CfnOutput(this, "SecurityGroupId", {
            value: this.singleNode.securityGroup.securityGroupId,
            description: "Security Group ID",
            exportName: `${this.stackName}-SecurityGroupId`,
        });

        // Instance Role ARN output
        new cdk.CfnOutput(this, "InstanceRoleArn", {
            value: this.singleNode.instanceRole.roleArn,
            description: "Instance IAM Role ARN",
            exportName: `${this.stackName}-InstanceRoleArn`,
        });

        // VPC ID output
        new cdk.CfnOutput(this, "VpcId", {
            value: this.vpc.vpcId,
            description: "VPC ID where the node is deployed",
            exportName: `${this.stackName}-VpcId`,
        });

        // Dashboard Name output
        new cdk.CfnOutput(this, "DashboardName", {
            value: this.monitoring.dashboardName,
            description: "CloudWatch Dashboard Name",
            exportName: `${this.stackName}-DashboardName`,
        });

        // Node CloudFormation Logical ID (useful for signaling)
        new cdk.CfnOutput(this, "NodeCFLogicalId", {
            value: this.singleNode.nodeCFLogicalId,
            description: "CloudFormation Logical ID of the EC2 instance",
            exportName: `${this.stackName}-NodeCFLogicalId`,
        });
    }

    /**
     * Generate a stack name based on protocol and network
     * @param protocol The blockchain protocol name
     * @param network Optional network name
     * @returns Generated stack name
     */
    public static generateStackName(protocol: string, network?: string): string {
        const networkPart = network ? `-${network}` : "";
        return `${protocol}${networkPart}-single-node`;
    }
}
