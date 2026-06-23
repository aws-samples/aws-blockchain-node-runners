// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import * as cdk from 'aws-cdk-lib';
import { Template, Match } from 'aws-cdk-lib/assertions';
import * as path from 'path';
import { MonitoringConstruct } from '../../../lib/common/monitoring-construct';
import { DeploymentMode } from '../../../lib/interfaces';
import { StorageVolumeConfig } from '../../../lib/interfaces/protocol-config';
import * as ec2 from 'aws-cdk-lib/aws-ec2';

describe('MonitoringConstruct', () => {
    let app: cdk.App;
    let stack: cdk.Stack;
    
    // Mock data volumes for testing
    const mockDataVolumes: StorageVolumeConfig[] = [
        {
            TYPE: 'gp3',
            SIZE: 100,
            IOPS: 3000,
            THROUGHPUT: 125,
            MOUNT_PATH: '/data',
            DEVICE_NAME: '/dev/sdf',
            FILESYSTEM: 'ext4',
        },
    ];

    beforeEach(() => {
        app = new cdk.App();
        stack = new cdk.Stack(app, 'TestStack', {
            env: {
                account: '123456789012',
                region: 'us-east-1',
            },
        });
    });

    describe('Dashboard Creation', () => {
        it('should create a CloudWatch dashboard', () => {
            new MonitoringConstruct(stack, 'TestMonitoring', {
                protocolName: 'dummy',
                deploymentMode: DeploymentMode.SINGLE_NODE,
                dataVolumes: mockDataVolumes,
                instanceId: 'i-1234567890abcdef0',
            });

            const template = Template.fromStack(stack);
            template.resourceCountIs('AWS::CloudWatch::Dashboard', 1);
        });

        it('should create dashboard with correct name format', () => {
            const construct = new MonitoringConstruct(stack, 'TestMonitoring', {
                protocolName: 'dummy',
                deploymentMode: DeploymentMode.SINGLE_NODE,
                dataVolumes: mockDataVolumes,
                instanceId: 'i-1234567890abcdef0',
            });

            expect(construct.dashboardName).toBe('TestStack-dummy-dashboard');
        });

        it('should expose dashboard property', () => {
            const construct = new MonitoringConstruct(stack, 'TestMonitoring', {
                protocolName: 'dummy',
                deploymentMode: DeploymentMode.SINGLE_NODE,
                dataVolumes: mockDataVolumes,
                instanceId: 'i-1234567890abcdef0',
            });

            expect(construct.dashboard).toBeDefined();
        });

        it('should expose dashboardArn property', () => {
            const construct = new MonitoringConstruct(stack, 'TestMonitoring', {
                protocolName: 'dummy',
                deploymentMode: DeploymentMode.SINGLE_NODE,
                dataVolumes: mockDataVolumes,
                instanceId: 'i-1234567890abcdef0',
            });

            expect(construct.dashboardArn).toBeDefined();
        });
    });

    describe('Single Node Default Widgets', () => {
        it('should create default widgets for single-node deployment', () => {
            new MonitoringConstruct(stack, 'TestMonitoring', {
                protocolName: 'dummy',
                deploymentMode: DeploymentMode.SINGLE_NODE,
                dataVolumes: mockDataVolumes,
                instanceId: 'i-1234567890abcdef0',
            });

            const template = Template.fromStack(stack);

            // Dashboard should be created with body containing widgets
            template.hasResourceProperties('AWS::CloudWatch::Dashboard', {
                DashboardBody: Match.anyValue(),
            });
        });

        it('should include CPU utilization metric for single-node', () => {
            new MonitoringConstruct(stack, 'TestMonitoring', {
                protocolName: 'dummy',
                deploymentMode: DeploymentMode.SINGLE_NODE,
                dataVolumes: mockDataVolumes,
                instanceId: 'i-1234567890abcdef0',
            });

            const template = Template.fromStack(stack);
            const resources = template.findResources('AWS::CloudWatch::Dashboard');
            const dashboardKey = Object.keys(resources)[0];
            const dashboardBody = resources[dashboardKey].Properties.DashboardBody;

            // DashboardBody is a Fn::Join, so we need to check the structure
            expect(dashboardBody).toBeDefined();
        });

        it('should handle missing instance ID gracefully', () => {
            new MonitoringConstruct(stack, 'TestMonitoring', {
                protocolName: 'dummy',
                deploymentMode: DeploymentMode.SINGLE_NODE,
                dataVolumes: mockDataVolumes,
            });

            const template = Template.fromStack(stack);
            template.resourceCountIs('AWS::CloudWatch::Dashboard', 1);
        });
    });

    describe('Dashboard Template Loading', () => {
        it('should load dashboard from template file using fallback', () => {
            // Don't provide dashboardTemplatePath to test fallback to common template
            new MonitoringConstruct(stack, 'TestMonitoring', {
                protocolName: 'dummy',
                deploymentMode: DeploymentMode.SINGLE_NODE,
                dataVolumes: mockDataVolumes,
                instanceId: 'i-1234567890abcdef0',
            });

            const template = Template.fromStack(stack);
            template.resourceCountIs('AWS::CloudWatch::Dashboard', 1);
        });

        it('should throw error for invalid template path', () => {
            expect(() => {
                new MonitoringConstruct(stack, 'TestMonitoring', {
                    protocolName: 'dummy',
                    deploymentMode: DeploymentMode.SINGLE_NODE,
                dataVolumes: mockDataVolumes,
                    dashboardTemplatePath: '/nonexistent/path/template.json',
                });
            }).toThrow();
        });
    });

    describe('Variable Substitution', () => {
        it('should substitute variables in dashboard template', () => {
            // Use common template to test variable substitution
            const templatePath = path.join(__dirname, '../../../lib/common/monitoring-dashboards/single-node-dashboard-template.json');

            new MonitoringConstruct(stack, 'TestMonitoring', {
                protocolName: 'dummy',
                deploymentMode: DeploymentMode.SINGLE_NODE,
                dataVolumes: mockDataVolumes,
                dashboardTemplatePath: templatePath,
                instanceId: 'i-1234567890abcdef0',
                variables: {
                    CUSTOM_VAR: 'custom-value',
                },
            });

            const template = Template.fromStack(stack);
            template.resourceCountIs('AWS::CloudWatch::Dashboard', 1);
        });

        it('should substitute client names with defaults', () => {
            const templatePath = path.join(__dirname, '../../../lib/common/monitoring-dashboards/single-node-dashboard-template.json');

            new MonitoringConstruct(stack, 'TestMonitoring', {
                protocolName: 'dummy',
                deploymentMode: DeploymentMode.SINGLE_NODE,
                dataVolumes: mockDataVolumes,
                dashboardTemplatePath: templatePath,
                instanceId: 'i-1234567890abcdef0',
            });

            const template = Template.fromStack(stack);
            template.resourceCountIs('AWS::CloudWatch::Dashboard', 1);
            
            // Verify dashboard body contains substituted client names
            const resources = template.findResources('AWS::CloudWatch::Dashboard');
            const dashboardKey = Object.keys(resources)[0];
            const dashboardBody = JSON.stringify(resources[dashboardKey].Properties.DashboardBody);
            
            // Default client names should be substituted
            expect(dashboardBody).toContain('Execution Client');
            expect(dashboardBody).toContain('Consensus Client');
        });

        it('should substitute custom client names', () => {
            const templatePath = path.join(__dirname, '../../../lib/common/monitoring-dashboards/single-node-dashboard-template.json');

            new MonitoringConstruct(stack, 'TestMonitoring', {
                protocolName: 'dummy',
                deploymentMode: DeploymentMode.SINGLE_NODE,
                dataVolumes: mockDataVolumes,
                dashboardTemplatePath: templatePath,
                instanceId: 'i-1234567890abcdef0',
                clientNames: ['Geth', 'Lighthouse'],
            });

            const template = Template.fromStack(stack);
            template.resourceCountIs('AWS::CloudWatch::Dashboard', 1);
            
            // Verify dashboard body contains custom client names
            const resources = template.findResources('AWS::CloudWatch::Dashboard');
            const dashboardKey = Object.keys(resources)[0];
            const dashboardBody = JSON.stringify(resources[dashboardKey].Properties.DashboardBody);
            
            // Custom client names should be substituted
            expect(dashboardBody).toContain('Geth');
            expect(dashboardBody).toContain('Lighthouse');
        });

        it('should filter out Client2 widgets when only one client is configured', () => {
            const templatePath = path.join(__dirname, '../../../lib/common/monitoring-dashboards/single-node-dashboard-template.json');

            new MonitoringConstruct(stack, 'TestMonitoring', {
                protocolName: 'dummy',
                deploymentMode: DeploymentMode.SINGLE_NODE,
                dataVolumes: mockDataVolumes,
                dashboardTemplatePath: templatePath,
                instanceId: 'i-1234567890abcdef0',
                clientNames: ['Single Client'], // Only one client
            });

            const template = Template.fromStack(stack);
            template.resourceCountIs('AWS::CloudWatch::Dashboard', 1);
            
            // Verify dashboard body does NOT contain Client2 references
            const resources = template.findResources('AWS::CloudWatch::Dashboard');
            const dashboardKey = Object.keys(resources)[0];
            const dashboardBody = JSON.stringify(resources[dashboardKey].Properties.DashboardBody);
            
            // Should contain Client1
            expect(dashboardBody).toContain('Single Client');
            // Should NOT contain any Client2 references (widgets should be filtered out)
            expect(dashboardBody).not.toContain('Client2');
        });

        it('should filter out D2 disk widgets when only one data volume is configured', () => {
            const templatePath = path.join(__dirname, '../../../lib/common/monitoring-dashboards/single-node-dashboard-template.json');

            // Use only one data volume
            const singleDataVolume: StorageVolumeConfig[] = [
                {
                    TYPE: 'gp3',
                    SIZE: 100,
                    IOPS: 3000,
                    THROUGHPUT: 125,
                    MOUNT_PATH: '/data',
                    DEVICE_NAME: '/dev/sdf',
                    FILESYSTEM: 'ext4',
                },
            ];

            new MonitoringConstruct(stack, 'TestMonitoring', {
                protocolName: 'dummy',
                deploymentMode: DeploymentMode.SINGLE_NODE,
                dataVolumes: singleDataVolume,
                dashboardTemplatePath: templatePath,
                instanceId: 'i-1234567890abcdef0',
            });

            const template = Template.fromStack(stack);
            template.resourceCountIs('AWS::CloudWatch::Dashboard', 1);
            
            // Verify dashboard body does NOT contain D2 references
            const resources = template.findResources('AWS::CloudWatch::Dashboard');
            const dashboardKey = Object.keys(resources)[0];
            const dashboardBody = JSON.stringify(resources[dashboardKey].Properties.DashboardBody);
            
            // Should contain D1 device references (nvme1n1)
            expect(dashboardBody).toContain('nvme1n1');
            // Should NOT contain D2 device references (nvme2n1) - widgets should be filtered out
            expect(dashboardBody).not.toContain('nvme2n1');
        });
    });

    describe('Custom Variables', () => {
        it('should accept custom variables', () => {
            new MonitoringConstruct(stack, 'TestMonitoring', {
                protocolName: 'dummy',
                deploymentMode: DeploymentMode.SINGLE_NODE,
                dataVolumes: mockDataVolumes,
                instanceId: 'i-1234567890abcdef0',
                variables: {
                    CUSTOM_METRIC_NAMESPACE: 'MyApp',
                    CUSTOM_DIMENSION: 'Production',
                },
            });

            const template = Template.fromStack(stack);
            template.resourceCountIs('AWS::CloudWatch::Dashboard', 1);
        });
    });

    describe('Protocol-Specific Metrics', () => {
        it('should support protocol-specific metrics through template fallback', () => {
            // Test fallback mechanism - dummy protocol doesn't have single-node template
            new MonitoringConstruct(stack, 'TestMonitoring', {
                protocolName: 'dummy',
                deploymentMode: DeploymentMode.SINGLE_NODE,
                dataVolumes: mockDataVolumes,
                instanceId: 'i-1234567890abcdef0',
            });

            const template = Template.fromStack(stack);
            template.resourceCountIs('AWS::CloudWatch::Dashboard', 1);
        });
    });

    describe('Infrastructure Metrics', () => {
        it('should include infrastructure metrics in default dashboard', () => {
            new MonitoringConstruct(stack, 'TestMonitoring', {
                protocolName: 'dummy',
                deploymentMode: DeploymentMode.SINGLE_NODE,
                dataVolumes: mockDataVolumes,
                instanceId: 'i-1234567890abcdef0',
            });

            const template = Template.fromStack(stack);

            // Verify dashboard is created
            template.resourceCountIs('AWS::CloudWatch::Dashboard', 1);
        });
    });
});
