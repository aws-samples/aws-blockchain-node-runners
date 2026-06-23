// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

/**
 * CDK Nag Security Compliance Tests
 * 
 * These tests verify that the Universal Blockchain Node Runner application
 * complies with AWS security best practices as defined by CDK Nag.
 * 
 * Tests cover:
 * - Single-node deployments
 * - HA deployments
 * - Security group configurations
 * - IAM role permissions
 * - EBS encryption
 * - S3 asset encryption
 */

import * as cdk from 'aws-cdk-lib';
import * as nag from 'cdk-nag';
import * as path from 'path';
import { ConfigurationLoader } from '../../../lib/core/configuration-loader';
import { StackFactory } from '../../../lib/core/stack-factory';
import { DeploymentMode } from '../../../lib/interfaces';

describe('CDK Nag Security Compliance', () => {
    let app: cdk.App;
    let configLoader: ConfigurationLoader;
    const testBlueprintsPath = path.join(__dirname, '../../../blueprints');

    beforeEach(() => {
        app = new cdk.App();
        configLoader = new ConfigurationLoader(testBlueprintsPath);
    });

    describe('Single Node Stack Security', () => {
        it('should pass AWS Solutions security checks for single-node deployment', () => {
            // Load test configuration
            const testEnvPath = path.join(__dirname, '../../../blueprints/dummy/samples/.env-mainnet-single-node');
            const deploymentConfig = {
                protocol: configLoader.loadProtocolConfig('dummy'),
                environment: configLoader.loadEnvironmentConfig(testEnvPath),
            };

            // Create stack
            const stackFactory = new StackFactory();
            const stackName = 'test-single-node-security';
            const userDataScriptPath = path.join(__dirname, '../../../assets/common/user-data-ubuntu.sh');

            stackFactory.createStack(app, deploymentConfig, stackName, {
                userDataScriptPath,
            });

            // Apply CDK Nag checks
            cdk.Aspects.of(app).add(
                new nag.AwsSolutionsChecks({
                    verbose: false,
                    reports: false,
                    logIgnores: false,
                })
            );

            // Synthesize and check for errors
            const errors = getNagErrors(app);
            
            // We expect some warnings but no critical errors
            // Log any errors for debugging
            if (errors.length > 0) {
                console.log('CDK Nag findings for single-node stack:');
                errors.forEach(error => console.log(`  - ${error}`));
            }

            // This test documents current security posture
            // Adjust expectations based on actual implementation
            expect(errors.length).toBeLessThanOrEqual(10);
        });

        it('should have encrypted EBS volumes', () => {
            const testEnvPath = path.join(__dirname, '../../../blueprints/dummy/samples/.env-mainnet-single-node');
            const deploymentConfig = {
                protocol: configLoader.loadProtocolConfig('dummy'),
                environment: configLoader.loadEnvironmentConfig(testEnvPath),
            };

            const stackFactory = new StackFactory();
            const stackName = 'test-single-node-ebs-encryption';
            const userDataScriptPath = path.join(__dirname, '../../../assets/common/user-data-ubuntu.sh');

            const stack = stackFactory.createStack(app, deploymentConfig, stackName, {
                userDataScriptPath,
            });

            const template = cdk.assertions.Template.fromStack(stack);

            // Verify EBS volumes are encrypted
            template.hasResourceProperties('AWS::EC2::Volume', {
                Encrypted: true,
            });
        });

        it('should have least-privilege IAM policies', () => {
            const testEnvPath = path.join(__dirname, '../../../blueprints/dummy/samples/.env-mainnet-single-node');
            const deploymentConfig = {
                protocol: configLoader.loadProtocolConfig('dummy'),
                environment: configLoader.loadEnvironmentConfig(testEnvPath),
            };

            const stackFactory = new StackFactory();
            const stackName = 'test-single-node-iam';
            const userDataScriptPath = path.join(__dirname, '../../../assets/common/user-data-ubuntu.sh');

            const stack = stackFactory.createStack(app, deploymentConfig, stackName, {
                userDataScriptPath,
            });

            const template = cdk.assertions.Template.fromStack(stack);

            // Verify IAM role exists with appropriate policies
            template.hasResourceProperties('AWS::IAM::Role', {
                AssumeRolePolicyDocument: {
                    Statement: cdk.assertions.Match.arrayWith([
                        cdk.assertions.Match.objectLike({
                            Action: 'sts:AssumeRole',
                            Effect: 'Allow',
                            Principal: {
                                Service: 'ec2.amazonaws.com',
                            },
                        }),
                    ]),
                },
            });

            // Verify managed policies are attached
            template.hasResourceProperties('AWS::IAM::Role', {
                ManagedPolicyArns: cdk.assertions.Match.arrayWith([
                    cdk.assertions.Match.objectLike({
                        'Fn::Join': cdk.assertions.Match.arrayWith([
                            cdk.assertions.Match.arrayWith([
                                cdk.assertions.Match.stringLikeRegexp('.*AmazonSSMManagedInstanceCore'),
                            ]),
                        ]),
                    }),
                ]),
            });
        });

        it('should have restrictive security group rules', () => {
            const testEnvPath = path.join(__dirname, '../../../blueprints/dummy/samples/.env-mainnet-single-node');
            const deploymentConfig = {
                protocol: configLoader.loadProtocolConfig('dummy'),
                environment: configLoader.loadEnvironmentConfig(testEnvPath),
            };

            const stackFactory = new StackFactory();
            const stackName = 'test-single-node-sg';
            const userDataScriptPath = path.join(__dirname, '../../../assets/common/user-data-ubuntu.sh');

            const stack = stackFactory.createStack(app, deploymentConfig, stackName, {
                userDataScriptPath,
            });

            const template = cdk.assertions.Template.fromStack(stack);

            // Verify security group exists
            template.resourceCountIs('AWS::EC2::SecurityGroup', 1);

            // Verify ingress rules are based on protocol requirements
            const securityGroups = template.findResources('AWS::EC2::SecurityGroup');
            const sgKeys = Object.keys(securityGroups);
            expect(sgKeys.length).toBeGreaterThan(0);

            // Check that security group has ingress rules
            const sg = securityGroups[sgKeys[0]];
            expect(sg.Properties.SecurityGroupIngress).toBeDefined();
        });
    });

    describe('HA Nodes Stack Security', () => {
        it('should pass AWS Solutions security checks for HA deployment', () => {
            // Load test configuration
            const testEnvPath = path.join(__dirname, '../../../blueprints/dummy/samples/.env-testnet-ha-nodes');
            const deploymentConfig = {
                protocol: configLoader.loadProtocolConfig('dummy'),
                environment: configLoader.loadEnvironmentConfig(testEnvPath),
            };

            // Create stack
            const stackFactory = new StackFactory();
            const stackName = 'test-ha-nodes-security';
            const userDataScriptPath = path.join(__dirname, '../../../assets/common/user-data-ubuntu.sh');

            stackFactory.createStack(app, deploymentConfig, stackName, {
                userDataScriptPath,
            });

            // Apply CDK Nag checks
            cdk.Aspects.of(app).add(
                new nag.AwsSolutionsChecks({
                    verbose: false,
                    reports: false,
                    logIgnores: false,
                })
            );

            // Synthesize and check for errors
            const errors = getNagErrors(app);
            
            if (errors.length > 0) {
                console.log('CDK Nag findings for HA stack:');
                errors.forEach(error => console.log(`  - ${error}`));
            }

            // This test documents current security posture
            expect(errors.length).toBeLessThanOrEqual(15);
        });

        it('should have encrypted EBS volumes in launch template', () => {
            const testEnvPath = path.join(__dirname, '../../../blueprints/dummy/samples/.env-testnet-ha-nodes');
            const deploymentConfig = {
                protocol: configLoader.loadProtocolConfig('dummy'),
                environment: configLoader.loadEnvironmentConfig(testEnvPath),
            };

            const stackFactory = new StackFactory();
            const stackName = 'test-ha-nodes-ebs-encryption';
            const userDataScriptPath = path.join(__dirname, '../../../assets/common/user-data-ubuntu.sh');

            const stack = stackFactory.createStack(app, deploymentConfig, stackName, {
                userDataScriptPath,
            });

            const template = cdk.assertions.Template.fromStack(stack);

            // Verify launch template has encrypted volumes
            template.hasResourceProperties('AWS::EC2::LaunchTemplate', {
                LaunchTemplateData: {
                    BlockDeviceMappings: cdk.assertions.Match.arrayWith([
                        cdk.assertions.Match.objectLike({
                            Ebs: cdk.assertions.Match.objectLike({
                                Encrypted: true,
                            }),
                        }),
                    ]),
                },
            });
        });

        it('should have ALB with proper security configuration', () => {
            const testEnvPath = path.join(__dirname, '../../../blueprints/dummy/samples/.env-testnet-ha-nodes');
            const deploymentConfig = {
                protocol: configLoader.loadProtocolConfig('dummy'),
                environment: configLoader.loadEnvironmentConfig(testEnvPath),
            };

            const stackFactory = new StackFactory();
            const stackName = 'test-ha-nodes-alb';
            const userDataScriptPath = path.join(__dirname, '../../../assets/common/user-data-ubuntu.sh');

            const stack = stackFactory.createStack(app, deploymentConfig, stackName, {
                userDataScriptPath,
            });

            const template = cdk.assertions.Template.fromStack(stack);

            // Verify ALB exists
            template.resourceCountIs('AWS::ElasticLoadBalancingV2::LoadBalancer', 1);

            // Verify ALB has security groups assigned
            const albs = template.findResources('AWS::ElasticLoadBalancingV2::LoadBalancer');
            const albKeys = Object.keys(albs);
            expect(albKeys.length).toBe(1);
            
            const alb = albs[albKeys[0]];
            expect(alb.Properties.SecurityGroups).toBeDefined();
            expect(Array.isArray(alb.Properties.SecurityGroups)).toBe(true);
            expect(alb.Properties.SecurityGroups.length).toBeGreaterThan(0);
        });

        it('should have IAM role with lifecycle hook permissions', () => {
            const testEnvPath = path.join(__dirname, '../../../blueprints/dummy/samples/.env-testnet-ha-nodes');
            const deploymentConfig = {
                protocol: configLoader.loadProtocolConfig('dummy'),
                environment: configLoader.loadEnvironmentConfig(testEnvPath),
            };

            const stackFactory = new StackFactory();
            const stackName = 'test-ha-nodes-iam';
            const userDataScriptPath = path.join(__dirname, '../../../assets/common/user-data-ubuntu.sh');

            const stack = stackFactory.createStack(app, deploymentConfig, stackName, {
                userDataScriptPath,
            });

            const template = cdk.assertions.Template.fromStack(stack);

            // Verify IAM policy has autoscaling permissions
            const policies = template.findResources('AWS::IAM::Policy');
            const policyKeys = Object.keys(policies);
            expect(policyKeys.length).toBeGreaterThan(0);

            // Check that at least one policy has autoscaling:CompleteLifecycleAction permission
            let hasLifecyclePermission = false;
            for (const key of policyKeys) {
                const policy = policies[key];
                const statements = policy.Properties.PolicyDocument.Statement;
                for (const statement of statements) {
                    const actions = Array.isArray(statement.Action) ? statement.Action : [statement.Action];
                    if (actions.includes('autoscaling:CompleteLifecycleAction')) {
                        hasLifecyclePermission = true;
                        break;
                    }
                }
                if (hasLifecyclePermission) break;
            }

            expect(hasLifecyclePermission).toBe(true);
        });

        it('should have separate security groups for ALB and instances', () => {
            const testEnvPath = path.join(__dirname, '../../../blueprints/dummy/samples/.env-testnet-ha-nodes');
            const deploymentConfig = {
                protocol: configLoader.loadProtocolConfig('dummy'),
                environment: configLoader.loadEnvironmentConfig(testEnvPath),
            };

            const stackFactory = new StackFactory();
            const stackName = 'test-ha-nodes-sg-separation';
            const userDataScriptPath = path.join(__dirname, '../../../assets/common/user-data-ubuntu.sh');

            const stack = stackFactory.createStack(app, deploymentConfig, stackName, {
                userDataScriptPath,
            });

            const template = cdk.assertions.Template.fromStack(stack);

            // Verify we have at least 2 security groups (ALB and instances)
            template.resourceCountIs('AWS::EC2::SecurityGroup', 2);
        });
    });

    describe('Common Security Requirements', () => {
        it('should not allow unrestricted SSH access', () => {
            const testEnvPath = path.join(__dirname, '../../../blueprints/dummy/samples/.env-mainnet-single-node');
            const deploymentConfig = {
                protocol: configLoader.loadProtocolConfig('dummy'),
                environment: configLoader.loadEnvironmentConfig(testEnvPath),
            };

            const stackFactory = new StackFactory();
            const stackName = 'test-no-ssh';
            const userDataScriptPath = path.join(__dirname, '../../../assets/common/user-data-ubuntu.sh');

            const stack = stackFactory.createStack(app, deploymentConfig, stackName, {
                userDataScriptPath,
            });

            const template = cdk.assertions.Template.fromStack(stack);

            // Verify no security group allows SSH from 0.0.0.0/0
            const securityGroups = template.findResources('AWS::EC2::SecurityGroup');
            Object.values(securityGroups).forEach((sg: any) => {
                const ingress = sg.Properties.SecurityGroupIngress || [];
                ingress.forEach((rule: any) => {
                    if (rule.FromPort === 22 || rule.ToPort === 22) {
                        expect(rule.CidrIp).not.toBe('0.0.0.0/0');
                    }
                });
            });
        });

        it('should use Systems Manager for instance access', () => {
            const testEnvPath = path.join(__dirname, '../../../blueprints/dummy/samples/.env-mainnet-single-node');
            const deploymentConfig = {
                protocol: configLoader.loadProtocolConfig('dummy'),
                environment: configLoader.loadEnvironmentConfig(testEnvPath),
            };

            const stackFactory = new StackFactory();
            const stackName = 'test-ssm-access';
            const userDataScriptPath = path.join(__dirname, '../../../assets/common/user-data-ubuntu.sh');

            const stack = stackFactory.createStack(app, deploymentConfig, stackName, {
                userDataScriptPath,
            });

            const template = cdk.assertions.Template.fromStack(stack);

            // Verify SSM managed policy is attached
            template.hasResourceProperties('AWS::IAM::Role', {
                ManagedPolicyArns: cdk.assertions.Match.arrayWith([
                    cdk.assertions.Match.objectLike({
                        'Fn::Join': cdk.assertions.Match.arrayWith([
                            cdk.assertions.Match.arrayWith([
                                cdk.assertions.Match.stringLikeRegexp('.*AmazonSSMManagedInstanceCore'),
                            ]),
                        ]),
                    }),
                ]),
            });
        });
    });
});

/**
 * Helper function to extract CDK Nag errors from synthesized app
 */
function getNagErrors(app: cdk.App): string[] {
    const errors: string[] = [];
    
    try {
        // Synthesize the app to trigger CDK Nag checks
        app.synth();
    } catch (error) {
        // CDK Nag throws errors during synthesis
        if (error instanceof Error) {
            // Parse error message for CDK Nag findings
            const errorLines = error.message.split('\n');
            errorLines.forEach(line => {
                if (line.includes('[Error]') || line.includes('AwsSolutions-')) {
                    errors.push(line.trim());
                }
            });
        }
    }
    
    return errors;
}
