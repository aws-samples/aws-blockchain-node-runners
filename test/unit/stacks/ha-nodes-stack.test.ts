// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import { Template, Match } from 'aws-cdk-lib/assertions';
import * as path from 'path';
import { HANodesStack } from '../../../lib/stacks/ha-nodes-stack';
import { ConfigurationLoader } from '../../../lib/core/configuration-loader';
import { DeploymentConfig, ProtocolConfig } from '../../../lib/interfaces';

describe('HANodesStack', () => {
    let app: cdk.App;
    let configLoader: ConfigurationLoader;
    let protocolConfig: ProtocolConfig;
    let deploymentConfig: DeploymentConfig;
    let mockVpc: ec2.IVpc;
    let testUserDataScriptPath: string;

    beforeEach(() => {
        app = new cdk.App();

        // Load configurations from real blueprints directory
        const testBlueprintsPath = path.join(__dirname, '../../../blueprints');
        configLoader = new ConfigurationLoader(testBlueprintsPath);
        protocolConfig = configLoader.loadProtocolConfig('dummy');

        const testEnvPath = path.join(__dirname, '../../../blueprints/dummy/samples/.env-testnet-ha-nodes');
        const environmentConfig = configLoader.loadEnvironmentConfig(testEnvPath);

        deploymentConfig = {
            protocol: protocolConfig,
            environment: environmentConfig,
        };

        // Path to test user data script
        testUserDataScriptPath = path.join(__dirname, '../../../assets/common/user-data-ubuntu.sh');
    });

    describe('Stack Creation', () => {
        it('should create a stack with the correct name', () => {
            // Create a helper stack for VPC
            const vpcStack = new cdk.Stack(app, 'VpcStack', {
                env: { account: '123456789012', region: 'us-east-1' },
            });
            mockVpc = new ec2.Vpc(vpcStack, 'MockVPC', { maxAzs: 2 });

            const stack = new HANodesStack(app, 'TestHANodesStack', {
                stackName: 'dummy-mainnet-ha-nodes',
                deploymentConfig,
                userDataScriptPath: testUserDataScriptPath,
                vpc: mockVpc,
                env: { account: '123456789012', region: 'us-east-1' },
            });

            expect(stack.stackName).toBe('dummy-mainnet-ha-nodes');
        });

        it('should create an Application Load Balancer', () => {
            const vpcStack = new cdk.Stack(app, 'VpcStack', {
                env: { account: '123456789012', region: 'us-east-1' },
            });
            mockVpc = new ec2.Vpc(vpcStack, 'MockVPC', { maxAzs: 2 });

            const stack = new HANodesStack(app, 'TestHANodesStack', {
                deploymentConfig,
                userDataScriptPath: testUserDataScriptPath,
                vpc: mockVpc,
                env: { account: '123456789012', region: 'us-east-1' },
            });

            const template = Template.fromStack(stack);
            template.resourceCountIs('AWS::ElasticLoadBalancingV2::LoadBalancer', 1);
        });

        it('should create an Auto Scaling Group', () => {
            const vpcStack = new cdk.Stack(app, 'VpcStack', {
                env: { account: '123456789012', region: 'us-east-1' },
            });
            mockVpc = new ec2.Vpc(vpcStack, 'MockVPC', { maxAzs: 2 });

            const stack = new HANodesStack(app, 'TestHANodesStack', {
                deploymentConfig,
                userDataScriptPath: testUserDataScriptPath,
                vpc: mockVpc,
                env: { account: '123456789012', region: 'us-east-1' },
            });

            const template = Template.fromStack(stack);
            template.resourceCountIs('AWS::AutoScaling::AutoScalingGroup', 1);
        });

        it('should create security groups for ALB and instances', () => {
            const vpcStack = new cdk.Stack(app, 'VpcStack', {
                env: { account: '123456789012', region: 'us-east-1' },
            });
            mockVpc = new ec2.Vpc(vpcStack, 'MockVPC', { maxAzs: 2 });

            const stack = new HANodesStack(app, 'TestHANodesStack', {
                deploymentConfig,
                userDataScriptPath: testUserDataScriptPath,
                vpc: mockVpc,
                env: { account: '123456789012', region: 'us-east-1' },
            });

            const template = Template.fromStack(stack);
            // Should have 2 security groups: one for ALB, one for instances
            template.resourceCountIs('AWS::EC2::SecurityGroup', 2);
        });

        it('should create an IAM role with correct permissions', () => {
            const vpcStack = new cdk.Stack(app, 'VpcStack', {
                env: { account: '123456789012', region: 'us-east-1' },
            });
            mockVpc = new ec2.Vpc(vpcStack, 'MockVPC', { maxAzs: 2 });

            const stack = new HANodesStack(app, 'TestHANodesStack', {
                deploymentConfig,
                userDataScriptPath: testUserDataScriptPath,
                vpc: mockVpc,
                env: { account: '123456789012', region: 'us-east-1' },
            });

            const template = Template.fromStack(stack);

            // Verify IAM role is created with EC2 assume role policy
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

        it('should create a target group', () => {
            const vpcStack = new cdk.Stack(app, 'VpcStack', {
                env: { account: '123456789012', region: 'us-east-1' },
            });
            mockVpc = new ec2.Vpc(vpcStack, 'MockVPC', { maxAzs: 2 });

            const stack = new HANodesStack(app, 'TestHANodesStack', {
                deploymentConfig,
                userDataScriptPath: testUserDataScriptPath,
                vpc: mockVpc,
                env: { account: '123456789012', region: 'us-east-1' },
            });

            const template = Template.fromStack(stack);
            template.resourceCountIs('AWS::ElasticLoadBalancingV2::TargetGroup', 1);
        });

        it('should create a lifecycle hook', () => {
            const vpcStack = new cdk.Stack(app, 'VpcStack', {
                env: { account: '123456789012', region: 'us-east-1' },
            });
            mockVpc = new ec2.Vpc(vpcStack, 'MockVPC', { maxAzs: 2 });

            const stack = new HANodesStack(app, 'TestHANodesStack', {
                deploymentConfig,
                userDataScriptPath: testUserDataScriptPath,
                vpc: mockVpc,
                env: { account: '123456789012', region: 'us-east-1' },
            });

            const template = Template.fromStack(stack);
            template.resourceCountIs('AWS::AutoScaling::LifecycleHook', 1);
        });
    });

    describe('CloudFormation Outputs', () => {
        it('should create LoadBalancerDnsName output', () => {
            const vpcStack = new cdk.Stack(app, 'VpcStack', {
                env: { account: '123456789012', region: 'us-east-1' },
            });
            mockVpc = new ec2.Vpc(vpcStack, 'MockVPC', { maxAzs: 2 });

            const stack = new HANodesStack(app, 'TestHANodesStack', {
                deploymentConfig,
                userDataScriptPath: testUserDataScriptPath,
                vpc: mockVpc,
                env: { account: '123456789012', region: 'us-east-1' },
            });

            const template = Template.fromStack(stack);
            template.hasOutput('LoadBalancerDnsName', {
                Description: 'Application Load Balancer DNS Name',
            });
        });

        it('should create LoadBalancerArn output', () => {
            const vpcStack = new cdk.Stack(app, 'VpcStack', {
                env: { account: '123456789012', region: 'us-east-1' },
            });
            mockVpc = new ec2.Vpc(vpcStack, 'MockVPC', { maxAzs: 2 });

            const stack = new HANodesStack(app, 'TestHANodesStack', {
                deploymentConfig,
                userDataScriptPath: testUserDataScriptPath,
                vpc: mockVpc,
                env: { account: '123456789012', region: 'us-east-1' },
            });

            const template = Template.fromStack(stack);
            template.hasOutput('LoadBalancerArn', {
                Description: 'Application Load Balancer ARN',
            });
        });

        it('should create TargetGroupArn output', () => {
            const vpcStack = new cdk.Stack(app, 'VpcStack', {
                env: { account: '123456789012', region: 'us-east-1' },
            });
            mockVpc = new ec2.Vpc(vpcStack, 'MockVPC', { maxAzs: 2 });

            const stack = new HANodesStack(app, 'TestHANodesStack', {
                deploymentConfig,
                userDataScriptPath: testUserDataScriptPath,
                vpc: mockVpc,
                env: { account: '123456789012', region: 'us-east-1' },
            });

            const template = Template.fromStack(stack);
            template.hasOutput('TargetGroupArn', {
                Description: 'Target Group ARN',
            });
        });

        it('should create AutoScalingGroupName output', () => {
            const vpcStack = new cdk.Stack(app, 'VpcStack', {
                env: { account: '123456789012', region: 'us-east-1' },
            });
            mockVpc = new ec2.Vpc(vpcStack, 'MockVPC', { maxAzs: 2 });

            const stack = new HANodesStack(app, 'TestHANodesStack', {
                deploymentConfig,
                userDataScriptPath: testUserDataScriptPath,
                vpc: mockVpc,
                env: { account: '123456789012', region: 'us-east-1' },
            });

            const template = Template.fromStack(stack);
            template.hasOutput('AutoScalingGroupName', {
                Description: 'Auto Scaling Group Name',
            });
        });

        it('should create InstanceSecurityGroupId output', () => {
            const vpcStack = new cdk.Stack(app, 'VpcStack', {
                env: { account: '123456789012', region: 'us-east-1' },
            });
            mockVpc = new ec2.Vpc(vpcStack, 'MockVPC', { maxAzs: 2 });

            const stack = new HANodesStack(app, 'TestHANodesStack', {
                deploymentConfig,
                userDataScriptPath: testUserDataScriptPath,
                vpc: mockVpc,
                env: { account: '123456789012', region: 'us-east-1' },
            });

            const template = Template.fromStack(stack);
            template.hasOutput('InstanceSecurityGroupId', {
                Description: 'Instance Security Group ID',
            });
        });

        it('should create AlbSecurityGroupId output', () => {
            const vpcStack = new cdk.Stack(app, 'VpcStack', {
                env: { account: '123456789012', region: 'us-east-1' },
            });
            mockVpc = new ec2.Vpc(vpcStack, 'MockVPC', { maxAzs: 2 });

            const stack = new HANodesStack(app, 'TestHANodesStack', {
                deploymentConfig,
                userDataScriptPath: testUserDataScriptPath,
                vpc: mockVpc,
                env: { account: '123456789012', region: 'us-east-1' },
            });

            const template = Template.fromStack(stack);
            template.hasOutput('AlbSecurityGroupId', {
                Description: 'ALB Security Group ID',
            });
        });

        it('should create InstanceRoleArn output', () => {
            const vpcStack = new cdk.Stack(app, 'VpcStack', {
                env: { account: '123456789012', region: 'us-east-1' },
            });
            mockVpc = new ec2.Vpc(vpcStack, 'MockVPC', { maxAzs: 2 });

            const stack = new HANodesStack(app, 'TestHANodesStack', {
                deploymentConfig,
                userDataScriptPath: testUserDataScriptPath,
                vpc: mockVpc,
                env: { account: '123456789012', region: 'us-east-1' },
            });

            const template = Template.fromStack(stack);
            template.hasOutput('InstanceRoleArn', {
                Description: 'Instance IAM Role ARN',
            });
        });

        it('should create VpcId output', () => {
            const vpcStack = new cdk.Stack(app, 'VpcStack', {
                env: { account: '123456789012', region: 'us-east-1' },
            });
            mockVpc = new ec2.Vpc(vpcStack, 'MockVPC', { maxAzs: 2 });

            const stack = new HANodesStack(app, 'TestHANodesStack', {
                deploymentConfig,
                userDataScriptPath: testUserDataScriptPath,
                vpc: mockVpc,
                env: { account: '123456789012', region: 'us-east-1' },
            });

            const template = Template.fromStack(stack);
            template.hasOutput('VpcId', {
                Description: 'VPC ID where the nodes are deployed',
            });
        });

        it('should create LifecycleHookName output', () => {
            const vpcStack = new cdk.Stack(app, 'VpcStack', {
                env: { account: '123456789012', region: 'us-east-1' },
            });
            mockVpc = new ec2.Vpc(vpcStack, 'MockVPC', { maxAzs: 2 });

            const stack = new HANodesStack(app, 'TestHANodesStack', {
                deploymentConfig,
                userDataScriptPath: testUserDataScriptPath,
                vpc: mockVpc,
                env: { account: '123456789012', region: 'us-east-1' },
            });

            const template = Template.fromStack(stack);
            template.hasOutput('LifecycleHookName', {
                Description: 'ASG Lifecycle Hook Name',
            });
        });
    });

    describe('Auto Scaling Group Configuration', () => {
        it('should configure ASG with correct desired capacity from fixture', () => {
            const vpcStack = new cdk.Stack(app, 'VpcStack', {
                env: { account: '123456789012', region: 'us-east-1' },
            });
            mockVpc = new ec2.Vpc(vpcStack, 'MockVPC', { maxAzs: 2 });

            const stack = new HANodesStack(app, 'TestHANodesStack', {
                deploymentConfig,
                userDataScriptPath: testUserDataScriptPath,
                vpc: mockVpc,
                env: { account: '123456789012', region: 'us-east-1' },
            });

            const template = Template.fromStack(stack);

            // From ha-nodes.env: HA_NUMBER_OF_NODES="3"
            template.hasResourceProperties('AWS::AutoScaling::AutoScalingGroup', {
                DesiredCapacity: '3',
                MaxSize: '6', // 2x desired capacity
            });
        });

        it('should configure launch template with correct instance type from fixture', () => {
            const vpcStack = new cdk.Stack(app, 'VpcStack', {
                env: { account: '123456789012', region: 'us-east-1' },
            });
            mockVpc = new ec2.Vpc(vpcStack, 'MockVPC', { maxAzs: 2 });

            const stack = new HANodesStack(app, 'TestHANodesStack', {
                deploymentConfig,
                userDataScriptPath: testUserDataScriptPath,
                vpc: mockVpc,
                env: { account: '123456789012', region: 'us-east-1' },
            });

            const template = Template.fromStack(stack);

            // From ha-nodes.env: INSTANCE_TYPE="t3.large"
            template.hasResourceProperties('AWS::EC2::LaunchTemplate', {
                LaunchTemplateData: Match.objectLike({
                    InstanceType: 't3.large',
                }),
            });
        });

        it('should enable detailed monitoring in launch template', () => {
            const vpcStack = new cdk.Stack(app, 'VpcStack', {
                env: { account: '123456789012', region: 'us-east-1' },
            });
            mockVpc = new ec2.Vpc(vpcStack, 'MockVPC', { maxAzs: 2 });

            const stack = new HANodesStack(app, 'TestHANodesStack', {
                deploymentConfig,
                userDataScriptPath: testUserDataScriptPath,
                vpc: mockVpc,
                env: { account: '123456789012', region: 'us-east-1' },
            });

            const template = Template.fromStack(stack);
            template.hasResourceProperties('AWS::EC2::LaunchTemplate', {
                LaunchTemplateData: Match.objectLike({
                    Monitoring: Match.objectLike({
                        Enabled: true,
                    }),
                }),
            });
        });
    });

    describe('Load Balancer Configuration', () => {
        it('should configure target group with correct health check port from fixture', () => {
            const vpcStack = new cdk.Stack(app, 'VpcStack', {
                env: { account: '123456789012', region: 'us-east-1' },
            });
            mockVpc = new ec2.Vpc(vpcStack, 'MockVPC', { maxAzs: 2 });

            const stack = new HANodesStack(app, 'TestHANodesStack', {
                deploymentConfig,
                userDataScriptPath: testUserDataScriptPath,
                vpc: mockVpc,
                env: { account: '123456789012', region: 'us-east-1' },
            });

            const template = Template.fromStack(stack);

            // From ha-nodes.env: HA_ALB_HEALTHCHECK_PORT="8545"
            template.hasResourceProperties('AWS::ElasticLoadBalancingV2::TargetGroup', {
                Port: 8545,
                Protocol: 'HTTP',
            });
        });

        it('should configure listener on correct port', () => {
            const vpcStack = new cdk.Stack(app, 'VpcStack', {
                env: { account: '123456789012', region: 'us-east-1' },
            });
            mockVpc = new ec2.Vpc(vpcStack, 'MockVPC', { maxAzs: 2 });

            const stack = new HANodesStack(app, 'TestHANodesStack', {
                deploymentConfig,
                userDataScriptPath: testUserDataScriptPath,
                vpc: mockVpc,
                env: { account: '123456789012', region: 'us-east-1' },
            });

            const template = Template.fromStack(stack);

            // From ha-nodes.env: HA_ALB_HEALTHCHECK_PORT="8545"
            template.hasResourceProperties('AWS::ElasticLoadBalancingV2::Listener', {
                Port: 8545,
                Protocol: 'HTTP',
            });
        });

        it('should configure ALB as internal by default', () => {
            const vpcStack = new cdk.Stack(app, 'VpcStack', {
                env: { account: '123456789012', region: 'us-east-1' },
            });
            mockVpc = new ec2.Vpc(vpcStack, 'MockVPC', { maxAzs: 2 });

            const stack = new HANodesStack(app, 'TestHANodesStack', {
                deploymentConfig,
                userDataScriptPath: testUserDataScriptPath,
                vpc: mockVpc,
                env: { account: '123456789012', region: 'us-east-1' },
            });

            const template = Template.fromStack(stack);
            template.hasResourceProperties('AWS::ElasticLoadBalancingV2::LoadBalancer', {
                Scheme: 'internal',
            });
        });
    });

    describe('Storage Configuration', () => {
        it('should configure root volume with encryption in launch template', () => {
            const vpcStack = new cdk.Stack(app, 'VpcStack', {
                env: { account: '123456789012', region: 'us-east-1' },
            });
            mockVpc = new ec2.Vpc(vpcStack, 'MockVPC', { maxAzs: 2 });

            const stack = new HANodesStack(app, 'TestHANodesStack', {
                deploymentConfig,
                userDataScriptPath: testUserDataScriptPath,
                vpc: mockVpc,
                env: { account: '123456789012', region: 'us-east-1' },
            });

            const template = Template.fromStack(stack);
            template.hasResourceProperties('AWS::EC2::LaunchTemplate', {
                LaunchTemplateData: Match.objectLike({
                    BlockDeviceMappings: Match.arrayWith([
                        Match.objectLike({
                            DeviceName: '/dev/sda1',
                            Ebs: Match.objectLike({
                                Encrypted: true,
                                VolumeType: 'gp3',
                            }),
                        }),
                    ]),
                }),
            });
        });
    });

    describe('Public Properties', () => {
        it('should expose haNodes construct', () => {
            const vpcStack = new cdk.Stack(app, 'VpcStack', {
                env: { account: '123456789012', region: 'us-east-1' },
            });
            mockVpc = new ec2.Vpc(vpcStack, 'MockVPC', { maxAzs: 2 });

            const stack = new HANodesStack(app, 'TestHANodesStack', {
                deploymentConfig,
                userDataScriptPath: testUserDataScriptPath,
                vpc: mockVpc,
                env: { account: '123456789012', region: 'us-east-1' },
            });

            expect(stack.haNodes).toBeDefined();
            expect(stack.haNodes.alb).toBeDefined();
            expect(stack.haNodes.targetGroup).toBeDefined();
            expect(stack.haNodes.autoScalingGroup).toBeDefined();
            expect(stack.haNodes.instanceSecurityGroup).toBeDefined();
            expect(stack.haNodes.albSecurityGroup).toBeDefined();
            expect(stack.haNodes.instanceRole).toBeDefined();
        });

        it('should expose vpc', () => {
            const vpcStack = new cdk.Stack(app, 'VpcStack', {
                env: { account: '123456789012', region: 'us-east-1' },
            });
            mockVpc = new ec2.Vpc(vpcStack, 'MockVPC', { maxAzs: 2 });

            const stack = new HANodesStack(app, 'TestHANodesStack', {
                deploymentConfig,
                userDataScriptPath: testUserDataScriptPath,
                vpc: mockVpc,
                env: { account: '123456789012', region: 'us-east-1' },
            });

            expect(stack.vpc).toBeDefined();
            expect(stack.vpc).toBe(mockVpc);
        });
    });

    describe('Static Methods', () => {
        it('should generate correct stack name with network', () => {
            const stackName = HANodesStack.generateStackName('ethereum', 'mainnet');
            expect(stackName).toBe('ethereum-mainnet-ha-nodes');
        });

        it('should generate correct stack name without network', () => {
            const stackName = HANodesStack.generateStackName('solana');
            expect(stackName).toBe('solana-ha-nodes');
        });
    });

});
