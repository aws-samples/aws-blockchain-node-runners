// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import * as cdk from "aws-cdk-lib";
import * as constructs from "constructs";
import * as fs from "fs";
import * as path from "path";
import { DeploymentMode } from "../interfaces";
import { StorageVolumeConfig } from "../interfaces/protocol-config";

/**
 * Properties for MonitoringConstruct
 */
export interface MonitoringProps {
    /**
     * Name of the blockchain protocol
     */
    protocolName: string;

    /**
     * Deployment mode (single-node or ha-nodes)
     */
    deploymentMode: DeploymentMode;

    /**
     * Path to the dashboard template JSON file
     * If not provided, uses default templates from lib/common/monitoring-dashboards/
     */
    dashboardTemplatePath?: string;

    /**
     * Variables to substitute in the dashboard template
     * Common variables: INSTANCE_ID, STACK_NAME, REGION, BLOCKCHAIN_PROTOCOL, ALB_NAME, ASG_NAME
     */
    variables?: Record<string, string>;

    /**
     * Instance ID for single-node deployments
     */
    instanceId?: string;

    /**
     * Instance name for single-node deployments (used in dashboard labels)
     */
    instanceName?: string;
    
    /**
     * Data volumes configuration for device ID substitution in dashboard
     */
    dataVolumes: StorageVolumeConfig[];

    /**
     * Client names for dashboard variable substitution (e.g., ["Execution Client", "Consensus Client"])
     * Defaults to ["Execution Client", "Consensus Client"] if not provided
     */
    clientNames?: string[];
}

/**
 * Universal monitoring construct for blockchain node deployments
 * 
 * This construct creates CloudWatch dashboards from JSON templates with variable substitution.
 * All dashboard configuration is defined in JSON template files.
 * 
 * Supported variables:
 * - ${STACK_NAME}: CDK stack name
 * - ${REGION}: AWS region
 * - ${BLOCKCHAIN_PROTOCOL}: Protocol name
 * - ${DEPLOYMENT_MODE}: Deployment mode (single-node or ha-nodes)
 * - ${INSTANCE_ID}: EC2 instance ID (single-node)
 * - ${INSTANCE_NAME}: Instance name for labels (single-node)
 * - ${Client1}: First client name (e.g., "Execution Client")
 * - ${Client2}: Second client name (e.g., "Consensus Client")
 */
export class MonitoringConstruct extends constructs.Construct {
    /**
     * The CloudWatch dashboard (L1 construct)
     */
    public readonly dashboard: any;

    /**
     * The dashboard name
     */
    public readonly dashboardName: string;

    constructor(scope: constructs.Construct, id: string, props: MonitoringProps) {
        super(scope, id);

        const {
            protocolName,
            deploymentMode,
            dashboardTemplatePath,
            variables = {},
            instanceId,
            instanceName,
            dataVolumes,
            clientNames = ["Execution Client", "Consensus Client"],
        } = props;

        // Get stack context
        const stackName = cdk.Stack.of(this).stackName;
        const region = cdk.Stack.of(this).region;

        // Generate dashboard name
        this.dashboardName = `${stackName}-${protocolName}-dashboard`;

        // Build variables map with defaults
        const allVariables: Record<string, string> = {
            STACK_NAME: stackName,
            REGION: region,
            BLOCKCHAIN_PROTOCOL: protocolName,
            DEPLOYMENT_MODE: deploymentMode,
            ...variables,
        };

        // Add client names for substitution
        if (clientNames.length >= 1) {
            allVariables.Client1 = clientNames[0];
        }
        if (clientNames.length >= 2) {
            allVariables.Client2 = clientNames[1];
        }

        let raidIndex = 0;
        dataVolumes.forEach((dataVolume, index) => {
            if (dataVolume.TYPE === "instance-store") {
                allVariables[`D${index+1}_DEVICE_ID`] = `md${raidIndex}`;
                raidIndex++;
            } else {
                allVariables[`D${index+1}_DEVICE_ID`] = `nvme${index+1}n1`;
            }
            allVariables[`D${index+1}_MOUNT_PATH`] = dataVolume.MOUNT_PATH;
            allVariables[`D${index+1}_FILESYSTEM`] = dataVolume.FILESYSTEM ? dataVolume.FILESYSTEM : "ext4";
        });

        // Add deployment-specific variables
        if (instanceId) {
            allVariables.INSTANCE_ID = instanceId;
        }
        if (instanceName) {
            allVariables.INSTANCE_NAME = instanceName;
        }

        // Determine template path
        const templatePath = dashboardTemplatePath || this.getDefaultTemplatePath(deploymentMode);

        // Load and process template
        const processedDashboardBody = this.loadAndProcessTemplate(templatePath, allVariables);

        // Create dashboard using L1 construct (CfnDashboard) to set the body directly
        const cfnDashboard = new cdk.aws_cloudwatch.CfnDashboard(this, "dashboard", {
            dashboardName: this.dashboardName,
            dashboardBody: processedDashboardBody,
        });

        // Store dashboard reference with ARN
        this.dashboard = {
            dashboardArn: cdk.Stack.of(this).formatArn({
                service: 'cloudwatch',
                resource: 'dashboard',
                resourceName: this.dashboardName,
                arnFormat: cdk.ArnFormat.SLASH_RESOURCE_NAME,
            }),
            dashboardName: this.dashboardName,
            node: cfnDashboard.node,
        } as any;
    }

