// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

/**
 * HANodesStack - CDK Stack for deploying highly-available blockchain nodes
 * 
 * This stack creates a self-contained HA deployment with:
 * - HANodesConstruct for ALB, ASG, security groups, IAM roles, and lifecycle hooks
 * - All necessary CloudFormation outputs for deployment information
 * 
 * Note: HA deployments do not include a default monitoring dashboard.
 * Users should create custom dashboards based on their specific monitoring needs.
 */

import * as cdk from "aws-cdk-lib";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import { Construct } from "constructs";
import { HANodesConstruct } from "../common/ha-nodes-construct";
import { DeploymentConfig, DeploymentMode } from "../interfaces";

/**
 * Properties for HANodesStack
 */
export interface HANodesStackProps extends cdk.StackProps {
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
 * HANodesStack creates a complete highly-available blockchain deployment
 * 
 * This stack is self-contained with all necessary resources:
 * - Application Load Balancer with target group
 * - Auto Scaling Group with configurable instance type and count
 * - Security groups for ALB and instances based on protocol required ports
 * - IAM role with SSM, CloudWatch, and ASG lifecycle hook permissions
 * - EBS volumes based on storage configuration
 * - Lifecycle hooks for graceful node startup/shutdown
 * - CloudWatch dashboard for monitoring
 * 
 * The stack uses the default VPC unless a custom VPC is provided.
 */
export class HANodesStack extends cdk.Stack {
    /**
     * The HANodesConstruct containing the ALB, ASG, and related resources
     */
    public readonly haNodes: HANodesConstruct;

    /**
     * The VPC where resources are deployed
     */
    public readonly vpc: ec2.IVpc;

    constructor(scope: Construct, id: string, props: HANodesStackProps) {
        super(scope, id, props);

        const { deploymentConfig, userDataScriptPath, vpc: providedVpc, dashboardTemplatePath } = props;
        const { protocol } = deploymentConfig;

        // Use provided VPC or lookup default VPC
        this.vpc = providedVpc || ec2.Vpc.fromLookup(this, "DefaultVpc", { isDefault: true });

        // Create HA nodes construct
        this.haNodes = new HANodesConstruct(this, "HANodes", {
            protocolConfig: protocol,
            deploymentConfig: deploymentConfig,
            userDataScriptPath: userDataScriptPath,
            vpc: this.vpc,
        });

        // Note: HA deployments do not create a monitoring dashboard
        // Users should create custom dashboards for HA deployments based on their specific needs

        // Add CloudFormation outputs for deployment information
        this.addOutputs();
    }

    /**
     * Add CloudFormation outputs for deployment information
     */
    private addOutputs(): void {
        // ALB DNS Name output
        new cdk.CfnOutput(this, "LoadBalancerDnsName", {
            value: this.haNodes.alb.loadBalancerDnsName,
            description: "Application Load Balancer DNS Name",
            exportName: `${this.stackName}-LoadBalancerDnsName`,
        });

        // ALB ARN output
        new cdk.CfnOutput(this, "LoadBalancerArn", {
            value: this.haNodes.alb.loadBalancerArn,
            description: "Application Load Balancer ARN",
            exportName: `${this.stackName}-LoadBalancerArn`,
        });

        // Target Group ARN output
        new cdk.CfnOutput(this, "TargetGroupArn", {
            value: this.haNodes.targetGroup.targetGroupArn,
            description: "Target Group ARN",
            exportName: `${this.stackName}-TargetGroupArn`,
        });

        // Auto Scaling Group Name output
        new cdk.CfnOutput(this, "AutoScalingGroupName", {
            value: this.haNodes.autoScalingGroup.autoScalingGroupName,
            description: "Auto Scaling Group Name",
            exportName: `${this.stackName}-AutoScalingGroupName`,
        });

        // Instance Security Group ID output
        new cdk.CfnOutput(this, "InstanceSecurityGroupId", {
            value: this.haNodes.instanceSecurityGroup.securityGroupId,
            description: "Instance Security Group ID",
            exportName: `${this.stackName}-InstanceSecurityGroupId`,
        });

        // ALB Security Group ID output
        new cdk.CfnOutput(this, "AlbSecurityGroupId", {
            value: this.haNodes.albSecurityGroup.securityGroupId,
            description: "ALB Security Group ID",
            exportName: `${this.stackName}-AlbSecurityGroupId`,
        });

        // Instance Role ARN output
        new cdk.CfnOutput(this, "InstanceRoleArn", {
            value: this.haNodes.instanceRole.roleArn,
            description: "Instance IAM Role ARN",
            exportName: `${this.stackName}-InstanceRoleArn`,
        });

        // VPC ID output
        new cdk.CfnOutput(this, "VpcId", {
            value: this.vpc.vpcId,
            description: "VPC ID where the nodes are deployed",
            exportName: `${this.stackName}-VpcId`,
        });

        // Lifecycle Hook Name output
        new cdk.CfnOutput(this, "LifecycleHookName", {
            value: this.haNodes.lifecycleHookName,
            description: "ASG Lifecycle Hook Name",
            exportName: `${this.stackName}-LifecycleHookName`,
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
        return `${protocol}${networkPart}-ha-nodes`;
    }
}
