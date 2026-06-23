// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import { Template, Match } from 'aws-cdk-lib/assertions';
import * as path from 'path';
import { StackFactory } from '../../../lib/core/stack-factory';
import { ConfigurationLoader } from '../../../lib/core/configuration-loader';
import { DeploymentConfig, ProtocolConfig, DeploymentMode } from '../../../lib/interfaces';

describe('StackFactory', () => {
    let app: cdk.App;
    let stackFactory: StackFactory;
    let configLoader: ConfigurationLoader;
    let protocolConfig: ProtocolConfig;
    let mockVpc: ec2.IVpc;
    let testUserDataScriptPath: string;

    beforeEach(() => {
        app = new cdk.App();
        stackFactory = new StackFactory();

        // Load configurations from real blueprints directory
        const testBlueprintsPath = path.join(__dirname, '../../../blueprints');
        configLoader = new ConfigurationLoader(testBlueprintsPath);
        protocolConfig = configLoader.loadProtocolConfig('dummy');

        // Path to test user data script
        testUserDataScriptPath = path.join(__dirname, '../../../assets/common/user-data-ubuntu.sh');
    });

    describe('createSingleNodeStack', () => {
        let singleNodeDeploymentConfig: DeploymentConfig;
        let stackName: string;

        beforeEach(() => {
            const testEnvPath = path.join(__dirname, '../../../blueprints/dummy/samples/.env-mainnet-single-node');
            const environmentConfig = configLoader.loadEnvironmentConfig(testEnvPath);

            singleNodeDeploymentConfig = {
                protocol: protocolConfig,
                environment: environmentConfig,
            };
            stackName = configLoader.getStackName(singleNodeDeploymentConfig);
        });

        it('should create a stack with correct name', () => {
            // Create a helper stack for VPC
            const vpcStack = new cdk.Stack(app, 'VpcStack', {
                env: { account: '123456789012', region: 'us-east-1' },
            });
            mockVpc = new ec2.Vpc(vpcStack, 'MockVPC', { maxAzs: 2 });

            const stack = stackFactory.createSingleNodeStack(
                app,
                singleNodeDeploymentConfig,
                stackName,
                {
                    userDataScriptPath: testUserDataScriptPath,
                    vpc: mockVpc
                }
            );

            // Stack name should include protocol, network, and client config (version numbers removed)
            expect(stack.stackName).toBe('dummy-testnet-dummy-rpc-base');
        });

        it('should create an EC2 instance', () => {
            // Create a helper stack for VPC
            const vpcStack = new cdk.Stack(app, 'VpcStack', {
                env: { account: '123456789012', region: 'us-east-1' },
            });
            mockVpc = new ec2.Vpc(vpcStack, 'MockVPC', { maxAzs: 2 });

            const stack = stackFactory.createSingleNodeStack(
                app,
                singleNodeDeploymentConfig,
                stackName,
                {
                    userDataScriptPath: testUserDataScriptPath,
                    vpc: mockVpc
                }
            );

            const template = Template.fromStack(stack);
            template.resourceCountIs('AWS::EC2::Instance', 1);
        });

        it('should create a security group', () => {
            // Create a helper stack for VPC
            const vpcStack = new cdk.Stack(app, 'VpcStack', {
                env: { account: '123456789012', region: 'us-east-1' },
            });
            mockVpc = new ec2.Vpc(vpcStack, 'MockVPC', { maxAzs: 2 });

            const stack = stackFactory.createSingleNodeStack(
                app,
                singleNodeDeploymentConfig,
                stackName,
                {
                    userDataScriptPath: testUserDataScriptPath,
                    vpc: mockVpc
                }
            );

            const template = Template.fromStack(stack);
            template.resourceCountIs('AWS::EC2::SecurityGroup', 1);
        });

        it('should create an IAM role', () => {
            // Create a helper stack for VPC
            const vpcStack = new cdk.Stack(app, 'VpcStack', {
                env: { account: '123456789012', region: 'us-east-1' },
            });
            mockVpc = new ec2.Vpc(vpcStack, 'MockVPC', { maxAzs: 2 });

            const stack = stackFactory.createSingleNodeStack(
                app,
                singleNodeDeploymentConfig,
                stackName,
                {
                    userDataScriptPath: testUserDataScriptPath,
                    vpc: mockVpc
                }
            );

            const template = Template.fromStack(stack);
            template.hasResourceProperties('AWS::IAM::Role', {
                AssumeRolePolicyDocument: Match.objectLike({
                    Statement: Match.arrayWith([
                        Match.objectLike({
                            Action: 'sts:AssumeRole',
                            Effect: 'Allow',
                            Principal: {
                                Service: 'ec2.amazonaws.com',
                            },
                        }),
                    ]),
                }),
            });
        });

        it('should create CloudWatch dashboard', () => {
            // Create a helper stack for VPC
            const vpcStack = new cdk.Stack(app, 'VpcStack', {
                env: { account: '123456789012', region: 'us-east-1' },
            });
            mockVpc = new ec2.Vpc(vpcStack, 'MockVPC', { maxAzs: 2 });

            const stack = stackFactory.createSingleNodeStack(
                app,
                singleNodeDeploymentConfig,
                stackName,
                {
                    userDataScriptPath: testUserDataScriptPath,
                    vpc: mockVpc
                }
            );

            const template = Template.fromStack(stack);
            template.resourceCountIs('AWS::CloudWatch::Dashboard', 1);
        });

        it('should create CloudFormation outputs', () => {
            // Create a helper stack for VPC
            const vpcStack = new cdk.Stack(app, 'VpcStack', {
                env: { account: '123456789012', region: 'us-east-1' },
            });
            mockVpc = new ec2.Vpc(vpcStack, 'MockVPC', { maxAzs: 2 });

            const stack = stackFactory.createSingleNodeStack(
                app,
                singleNodeDeploymentConfig,
                stackName,
                {
                    userDataScriptPath: testUserDataScriptPath,
                    vpc: mockVpc
                }
            );

            const template = Template.fromStack(stack);

            // Check for expected outputs
            template.hasOutput('InstanceId', {});
            template.hasOutput('SecurityGroupId', {});
            template.hasOutput('InstanceRoleArn', {});
        });

        it('should use default user data when none provided', () => {
            // Create a helper stack for VPC
            const vpcStack = new cdk.Stack(app, 'VpcStack', {
                env: { account: '123456789012', region: 'us-east-1' },
            });
            mockVpc = new ec2.Vpc(vpcStack, 'MockVPC', { maxAzs: 2 });

            const stack = stackFactory.createSingleNodeStack(
                app,
                singleNodeDeploymentConfig,
                stackName,
                {
                    userDataScriptPath: testUserDataScriptPath,
                    vpc: mockVpc
                }
            );

            const template = Template.fromStack(stack);
            template.hasResourceProperties('AWS::EC2::Instance', {
                UserData: Match.anyValue(),
            });
        });
    });

    describe('createHANodesStack', () => {
        let haDeploymentConfig: DeploymentConfig;
        let stackName: string;

        beforeEach(() => {
            const testEnvPath = path.join(__dirname, '../../../blueprints/dummy/samples/.env-testnet-ha-nodes');
            const environmentConfig = configLoader.loadEnvironmentConfig(testEnvPath);

            haDeploymentConfig = {
                protocol: protocolConfig,
                environment: environmentConfig,
            };
            stackName = configLoader.getStackName(haDeploymentConfig);
        });

        it('should create a stack with correct name', () => {
            // Create a helper stack for VPC
            const vpcStack = new cdk.Stack(app, 'VpcStack', {
                env: { account: '123456789012', region: 'us-east-1' },
            });
            mockVpc = new ec2.Vpc(vpcStack, 'MockVPC', { maxAzs: 2 });

            const stack = stackFactory.createHANodesStack(
                app,
                haDeploymentConfig,
                stackName,
                {
                    userDataScriptPath: testUserDataScriptPath,
                    vpc: mockVpc
                }
            );

            // Stack name should include protocol, network, and client config (version numbers removed)
            expect(stack.stackName).toBe('dummy-mainnet-dummy-rpc-extended');
        });

        it('should create an Auto Scaling Group', () => {
            // Create a helper stack for VPC
            const vpcStack = new cdk.Stack(app, 'VpcStack', {
                env: { account: '123456789012', region: 'us-east-1' },
            });
            mockVpc = new ec2.Vpc(vpcStack, 'MockVPC', { maxAzs: 2 });

            const stack = stackFactory.createHANodesStack(
                app,
                haDeploymentConfig,
                stackName,
                {
                    userDataScriptPath: testUserDataScriptPath,
                    vpc: mockVpc
                }
            );

            const template = Template.fromStack(stack);
            template.resourceCountIs('AWS::AutoScaling::AutoScalingGroup', 1);
        });

        it('should create an Application Load Balancer', () => {
            // Create a helper stack for VPC
            const vpcStack = new cdk.Stack(app, 'VpcStack', {
                env: { account: '123456789012', region: 'us-east-1' },
            });
            mockVpc = new ec2.Vpc(vpcStack, 'MockVPC', { maxAzs: 2 });

            const stack = stackFactory.createHANodesStack(
                app,
                haDeploymentConfig,
                stackName,
                {
                    userDataScriptPath: testUserDataScriptPath,
                    vpc: mockVpc
                }
            );

            const template = Template.fromStack(stack);
            template.resourceCountIs('AWS::ElasticLoadBalancingV2::LoadBalancer', 1);
        });

        it('should create a target group', () => {
            // Create a helper stack for VPC
            const vpcStack = new cdk.Stack(app, 'VpcStack', {
                env: { account: '123456789012', region: 'us-east-1' },
            });
            mockVpc = new ec2.Vpc(vpcStack, 'MockVPC', { maxAzs: 2 });

            const stack = stackFactory.createHANodesStack(
                app,
                haDeploymentConfig,
                stackName,
                {
                    userDataScriptPath: testUserDataScriptPath,
                    vpc: mockVpc
                }
            );

            const template = Template.fromStack(stack);
            template.resourceCountIs('AWS::ElasticLoadBalancingV2::TargetGroup', 1);
        });

        it('should create security groups for ALB and instances', () => {
            // Create a helper stack for VPC
            const vpcStack = new cdk.Stack(app, 'VpcStack', {
                env: { account: '123456789012', region: 'us-east-1' },
            });
            mockVpc = new ec2.Vpc(vpcStack, 'MockVPC', { maxAzs: 2 });

            const stack = stackFactory.createHANodesStack(
                app,
                haDeploymentConfig,
                stackName,
                {
                    userDataScriptPath: testUserDataScriptPath,
                    vpc: mockVpc
                }
            );

            const template = Template.fromStack(stack);
            // Should have 2 security groups: one for ALB, one for instances
            template.resourceCountIs('AWS::EC2::SecurityGroup', 2);
        });

        it('should create a lifecycle hook', () => {
            // Create a helper stack for VPC
            const vpcStack = new cdk.Stack(app, 'VpcStack', {
                env: { account: '123456789012', region: 'us-east-1' },
            });
            mockVpc = new ec2.Vpc(vpcStack, 'MockVPC', { maxAzs: 2 });

            const stack = stackFactory.createHANodesStack(
                app,
                haDeploymentConfig,
                stackName,
                {
                    userDataScriptPath: testUserDataScriptPath,
                    vpc: mockVpc
                }
            );

            const template = Template.fromStack(stack);
            template.resourceCountIs('AWS::AutoScaling::LifecycleHook', 1);
        });

        it('should create CloudFormation outputs', () => {
            // Create a helper stack for VPC
            const vpcStack = new cdk.Stack(app, 'VpcStack', {
                env: { account: '123456789012', region: 'us-east-1' },
            });
            mockVpc = new ec2.Vpc(vpcStack, 'MockVPC', { maxAzs: 2 });

            const stack = stackFactory.createHANodesStack(
                app,
                haDeploymentConfig,
                stackName,
                {
                    userDataScriptPath: testUserDataScriptPath,
                    vpc: mockVpc
                }
            );

            const template = Template.fromStack(stack);

            // Check for expected outputs (using actual output names from HANodesStack)
            template.hasOutput('LoadBalancerDnsName', {});
            template.hasOutput('LoadBalancerArn', {});
            template.hasOutput('TargetGroupArn', {});
            template.hasOutput('AutoScalingGroupName', {});
            template.hasOutput('LifecycleHookName', {});
            template.hasOutput('InstanceSecurityGroupId', {});
            template.hasOutput('AlbSecurityGroupId', {});
            template.hasOutput('InstanceRoleArn', {});
        });

        it('should throw error when HA config is missing', () => {
            // Create config without HA settings
            const testEnvPath = path.join(__dirname, '../../../blueprints/dummy/samples/.env-mainnet-single-node');
            const environmentConfig = configLoader.loadEnvironmentConfig(testEnvPath);

            const invalidConfig: DeploymentConfig = {
                protocol: protocolConfig,
                environment: environmentConfig,
            };
            const invalidStackName = configLoader.getStackName(invalidConfig);

            // Create a helper stack for VPC
            const vpcStack = new cdk.Stack(app, 'VpcStack', {
                env: { account: '123456789012', region: 'us-east-1' },
            });
            mockVpc = new ec2.Vpc(vpcStack, 'MockVPC', { maxAzs: 2 });

            // Delete a required HA config field to trigger validation error
            delete (environmentConfig.HA_CONFIG as any).HA_NUMBER_OF_NODES;

            expect(() => {
                stackFactory.createHANodesStack(
                    app,
                    invalidConfig,
                    invalidStackName,
                    {
                        userDataScriptPath: testUserDataScriptPath,
                        vpc: mockVpc
                    }
                );
            }).toThrow('Configuration validation for HA setup is failed');
        });

        it('should configure ASG with correct capacity from fixture', () => {
            // Create a helper stack for VPC
            const vpcStack = new cdk.Stack(app, 'VpcStack', {
                env: { account: '123456789012', region: 'us-east-1' },
            });
            mockVpc = new ec2.Vpc(vpcStack, 'MockVPC', { maxAzs: 2 });

            const stack = stackFactory.createHANodesStack(
                app,
                haDeploymentConfig,
                stackName,
                {
                    userDataScriptPath: testUserDataScriptPath,
                    vpc: mockVpc
                }
            );

            const template = Template.fromStack(stack);

            // From ha-nodes.env: HA_NUMBER_OF_NODES="3"
            template.hasResourceProperties('AWS::AutoScaling::AutoScalingGroup', {
                DesiredCapacity: '3',
                MaxSize: '6', // 2x desired capacity
                MinSize: '1',
            });
        });
    });

    describe('createStack', () => {
        it('should create single node stack when deployment mode is single-node', () => {
            const testEnvPath = path.join(__dirname, '../../../blueprints/dummy/samples/.env-mainnet-single-node');
            const environmentConfig = configLoader.loadEnvironmentConfig(testEnvPath);

            const deploymentConfig: DeploymentConfig = {
                protocol: protocolConfig,
                environment: environmentConfig,
            };
            const stackName = configLoader.getStackName(deploymentConfig);

            // Create a helper stack for VPC
            const vpcStack = new cdk.Stack(app, 'VpcStack', {
                env: { account: '123456789012', region: 'us-east-1' },
            });
            mockVpc = new ec2.Vpc(vpcStack, 'MockVPC', { maxAzs: 2 });

            const stack = stackFactory.createStack(
                app,
                deploymentConfig,
                stackName,
                {
                    userDataScriptPath: testUserDataScriptPath,
                    vpc: mockVpc
                }
            );

            const template = Template.fromStack(stack);

            // Should have EC2 instance (single node)
            template.resourceCountIs('AWS::EC2::Instance', 1);
            // Should NOT have ASG
            template.resourceCountIs('AWS::AutoScaling::AutoScalingGroup', 0);
        });

        it('should create HA nodes stack when deployment mode is ha-nodes', () => {
            const testEnvPath = path.join(__dirname, '../../../blueprints/dummy/samples/.env-testnet-ha-nodes');
            const environmentConfig = configLoader.loadEnvironmentConfig(testEnvPath);

            const deploymentConfig: DeploymentConfig = {
                protocol: protocolConfig,
                environment: environmentConfig,
            };
            const stackName = configLoader.getStackName(deploymentConfig);

            // Create a helper stack for VPC
            const vpcStack = new cdk.Stack(app, 'VpcStack', {
                env: { account: '123456789012', region: 'us-east-1' },
            });
            mockVpc = new ec2.Vpc(vpcStack, 'MockVPC', { maxAzs: 2 });

            const stack = stackFactory.createStack(
                app,
                deploymentConfig,
                stackName,
                {
                    userDataScriptPath: testUserDataScriptPath,
                    vpc: mockVpc
                }
            );

            const template = Template.fromStack(stack);

            // Should have ASG (HA nodes)
            template.resourceCountIs('AWS::AutoScaling::AutoScalingGroup', 1);
            // Should NOT have standalone EC2 instance
            template.resourceCountIs('AWS::EC2::Instance', 0);
        });

        it('should throw error for unsupported deployment mode', () => {
            const testEnvPath = path.join(__dirname, '../../../blueprints/dummy/samples/.env-mainnet-single-node');
            const environmentConfig = configLoader.loadEnvironmentConfig(testEnvPath);

            // Force an invalid deployment mode
            (environmentConfig as any).DEPLOYMENT_MODE = 'invalid-mode';

            const deploymentConfig: DeploymentConfig = {
                protocol: protocolConfig,
                environment: environmentConfig,
            };

            // Create a helper stack for VPC
            const vpcStack = new cdk.Stack(app, 'VpcStack', {
                env: { account: '123456789012', region: 'us-east-1' },
            });
            mockVpc = new ec2.Vpc(vpcStack, 'MockVPC', { maxAzs: 2 });

            expect(() => {
                stackFactory.createStack(
                    app,
                    deploymentConfig,
                    'test-stack',
                    {
                        userDataScriptPath: testUserDataScriptPath,
                        vpc: mockVpc
                    }
                );
            }).toThrow('Unsupported deployment mode: invalid-mode');
        });
    });

    describe('Stack naming', () => {
        it('should generate correct stack name with network', () => {
            const testEnvPath = path.join(__dirname, '../../../blueprints/dummy/samples/.env-mainnet-single-node');
            const environmentConfig = configLoader.loadEnvironmentConfig(testEnvPath);

            const deploymentConfig: DeploymentConfig = {
                protocol: protocolConfig,
                environment: environmentConfig,
            };
            const stackName = configLoader.getStackName(deploymentConfig);

            // Create a helper stack for VPC
            const vpcStack = new cdk.Stack(app, 'VpcStack', {
                env: { account: '123456789012', region: 'us-east-1' },
            });
            mockVpc = new ec2.Vpc(vpcStack, 'MockVPC', { maxAzs: 2 });

            const stack = stackFactory.createSingleNodeStack(
                app,
                deploymentConfig,
                stackName,
                {
                    userDataScriptPath: testUserDataScriptPath,
                    vpc: mockVpc
                }
            );

            // From single-node.env: BC_NETWORK="testnet", CLIENT_CONFIG="dummy-1.0.0-rpc-base.sh" (version numbers removed)
            expect(stack.stackName).toBe('dummy-testnet-dummy-rpc-base');
        });

        it('should generate correct stack name for HA deployment', () => {
            const testEnvPath = path.join(__dirname, '../../../blueprints/dummy/samples/.env-testnet-ha-nodes');
            const environmentConfig = configLoader.loadEnvironmentConfig(testEnvPath);

            const deploymentConfig: DeploymentConfig = {
                protocol: protocolConfig,
                environment: environmentConfig,
            };
            const stackName = configLoader.getStackName(deploymentConfig);

            // Create a helper stack for VPC
            const vpcStack = new cdk.Stack(app, 'VpcStack', {
                env: { account: '123456789012', region: 'us-east-1' },
            });
            mockVpc = new ec2.Vpc(vpcStack, 'MockVPC', { maxAzs: 2 });

            const stack = stackFactory.createHANodesStack(
                app,
                deploymentConfig,
                stackName,
                {
                    userDataScriptPath: testUserDataScriptPath,
                    vpc: mockVpc
                }
            );

            // From ha-nodes.env: BC_NETWORK="mainnet", CLIENT_CONFIG="dummy-1.0.0-rpc-extended.sh" (version numbers removed)
            expect(stack.stackName).toBe('dummy-mainnet-dummy-rpc-extended');
        });
    });
});