    /**
     * Get default template path based on deployment mode
     */
    private getDefaultTemplatePath(deploymentMode: DeploymentMode): string {
        // Only single-node has a default template
        // HA deployments should provide their own template or not use monitoring
        const templateFileName = 'single-node-dashboard-template.json';

        return path.join(__dirname, 'monitoring-dashboards', templateFileName);
    }

    /**
     * Load dashboard template from file and process variable substitution
     * Returns the processed dashboard body as a string
     */
    private loadAndProcessTemplate(templatePath: string, variables: Record<string, string>): string {
        // Read template file
        if (!fs.existsSync(templatePath)) {
            throw new Error(`Dashboard template not found: ${templatePath}`);
        }

        const templateContent = fs.readFileSync(templatePath, "utf-8");
        
        // Parse JSON to filter widgets if needed
        let templateObj;
        try {
            templateObj = JSON.parse(templateContent);
        } catch (error) {
            throw new Error(`Failed to parse dashboard template at ${templatePath}: ${error}`);
        }

        // Filter out widgets based on available resources
        if (templateObj.widgets) {
            templateObj.widgets = templateObj.widgets.filter((widget: any) => {
                if (widget.properties && widget.properties.title) {
                    const title = widget.properties.title;
                    
                    // Filter out Client2 widgets if only one client is configured
                    if (!variables.Client2 && title.includes('${Client2}')) {
                        return false;
                    }
                    
                    // Filter out D2 (second disk) widgets if only one data volume is configured
                    if (!variables.D2_DEVICE_ID && title.includes('${D2_DEVICE_ID}')) {
                        return false;
                    }
                    
                    // Filter out D3+ widgets similarly
                    if (!variables.D3_DEVICE_ID && title.includes('${D3_DEVICE_ID}')) {
                        return false;
                    }
                    
                    if (!variables.D4_DEVICE_ID && title.includes('${D4_DEVICE_ID}')) {
                        return false;
                    }
                }
                return true;
            });
        }

        // Convert back to string for variable substitution
        const filteredContent = JSON.stringify(templateObj);

        // Substitute variables in the template
        const processedContent = this.substituteVariables(filteredContent, variables);

        // Validate JSON
        try {
            JSON.parse(processedContent);
        } catch (error) {
            throw new Error(`Invalid JSON in dashboard template after variable substitution: ${templatePath}. Error: ${error}`);
        }

        return processedContent;
    }

    /**
     * Substitute variables in a string using ${VARIABLE_NAME} syntax
     */
    private substituteVariables(content: string, variables: Record<string, string>): string {
        let result = content;

        for (const [key, value] of Object.entries(variables)) {
            // Replace ${VARIABLE_NAME} pattern
            const pattern = new RegExp(`\\$\\{${key}\\}`, "g");
            result = result.replace(pattern, value);
        }

        return result;
    }

    /**
     * Get the dashboard ARN
     */
    public get dashboardArn(): string {
        return this.dashboard.dashboardArn;
    }
}
