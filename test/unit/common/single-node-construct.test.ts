// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import { Template, Match } from 'aws-cdk-lib/assertions';
import * as path from 'path';
import { SingleNodeConstruct } from '../../../lib/common/single-node-construct';
import { ConfigurationLoader } from '../../../lib/core/configuration-loader';
import { DeploymentConfig, ProtocolConfig, DeploymentMode } from '../../../lib/interfaces';

describe('SingleNodeConstruct', () => {
    let app: cdk.App;
    let stack: cdk.Stack;
    let configLoader: ConfigurationLoader;
    let protocolConfig: ProtocolConfig;
    let deploymentConfig: DeploymentConfig;
    let mockVpc: ec2.IVpc;
    let testUserDataScriptPath: string;

    beforeEach(() => {
        app = new cdk.App();

        // Create a stack with explicit environment for VPC lookup
        stack = new cdk.Stack(app, 'TestStack', {
            env: {
                account: '123456789012',
                region: 'us-east-1',
            },
        });

        // Create a mock VPC for testing
        mockVpc = new ec2.Vpc(stack, 'MockVPC', {
            maxAzs: 2,
        });

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

    describe('EC2 Instance Creation', () => {
        it('should create an EC2 instance with correct instance type', () => {
            new SingleNodeConstruct(stack, 'TestNode', {
                protocolConfig,
                deploymentConfig,
                userDataScriptPath: testUserDataScriptPath,
                vpc: mockVpc,
            });

            const template = Template.fromStack(stack);

            template.hasResourceProperties('AWS::EC2::Instance', {
                InstanceType: 't3.medium', // From single-node.env fixture
            });
        });

        it('should create an EC2 instance with detailed monitoring enabled', () => {
            new SingleNodeConstruct(stack, 'TestNode', {
                protocolConfig,
                deploymentConfig,
                userDataScriptPath: testUserDataScriptPath,
                vpc: mockVpc,
            });

            const template = Template.fromStack(stack);

            template.hasResourceProperties('AWS::EC2::Instance', {
                Monitoring: true,
            });
        });

        it('should create an EC2 instance with encrypted root volume', () => {
            new SingleNodeConstruct(stack, 'TestNode', {
                protocolConfig,
                deploymentConfig,
                userDataScriptPath: testUserDataScriptPath,
                vpc: mockVpc,
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

        it('should inject user data script into the instance', () => {
            new SingleNodeConstruct(stack, 'TestNode', {
                protocolConfig,
                deploymentConfig,
                userDataScriptPath: testUserDataScriptPath,
                vpc: mockVpc,
            });

            const template = Template.fromStack(stack);

            template.hasResourceProperties('AWS::EC2::Instance', {
                UserData: Match.anyValue(),
            });
        });
    });

    describe('Security Group Creation', () => {
        it('should create a security group', () => {
            new SingleNodeConstruct(stack, 'TestNode', {
                protocolConfig,
                deploymentConfig,
                userDataScriptPath: testUserDataScriptPath,
                vpc: mockVpc,
            });

            const template = Template.fromStack(stack);

            // Should have 1 security group for the node
            template.resourceCountIs('AWS::EC2::SecurityGroup', 1);
        });

        it('should create security group with correct description', () => {
            new SingleNodeConstruct(stack, 'TestNode', {
                protocolConfig,
                deploymentConfig,
                userDataScriptPath: testUserDataScriptPath,
                vpc: mockVpc,
            });

            const template = Template.fromStack(stack);

            template.hasResourceProperties('AWS::EC2::SecurityGroup', {
                GroupDescription: 'Security Group for dummy blockchain node',
            });
        });

        it('should add ingress rules for protocol required ports', () => {
            new SingleNodeConstruct(stack, 'TestNode', {
                protocolConfig,
                deploymentConfig,
                userDataScriptPath: testUserDataScriptPath,
                vpc: mockVpc,
            });

            const template = Template.fromStack(stack);

            // CDK embeds security group rules in the SecurityGroupIngress property
            // Check for JSON RPC port (8545) and WebSocket port (8546) from dummy protocol config
            template.hasResourceProperties('AWS::EC2::SecurityGroup', {
                SecurityGroupIngress: Match.arrayWith([
                    Match.objectLike({
                        IpProtocol: 'tcp',
                        FromPort: 8545,
                        ToPort: 8545,
                    }),
                    Match.objectLike({
                        IpProtocol: 'tcp',
                        FromPort: 8546,
                        ToPort: 8546,
                    }),
                ]),
            });
        });

        it('should add ingress rules for port ranges', () => {
            new SingleNodeConstruct(stack, 'TestNode', {
                protocolConfig,
                deploymentConfig,
                userDataScriptPath: testUserDataScriptPath,
                vpc: mockVpc,
            });

            const template = Template.fromStack(stack);

            // Check for P2P port range (30303-30305) from dummy protocol config
            template.hasResourceProperties('AWS::EC2::SecurityGroup', {
                SecurityGroupIngress: Match.arrayWith([
                    Match.objectLike({
                        IpProtocol: 'tcp',
                        FromPort: 30303,
                        ToPort: 30305,
                    }),
                ]),
            });
        });

        it('should add egress rules for outbound traffic', () => {
            new SingleNodeConstruct(stack, 'TestNode', {
                protocolConfig,
                deploymentConfig,
                userDataScriptPath: testUserDataScriptPath,
                vpc: mockVpc,
            });

            const template = Template.fromStack(stack);

            // CDK embeds security group rules in the SecurityGroupEgress property
            // Check for TCP and UDP egress rules
            template.hasResourceProperties('AWS::EC2::SecurityGroup', {
                SecurityGroupEgress: Match.arrayWith([
                    Match.objectLike({
                        IpProtocol: 'tcp',
                    }),
                    Match.objectLike({
                        IpProtocol: 'udp',
                    }),
                ]),
            });
        });
    });

    describe('IAM Role Creation', () => {
        it('should create an IAM role for the instance', () => {
            new SingleNodeConstruct(stack, 'TestNode', {
                protocolConfig,
                deploymentConfig,
                userDataScriptPath: testUserDataScriptPath,
                vpc: mockVpc,
            });

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

        it('should attach SSM managed policy to the role', () => {
            new SingleNodeConstruct(stack, 'TestNode', {
                protocolConfig,
                deploymentConfig,
                userDataScriptPath: testUserDataScriptPath,
                vpc: mockVpc,
            });

            const template = Template.fromStack(stack);

            template.hasResourceProperties('AWS::IAM::Role', {
                ManagedPolicyArns: Match.arrayWith([
                    Match.objectLike({
                        'Fn::Join': Match.arrayWith([
                            Match.arrayWith([
                                Match.stringLikeRegexp('AmazonSSMManagedInstanceCore'),
                            ]),
                        ]),
                    }),
                ]),
            });
        });

        it('should attach CloudWatch managed policy to the role', () => {
            new SingleNodeConstruct(stack, 'TestNode', {
                protocolConfig,
                deploymentConfig,
                userDataScriptPath: testUserDataScriptPath,
                vpc: mockVpc,
            });

            const template = Template.fromStack(stack);

            template.hasResourceProperties('AWS::IAM::Role', {
                ManagedPolicyArns: Match.arrayWith([
                    Match.objectLike({
                        'Fn::Join': Match.arrayWith([
                            Match.arrayWith([
                                Match.stringLikeRegexp('CloudWatchAgentServerPolicy'),
                            ]),
                        ]),
                    }),
                ]),
            });
        });

        it('should grant scoped S3 read access to the asset bucket (not *)', () => {
            new SingleNodeConstruct(stack, 'TestNode', {
                protocolConfig,
                deploymentConfig,
                userDataScriptPath: testUserDataScriptPath,
                vpc: mockVpc,
            });

            const template = Template.fromStack(stack);

            // Asset.grantRead() produces s3:GetObject*/GetBucket*/List* scoped to
            // the CDK assets bucket and object keys.
            template.hasResourceProperties('AWS::IAM::Policy', {
                PolicyDocument: Match.objectLike({
                    Statement: Match.arrayWith([
                        Match.objectLike({
                            Action: Match.arrayWith(['s3:GetObject*']),
                            Effect: 'Allow',
                        }),
                    ]),
                }),
            });

            // No S3 statement may use a wildcard resource.
            const policies = template.findResources('AWS::IAM::Policy');
            for (const policy of Object.values(policies)) {
                const statements = policy.Properties.PolicyDocument.Statement as any[];
                for (const statement of statements) {
                    const actions = Array.isArray(statement.Action) ? statement.Action : [statement.Action];
                    const touchesS3 = actions.some((a: string) => typeof a === 'string' && a.startsWith('s3:'));
                    if (touchesS3) {
                        const resources = Array.isArray(statement.Resource) ? statement.Resource : [statement.Resource];
                        expect(resources).not.toContain('*');
                    }
                }
            }
        });

        it('should scope CloudFormation signal permissions to this stack (not *)', () => {
            new SingleNodeConstruct(stack, 'TestNode', {
                protocolConfig,
                deploymentConfig,
                userDataScriptPath: testUserDataScriptPath,
                vpc: mockVpc,
            });

            const template = Template.fromStack(stack);

            template.hasResourceProperties('AWS::IAM::Policy', {
                PolicyDocument: Match.objectLike({
                    Statement: Match.arrayWith([
                        Match.objectLike({
                            Action: Match.arrayWith([
                                'cloudformation:SignalResource',
                                'cloudformation:DescribeStackResource',
                            ]),
                            Effect: 'Allow',
                            Resource: 'arn:aws:cloudformation:us-east-1:123456789012:stack/TestStack/*',
                        }),
                    ]),
                }),
            });

            // No cloudformation statement may use a wildcard resource.
            const policies = template.findResources('AWS::IAM::Policy');
            for (const policy of Object.values(policies)) {
                const statements = policy.Properties.PolicyDocument.Statement as any[];
                for (const statement of statements) {
                    const actions = Array.isArray(statement.Action) ? statement.Action : [statement.Action];
                    const touchesCfn = actions.some((a: string) => typeof a === 'string' && a.startsWith('cloudformation:'));
                    if (touchesCfn) {
                        const resources = Array.isArray(statement.Resource) ? statement.Resource : [statement.Resource];
                        expect(resources).not.toContain('*');
                    }
                }
            }
        });

        it('should scope Secrets Manager permissions to the stack\'s own secrets (not *)', () => {
            new SingleNodeConstruct(stack, 'TestNode', {
                protocolConfig,
                deploymentConfig,
                userDataScriptPath: testUserDataScriptPath,
                vpc: mockVpc,
            });

            const template = Template.fromStack(stack);

            // Secrets Manager read/write must be scoped to this stack's secret
            // name prefix, never "*". stackName is "TestStack" in this fixture.
            template.hasResourceProperties('AWS::IAM::Policy', {
                PolicyDocument: Match.objectLike({
                    Statement: Match.arrayWith([
                        Match.objectLike({
                            Action: Match.arrayWith([
                                'secretsmanager:GetSecretValue',
                                'secretsmanager:DescribeSecret',
                                'secretsmanager:CreateSecret',
                                'secretsmanager:PutSecretValue',
                            ]),
                            Effect: 'Allow',
                            Resource: [
                                'arn:aws:secretsmanager:us-east-1:123456789012:secret:TestStack/*',
                                'arn:aws:secretsmanager:us-east-1:123456789012:secret:TestStack-*',
                            ],
                        }),
                    ]),
                }),
            });
        });

        it('should not grant Secrets Manager access on a wildcard resource', () => {
            new SingleNodeConstruct(stack, 'TestNode', {
                protocolConfig,
                deploymentConfig,
                userDataScriptPath: testUserDataScriptPath,
                vpc: mockVpc,
            });

            const template = Template.fromStack(stack);
            const policies = template.findResources('AWS::IAM::Policy');

            for (const policy of Object.values(policies)) {
                const statements = policy.Properties.PolicyDocument.Statement as any[];
                for (const statement of statements) {
                    const actions = Array.isArray(statement.Action) ? statement.Action : [statement.Action];
                    const touchesSecrets = actions.some(
                        (a: string) => typeof a === 'string' && a.startsWith('secretsmanager:')
                    );
                    if (touchesSecrets) {
                        const resources = Array.isArray(statement.Resource) ? statement.Resource : [statement.Resource];
                        expect(resources).not.toContain('*');
                    }
                }
            }
        });

        it('should grant read-only access to an externally-provided secret ARN', () => {
            // Operators can point a node at a pre-existing secret (e.g. a Solana
            // validator identity keypair) via a *_SECRET_ARN custom variable.
            const externalArn = 'arn:aws:secretsmanager:us-east-1:123456789012:secret:my-node-identity-AbCdEf';
            deploymentConfig.environment.CUSTOM_VARIABLES = {
                ...deploymentConfig.environment.CUSTOM_VARIABLES,
                SOLANA_NODE_IDENTITY_SECRET_ARN: externalArn,
            };

            new SingleNodeConstruct(stack, 'TestNode', {
                protocolConfig,
                deploymentConfig,
                userDataScriptPath: testUserDataScriptPath,
                vpc: mockVpc,
            });

            const template = Template.fromStack(stack);

            template.hasResourceProperties('AWS::IAM::Policy', {
                PolicyDocument: Match.objectLike({
                    Statement: Match.arrayWith([
                        Match.objectLike({
                            Action: [
                                'secretsmanager:GetSecretValue',
                                'secretsmanager:DescribeSecret',
                            ],
                            Effect: 'Allow',
                            Resource: externalArn,
                        }),
                    ]),
                }),
            });
        });
    });

    describe('EBS Volume Creation', () => {
        it('should create data volumes based on configuration', () => {
            new SingleNodeConstruct(stack, 'TestNode', {
                protocolConfig,
                deploymentConfig,
                userDataScriptPath: testUserDataScriptPath,
                vpc: mockVpc,
            });

            const template = Template.fromStack(stack);

            // Single-node.env has 1 data volume
            template.resourceCountIs('AWS::EC2::Volume', 1);
        });

        it('should create encrypted data volumes', () => {
            new SingleNodeConstruct(stack, 'TestNode', {
                protocolConfig,
                deploymentConfig,
                userDataScriptPath: testUserDataScriptPath,
                vpc: mockVpc,
            });

            const template = Template.fromStack(stack);

            template.hasResourceProperties('AWS::EC2::Volume', {
                Encrypted: true,
            });
        });

        it('should create data volume with correct size', () => {
            new SingleNodeConstruct(stack, 'TestNode', {
                protocolConfig,
                deploymentConfig,
                userDataScriptPath: testUserDataScriptPath,
                vpc: mockVpc,
            });

            const template = Template.fromStack(stack);

            // From single-node.env: DATA_VOL_1_SIZE="100"
            template.hasResourceProperties('AWS::EC2::Volume', {
                Size: 100,
            });
        });

        it('should create data volume with correct IOPS', () => {
            new SingleNodeConstruct(stack, 'TestNode', {
                protocolConfig,
                deploymentConfig,
                userDataScriptPath: testUserDataScriptPath,
                vpc: mockVpc,
            });

            const template = Template.fromStack(stack);

            // From single-node.env: DATA_VOL_1_IOPS="3000"
            template.hasResourceProperties('AWS::EC2::Volume', {
                Iops: 3000,
            });
        });

        it('should create data volume with correct throughput for gp3', () => {
            new SingleNodeConstruct(stack, 'TestNode', {
                protocolConfig,
                deploymentConfig,
                userDataScriptPath: testUserDataScriptPath,
                vpc: mockVpc,
            });

            const template = Template.fromStack(stack);

            // From single-node.env: DATA_VOL_1_THROUGHPUT="125"
            template.hasResourceProperties('AWS::EC2::Volume', {
                Throughput: 125,
            });
        });

        it('should attach data volumes to the instance', () => {
            new SingleNodeConstruct(stack, 'TestNode', {
                protocolConfig,
                deploymentConfig,
                userDataScriptPath: testUserDataScriptPath,
                vpc: mockVpc,
            });

            const template = Template.fromStack(stack);

            template.hasResourceProperties('AWS::EC2::VolumeAttachment', {
                Device: '/dev/sdf',
            });
        });
    });

    describe('CloudFormation Creation Policy', () => {
        it('should configure creation policy for resource signaling', () => {
            new SingleNodeConstruct(stack, 'TestNode', {
                protocolConfig,
                deploymentConfig,
                userDataScriptPath: testUserDataScriptPath,
                vpc: mockVpc,
            });

            const template = Template.fromStack(stack);

            // Check that the instance has a creation policy
            const resources = template.findResources('AWS::EC2::Instance');
            const instanceKey = Object.keys(resources)[0];
            const instance = resources[instanceKey];

            expect(instance.CreationPolicy).toBeDefined();
            expect(instance.CreationPolicy.ResourceSignal).toBeDefined();
            expect(instance.CreationPolicy.ResourceSignal.Count).toBe(1);
            expect(instance.CreationPolicy.ResourceSignal.Timeout).toBe('PT15M');
        });
    });

    describe('Construct Properties', () => {
        it('should expose instanceId property', () => {
            const construct = new SingleNodeConstruct(stack, 'TestNode', {
                protocolConfig,
                deploymentConfig,
                userDataScriptPath: testUserDataScriptPath,
                vpc: mockVpc,
            });

            expect(construct.instanceId).toBeDefined();
        });

        it('should expose nodeCFLogicalId property', () => {
            const construct = new SingleNodeConstruct(stack, 'TestNode', {
                protocolConfig,
                deploymentConfig,
                userDataScriptPath: testUserDataScriptPath,
                vpc: mockVpc,
            });

            expect(construct.nodeCFLogicalId).toBeDefined();
        });

        it('should expose instance property', () => {
            const construct = new SingleNodeConstruct(stack, 'TestNode', {
                protocolConfig,
                deploymentConfig,
                userDataScriptPath: testUserDataScriptPath,
                vpc: mockVpc,
            });

            expect(construct.instance).toBeDefined();
            expect(construct.instance).toBeInstanceOf(ec2.Instance);
        });

        it('should expose securityGroup property', () => {
            const construct = new SingleNodeConstruct(stack, 'TestNode', {
                protocolConfig,
                deploymentConfig,
                userDataScriptPath: testUserDataScriptPath,
                vpc: mockVpc,
            });

            expect(construct.securityGroup).toBeDefined();
        });

        it('should expose instanceRole property', () => {
            const construct = new SingleNodeConstruct(stack, 'TestNode', {
                protocolConfig,
                deploymentConfig,
                userDataScriptPath: testUserDataScriptPath,
                vpc: mockVpc,
            });

            expect(construct.instanceRole).toBeDefined();
        });

        it('should expose vpc property', () => {
            const construct = new SingleNodeConstruct(stack, 'TestNode', {
                protocolConfig,
                deploymentConfig,
                userDataScriptPath: testUserDataScriptPath,
                vpc: mockVpc,
            });

            expect(construct.vpc).toBeDefined();
            expect(construct.vpc).toBe(mockVpc);
        });
    });

    describe('Multiple Data Volumes', () => {
        it('should create multiple data volumes when configured', () => {
            // Load HA config which has 2 volumes
            const haEnvPath = path.join(__dirname, '../../../blueprints/dummy/samples/.env-testnet-ha-nodes');
            const haEnvironmentConfig = configLoader.loadEnvironmentConfig(haEnvPath);

            // Override deployment mode to single-node for this test
            haEnvironmentConfig.DEPLOYMENT_MODE = DeploymentMode.SINGLE_NODE;

            const haDeploymentConfig: DeploymentConfig = {
                protocol: protocolConfig,
                environment: haEnvironmentConfig,
            };

            new SingleNodeConstruct(stack, 'TestNode', {
                protocolConfig,
                deploymentConfig: haDeploymentConfig,
                userDataScriptPath: testUserDataScriptPath,
                vpc: mockVpc,
            });

            const template = Template.fromStack(stack);

            // HA config has 2 data volumes
            template.resourceCountIs('AWS::EC2::Volume', 2);
            template.resourceCountIs('AWS::EC2::VolumeAttachment', 2);
        });

        it('should attach multiple volumes with correct device names', () => {
            // Load HA config which has 2 volumes
            const haEnvPath = path.join(__dirname, '../../../blueprints/dummy/samples/.env-testnet-ha-nodes');
            const haEnvironmentConfig = configLoader.loadEnvironmentConfig(haEnvPath);

            // Override deployment mode to single-node for this test
            haEnvironmentConfig.DEPLOYMENT_MODE = DeploymentMode.SINGLE_NODE;

            const haDeploymentConfig: DeploymentConfig = {
                protocol: protocolConfig,
                environment: haEnvironmentConfig,
            };

            new SingleNodeConstruct(stack, 'TestNode', {
                protocolConfig,
                deploymentConfig: haDeploymentConfig,
                userDataScriptPath: testUserDataScriptPath,
                vpc: mockVpc,
            });

            const template = Template.fromStack(stack);

            // Check first volume attachment
            template.hasResourceProperties('AWS::EC2::VolumeAttachment', {
                Device: '/dev/sdf',
            });

            // Check second volume attachment - note: fixture has typo, should be /dev/sdg
            template.hasResourceProperties('AWS::EC2::VolumeAttachment', {
                Device: '/dev/sdg',
            });
        });
    });
});
