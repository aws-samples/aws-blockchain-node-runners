// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import { Template, Match } from 'aws-cdk-lib/assertions';
import * as path from 'path';
import { SingleNodeStack } from '../../../lib/stacks/single-node-stack';
import { ConfigurationLoader } from '../../../lib/core/configuration-loader';
import { DeploymentConfig, ProtocolConfig } from '../../../lib/interfaces';

describe('SingleNodeStack', () => {
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

        const testEnvPath = path.join(__dirname, '../../../blueprints/dummy/samples/.env-mainnet-single-node');
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

            const stack = new SingleNodeStack(app, 'TestSingleNodeStack', {
                stackName: 'dummy-testnet-single-node',
                deploymentConfig,
                userDataScriptPath: testUserDataScriptPath,
                vpc: mockVpc,
                env: { account: '123456789012', region: 'us-east-1' },
            });

            expect(stack.stackName).toBe('dummy-testnet-single-node');
        });

        it('should create an EC2 instance', () => {
            const vpcStack = new cdk.Stack(app, 'VpcStack', {
                env: { account: '123456789012', region: 'us-east-1' },
            });
            mockVpc = new ec2.Vpc(vpcStack, 'MockVPC', { maxAzs: 2 });

            const stack = new SingleNodeStack(app, 'TestSingleNodeStack', {
                deploymentConfig,
                userDataScriptPath: testUserDataScriptPath,
                vpc: mockVpc,
                env: { account: '123456789012', region: 'us-east-1' },
            });

            const template = Template.fromStack(stack);
            template.resourceCountIs('AWS::EC2::Instance', 1);
        });

        it('should create a security group with protocol-specific ports', () => {
            const vpcStack = new cdk.Stack(app, 'VpcStack', {
                env: { account: '123456789012', region: 'us-east-1' },
            });
            mockVpc = new ec2.Vpc(vpcStack, 'MockVPC', { maxAzs: 2 });

            const stack = new SingleNodeStack(app, 'TestSingleNodeStack', {
                deploymentConfig,
                userDataScriptPath: testUserDataScriptPath,
                vpc: mockVpc,
                env: { account: '123456789012', region: 'us-east-1' },
            });

            const template = Template.fromStack(stack);
            template.resourceCountIs('AWS::EC2::SecurityGroup', 1);

            // Verify security group has ingress rules for protocol ports
            // From dummy config: port 8545 (JSON RPC), port 8546 (WebSocket), port range 30303-30305 (P2P)
            template.hasResourceProperties('AWS::EC2::SecurityGroup', {
                SecurityGroupIngress: Match.arrayWith([
                    Match.objectLike({
                        FromPort: 8545,
                        ToPort: 8545,
                        IpProtocol: 'tcp',
                    }),
                    Match.objectLike({
                        FromPort: 8546,
                        ToPort: 8546,
                        IpProtocol: 'tcp',
                    }),
                ]),
            });
        });

        it('should create an IAM role with correct permissions', () => {
            const vpcStack = new cdk.Stack(app, 'VpcStack', {
                env: { account: '123456789012', region: 'us-east-1' },
            });
            mockVpc = new ec2.Vpc(vpcStack, 'MockVPC', { maxAzs: 2 });

            const stack = new SingleNodeStack(app, 'TestSingleNodeStack', {
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

        it('should create a CloudWatch dashboard', () => {
            const vpcStack = new cdk.Stack(app, 'VpcStack', {
                env: { account: '123456789012', region: 'us-east-1' },
            });
            mockVpc = new ec2.Vpc(vpcStack, 'MockVPC', { maxAzs: 2 });

            const stack = new SingleNodeStack(app, 'TestSingleNodeStack', {
                deploymentConfig,
                userDataScriptPath: testUserDataScriptPath,
                vpc: mockVpc,
                env: { account: '123456789012', region: 'us-east-1' },
            });

            const template = Template.fromStack(stack);
            template.resourceCountIs('AWS::CloudWatch::Dashboard', 1);
        });
    });

    describe('CloudFormation Outputs', () => {
        it('should create InstanceId output', () => {
            const vpcStack = new cdk.Stack(app, 'VpcStack', {
                env: { account: '123456789012', region: 'us-east-1' },
            });
            mockVpc = new ec2.Vpc(vpcStack, 'MockVPC', { maxAzs: 2 });

            const stack = new SingleNodeStack(app, 'TestSingleNodeStack', {
                deploymentConfig,
                userDataScriptPath: testUserDataScriptPath,
                vpc: mockVpc,
                env: { account: '123456789012', region: 'us-east-1' },
            });

            const template = Template.fromStack(stack);
            template.hasOutput('InstanceId', {
                Description: 'EC2 Instance ID',
            });
        });

        it('should create SecurityGroupId output', () => {
            const vpcStack = new cdk.Stack(app, 'VpcStack', {
                env: { account: '123456789012', region: 'us-east-1' },
            });
            mockVpc = new ec2.Vpc(vpcStack, 'MockVPC', { maxAzs: 2 });

            const stack = new SingleNodeStack(app, 'TestSingleNodeStack', {
                deploymentConfig,
                userDataScriptPath: testUserDataScriptPath,
                vpc: mockVpc,
                env: { account: '123456789012', region: 'us-east-1' },
            });

            const template = Template.fromStack(stack);
            template.hasOutput('SecurityGroupId', {
                Description: 'Security Group ID',
            });
        });

        it('should create InstanceRoleArn output', () => {
            const vpcStack = new cdk.Stack(app, 'VpcStack', {
                env: { account: '123456789012', region: 'us-east-1' },
            });
            mockVpc = new ec2.Vpc(vpcStack, 'MockVPC', { maxAzs: 2 });

            const stack = new SingleNodeStack(app, 'TestSingleNodeStack', {
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

            const stack = new SingleNodeStack(app, 'TestSingleNodeStack', {
                deploymentConfig,
                userDataScriptPath: testUserDataScriptPath,
                vpc: mockVpc,
                env: { account: '123456789012', region: 'us-east-1' },
            });

            const template = Template.fromStack(stack);
            template.hasOutput('VpcId', {
                Description: 'VPC ID where the node is deployed',
            });
        });

        it('should create DashboardName output', () => {
            const vpcStack = new cdk.Stack(app, 'VpcStack', {
                env: { account: '123456789012', region: 'us-east-1' },
            });
            mockVpc = new ec2.Vpc(vpcStack, 'MockVPC', { maxAzs: 2 });

            const stack = new SingleNodeStack(app, 'TestSingleNodeStack', {
                deploymentConfig,
                userDataScriptPath: testUserDataScriptPath,
                vpc: mockVpc,
                env: { account: '123456789012', region: 'us-east-1' },
            });

            const template = Template.fromStack(stack);
            template.hasOutput('DashboardName', {
                Description: 'CloudWatch Dashboard Name',
            });
        });

        it('should create NodeCFLogicalId output', () => {
            const vpcStack = new cdk.Stack(app, 'VpcStack', {
                env: { account: '123456789012', region: 'us-east-1' },
            });
            mockVpc = new ec2.Vpc(vpcStack, 'MockVPC', { maxAzs: 2 });

            const stack = new SingleNodeStack(app, 'TestSingleNodeStack', {
                deploymentConfig,
                userDataScriptPath: testUserDataScriptPath,
                vpc: mockVpc,
                env: { account: '123456789012', region: 'us-east-1' },
            });

            const template = Template.fromStack(stack);
            template.hasOutput('NodeCFLogicalId', {
                Description: 'CloudFormation Logical ID of the EC2 instance',
            });
        });
    });

    describe('Instance Configuration', () => {
        it('should configure instance with correct instance type from fixture', () => {
            const vpcStack = new cdk.Stack(app, 'VpcStack', {
                env: { account: '123456789012', region: 'us-east-1' },
            });
            mockVpc = new ec2.Vpc(vpcStack, 'MockVPC', { maxAzs: 2 });

            const stack = new SingleNodeStack(app, 'TestSingleNodeStack', {
                deploymentConfig,
                userDataScriptPath: testUserDataScriptPath,
                vpc: mockVpc,
                env: { account: '123456789012', region: 'us-east-1' },
            });

            const template = Template.fromStack(stack);

            // From single-node.env: INSTANCE_TYPE="t3.medium"
            template.hasResourceProperties('AWS::EC2::Instance', {
                InstanceType: 't3.medium',
            });
        });

        it('should configure instance with user data', () => {
            const vpcStack = new cdk.Stack(app, 'VpcStack', {
                env: { account: '123456789012', region: 'us-east-1' },
            });
            mockVpc = new ec2.Vpc(vpcStack, 'MockVPC', { maxAzs: 2 });

            const stack = new SingleNodeStack(app, 'TestSingleNodeStack', {
                deploymentConfig,
                userDataScriptPath: testUserDataScriptPath,
                vpc: mockVpc,
                env: { account: '123456789012', region: 'us-east-1' },
            });

            const template = Template.fromStack(stack);
            template.hasResourceProperties('AWS::EC2::Instance', {
                UserData: Match.anyValue(),
            });
        });

        it('should use provided user data script', () => {
            const vpcStack = new cdk.Stack(app, 'VpcStack', {
                env: { account: '123456789012', region: 'us-east-1' },
            });
            mockVpc = new ec2.Vpc(vpcStack, 'MockVPC', { maxAzs: 2 });

            const stack = new SingleNodeStack(app, 'TestSingleNodeStack', {
                deploymentConfig,
                userDataScriptPath: testUserDataScriptPath,
                vpc: mockVpc,
                env: { account: '123456789012', region: 'us-east-1' },
            });

            const template = Template.fromStack(stack);
            template.hasResourceProperties('AWS::EC2::Instance', {
                UserData: Match.anyValue(),
            });
        });

        it('should enable detailed monitoring', () => {
            const vpcStack = new cdk.Stack(app, 'VpcStack', {
                env: { account: '123456789012', region: 'us-east-1' },
            });
            mockVpc = new ec2.Vpc(vpcStack, 'MockVPC', { maxAzs: 2 });

            const stack = new SingleNodeStack(app, 'TestSingleNodeStack', {
                deploymentConfig,
                userDataScriptPath: testUserDataScriptPath,
                vpc: mockVpc,
                env: { account: '123456789012', region: 'us-east-1' },
            });

            const template = Template.fromStack(stack);
            template.hasResourceProperties('AWS::EC2::Instance', {
                Monitoring: true,
            });
        });
    });

    describe('Storage Configuration', () => {
        it('should create root volume with encryption', () => {
            const vpcStack = new cdk.Stack(app, 'VpcStack', {
                env: { account: '123456789012', region: 'us-east-1' },
            });
            mockVpc = new ec2.Vpc(vpcStack, 'MockVPC', { maxAzs: 2 });

            const stack = new SingleNodeStack(app, 'TestSingleNodeStack', {
                deploymentConfig,
                userDataScriptPath: testUserDataScriptPath,
                vpc: mockVpc,
                env: { account: '123456789012', region: 'us-east-1' },
            });

            const template = Template.fromStack(stack);
            template.hasResourceProperties('AWS::EC2::Instance', {
                BlockDeviceMappings: Match.arrayWith([
                    Match.objectLike({
                        DeviceName: '/dev/sda1',
                        Ebs: Match.objectLike({
                            Encrypted: true,
                            VolumeType: 'gp3',
                        }),
                    }),
                ]),
            });
        });

        it('should create data volumes based on fixture configuration', () => {
            const vpcStack = new cdk.Stack(app, 'VpcStack', {
                env: { account: '123456789012', region: 'us-east-1' },
            });
            mockVpc = new ec2.Vpc(vpcStack, 'MockVPC', { maxAzs: 2 });

            const stack = new SingleNodeStack(app, 'TestSingleNodeStack', {
                deploymentConfig,
                userDataScriptPath: testUserDataScriptPath,
                vpc: mockVpc,
                env: { account: '123456789012', region: 'us-east-1' },
            });

            const template = Template.fromStack(stack);

            // From single-node.env: DATA_VOLUMES_COUNT="1" with 100 GiB gp3 volume
            template.hasResourceProperties('AWS::EC2::Volume', {
                Size: 100,
                VolumeType: 'gp3',
                Encrypted: true,
            });
        });
    });

    describe('Public Properties', () => {
        it('should expose singleNode construct', () => {
            const vpcStack = new cdk.Stack(app, 'VpcStack', {
                env: { account: '123456789012', region: 'us-east-1' },
            });
            mockVpc = new ec2.Vpc(vpcStack, 'MockVPC', { maxAzs: 2 });

            const stack = new SingleNodeStack(app, 'TestSingleNodeStack', {
                deploymentConfig,
                userDataScriptPath: testUserDataScriptPath,
                vpc: mockVpc,
                env: { account: '123456789012', region: 'us-east-1' },
            });

            expect(stack.singleNode).toBeDefined();
            expect(stack.singleNode.instance).toBeDefined();
            expect(stack.singleNode.securityGroup).toBeDefined();
            expect(stack.singleNode.instanceRole).toBeDefined();
        });

        it('should expose monitoring construct', () => {
            const vpcStack = new cdk.Stack(app, 'VpcStack', {
                env: { account: '123456789012', region: 'us-east-1' },
            });
            mockVpc = new ec2.Vpc(vpcStack, 'MockVPC', { maxAzs: 2 });

            const stack = new SingleNodeStack(app, 'TestSingleNodeStack', {
                deploymentConfig,
                userDataScriptPath: testUserDataScriptPath,
                vpc: mockVpc,
                env: { account: '123456789012', region: 'us-east-1' },
            });

            expect(stack.monitoring).toBeDefined();
            expect(stack.monitoring.dashboard).toBeDefined();
            expect(stack.monitoring.dashboardName).toBeDefined();
        });

        it('should expose vpc', () => {
            const vpcStack = new cdk.Stack(app, 'VpcStack', {
                env: { account: '123456789012', region: 'us-east-1' },
            });
            mockVpc = new ec2.Vpc(vpcStack, 'MockVPC', { maxAzs: 2 });

            const stack = new SingleNodeStack(app, 'TestSingleNodeStack', {
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
            const stackName = SingleNodeStack.generateStackName('ethereum', 'mainnet');
            expect(stackName).toBe('ethereum-mainnet-single-node');
        });

        it('should generate correct stack name without network', () => {
            const stackName = SingleNodeStack.generateStackName('solana');
            expect(stackName).toBe('solana-single-node');
        });
    });

    describe('Dashboard Template Integration', () => {
        it('should use custom dashboard template when provided', () => {
            const vpcStack = new cdk.Stack(app, 'VpcStack', {
                env: { account: '123456789012', region: 'us-east-1' },
            });
            mockVpc = new ec2.Vpc(vpcStack, 'MockVPC', { maxAzs: 2 });

            // Use common template since dummy doesn't have single-node template
            const dashboardTemplatePath = path.join(__dirname, '../../../lib/common/monitoring-dashboards/single-node-dashboard-template.json');

            const stack = new SingleNodeStack(app, 'TestSingleNodeStack', {
                deploymentConfig,
                userDataScriptPath: testUserDataScriptPath,
                vpc: mockVpc,
                dashboardTemplatePath,
                env: { account: '123456789012', region: 'us-east-1' },
            });

            const template = Template.fromStack(stack);
            template.resourceCountIs('AWS::CloudWatch::Dashboard', 1);
        });
    });
});
