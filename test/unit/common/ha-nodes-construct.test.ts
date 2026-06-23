// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import { Template, Match } from 'aws-cdk-lib/assertions';
import * as path from 'path';
import { HANodesConstruct } from '../../../lib/common/ha-nodes-construct';
import { ConfigurationLoader } from '../../../lib/core/configuration-loader';
import { DeploymentConfig, ProtocolConfig } from '../../../lib/interfaces';

describe('HANodesConstruct', () => {
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

        const testEnvPath = path.join(__dirname, '../../../blueprints/dummy/samples/.env-testnet-ha-nodes');
        const environmentConfig = configLoader.loadEnvironmentConfig(testEnvPath);

        deploymentConfig = {
            protocol: protocolConfig,
            environment: environmentConfig,
        };

        // Path to test user data script
        testUserDataScriptPath = path.join(__dirname, '../../../assets/common/user-data-ubuntu.sh');
    });

    describe('Application Load Balancer Creation', () => {
        it('should create an Application Load Balancer', () => {
            new HANodesConstruct(stack, 'TestHANodes', {
                protocolConfig,
                deploymentConfig,
                userDataScriptPath: testUserDataScriptPath,
                vpc: mockVpc,
            });

            const template = Template.fromStack(stack);
            template.resourceCountIs('AWS::ElasticLoadBalancingV2::LoadBalancer', 1);
        });

        it('should create an internal ALB by default (not internet-facing)', () => {
            new HANodesConstruct(stack, 'TestHANodes', {
                protocolConfig,
                deploymentConfig,
                userDataScriptPath: testUserDataScriptPath,
                vpc: mockVpc,
            });

            const template = Template.fromStack(stack);
            template.hasResourceProperties('AWS::ElasticLoadBalancingV2::LoadBalancer', {
                Scheme: 'internal',
                Type: 'application',
            });
        });

        it('should create an internet-facing ALB when HA_ALB_INTERNET_FACING is true', () => {
            deploymentConfig.environment.HA_CONFIG!.HA_ALB_INTERNET_FACING = true;

            new HANodesConstruct(stack, 'TestHANodes', {
                protocolConfig,
                deploymentConfig,
                userDataScriptPath: testUserDataScriptPath,
                vpc: mockVpc,
            });

            const template = Template.fromStack(stack);
            template.hasResourceProperties('AWS::ElasticLoadBalancingV2::LoadBalancer', {
                Scheme: 'internet-facing',
                Type: 'application',
            });
        });
    });

    describe('Target Group Creation', () => {
        it('should create a target group', () => {
            new HANodesConstruct(stack, 'TestHANodes', {
                protocolConfig,
                deploymentConfig,
                userDataScriptPath: testUserDataScriptPath,
                vpc: mockVpc,
            });

            const template = Template.fromStack(stack);
            template.resourceCountIs('AWS::ElasticLoadBalancingV2::TargetGroup', 1);
        });

        it('should configure target group with correct health check settings', () => {
            new HANodesConstruct(stack, 'TestHANodes', {
                protocolConfig,
                deploymentConfig,
                userDataScriptPath: testUserDataScriptPath,
                vpc: mockVpc,
            });

            const template = Template.fromStack(stack);
            // From ha-nodes.env fixture
            template.hasResourceProperties('AWS::ElasticLoadBalancingV2::TargetGroup', {
                Port: 8545,
                Protocol: 'HTTP',
                HealthCheckPath: '/health',
                HealthCheckPort: '8545',
                HealthCheckIntervalSeconds: 30,
                HealthCheckTimeoutSeconds: 5,
                HealthyThresholdCount: 3,
                UnhealthyThresholdCount: 2,
            });
        });

        it('should configure target group with correct deregistration delay', () => {
            new HANodesConstruct(stack, 'TestHANodes', {
                protocolConfig,
                deploymentConfig,
                userDataScriptPath: testUserDataScriptPath,
                vpc: mockVpc,
            });

            const template = Template.fromStack(stack);
            // From ha-nodes.env: HA_ALB_DEREGISTRATION_DELAY_SEC="30"
            template.hasResourceProperties('AWS::ElasticLoadBalancingV2::TargetGroup', {
                TargetGroupAttributes: Match.arrayWith([
                    Match.objectLike({
                        Key: 'deregistration_delay.timeout_seconds',
                        Value: '30',
                    }),
                ]),
            });
        });
    });


    describe('ALB Listener Creation', () => {
        it('should create an ALB listener', () => {
            new HANodesConstruct(stack, 'TestHANodes', {
                protocolConfig,
                deploymentConfig,
                userDataScriptPath: testUserDataScriptPath,
                vpc: mockVpc,
            });

            const template = Template.fromStack(stack);
            template.resourceCountIs('AWS::ElasticLoadBalancingV2::Listener', 1);
        });

        it('should configure listener with correct port', () => {
            new HANodesConstruct(stack, 'TestHANodes', {
                protocolConfig,
                deploymentConfig,
                userDataScriptPath: testUserDataScriptPath,
                vpc: mockVpc,
            });

            const template = Template.fromStack(stack);
            // From ha-nodes.env: HA_ALB_HEALTHCHECK_PORT="8545"
            template.hasResourceProperties('AWS::ElasticLoadBalancingV2::Listener', {
                Port: 8545,
                Protocol: 'HTTP',
            });
        });
    });

    describe('ALB Exposure Controls (security)', () => {
        it('should restrict ALB ingress to the VPC CIDR by default (not 0.0.0.0/0)', () => {
            new HANodesConstruct(stack, 'TestHANodes', {
                protocolConfig,
                deploymentConfig,
                userDataScriptPath: testUserDataScriptPath,
                vpc: mockVpc,
            });

            const template = Template.fromStack(stack);
            // By default ingress is scoped to the VPC CIDR (a CloudFormation
            // token for a created VPC), on the listener port only.
            template.hasResourceProperties('AWS::EC2::SecurityGroup', {
                GroupDescription: 'ALB Security Group for dummy blockchain HA nodes',
                SecurityGroupIngress: Match.arrayWith([
                    Match.objectLike({
                        FromPort: 8545,
                        ToPort: 8545,
                        IpProtocol: 'tcp',
                    }),
                ]),
            });

            // The ALB SG must NOT allow the whole internet on the listener port.
            const sgs = template.findResources('AWS::EC2::SecurityGroup');
            for (const sg of Object.values(sgs)) {
                if (sg.Properties.GroupDescription === 'ALB Security Group for dummy blockchain HA nodes') {
                    const ingress = sg.Properties.SecurityGroupIngress || [];
                    for (const rule of ingress) {
                        expect(rule.CidrIp).not.toBe('0.0.0.0/0');
                    }
                }
            }
        });

        it('should use HA_ALB_ALLOWED_CIDR for ALB ingress when provided', () => {
            deploymentConfig.environment.HA_CONFIG!.HA_ALB_ALLOWED_CIDR = '203.0.113.0/24';

            new HANodesConstruct(stack, 'TestHANodes', {
                protocolConfig,
                deploymentConfig,
                userDataScriptPath: testUserDataScriptPath,
                vpc: mockVpc,
            });

            const template = Template.fromStack(stack);
            template.hasResourceProperties('AWS::EC2::SecurityGroup', {
                GroupDescription: 'ALB Security Group for dummy blockchain HA nodes',
                SecurityGroupIngress: Match.arrayWith([
                    Match.objectLike({
                        CidrIp: '203.0.113.0/24',
                        FromPort: 8545,
                        ToPort: 8545,
                    }),
                ]),
            });
        });

        it('should allow ALB to reach instances only on the listener port (not all TCP)', () => {
            new HANodesConstruct(stack, 'TestHANodes', {
                protocolConfig,
                deploymentConfig,
                userDataScriptPath: testUserDataScriptPath,
                vpc: mockVpc,
            });

            const template = Template.fromStack(stack);

            // Cross-SG reference is rendered as a standalone ingress resource.
            template.hasResourceProperties('AWS::EC2::SecurityGroupIngress', {
                IpProtocol: 'tcp',
                FromPort: 8545,
                ToPort: 8545,
                SourceSecurityGroupId: Match.anyValue(),
            });

            // There must be no allTcp (0-65535) rule sourced from another SG.
            const ingressRules = template.findResources('AWS::EC2::SecurityGroupIngress');
            for (const rule of Object.values(ingressRules)) {
                if (rule.Properties.SourceSecurityGroupId) {
                    const isAllTcp = rule.Properties.FromPort === 0 && rule.Properties.ToPort === 65535;
                    expect(isAllTcp).toBe(false);
                }
            }
        });

        it('should use an HTTPS listener when HA_ALB_CERTIFICATE_ARN is set', () => {
            const certArn = 'arn:aws:acm:us-east-1:123456789012:certificate/abcd-1234';
            deploymentConfig.environment.HA_CONFIG!.HA_ALB_CERTIFICATE_ARN = certArn;

            new HANodesConstruct(stack, 'TestHANodes', {
                protocolConfig,
                deploymentConfig,
                userDataScriptPath: testUserDataScriptPath,
                vpc: mockVpc,
            });

            const template = Template.fromStack(stack);
            template.hasResourceProperties('AWS::ElasticLoadBalancingV2::Listener', {
                Port: 8545,
                Protocol: 'HTTPS',
                Certificates: Match.arrayWith([
                    Match.objectLike({ CertificateArn: certArn }),
                ]),
            });
        });
    });

    describe('Auto Scaling Group Creation', () => {
        it('should create an Auto Scaling Group', () => {
            new HANodesConstruct(stack, 'TestHANodes', {
                protocolConfig,
                deploymentConfig,
                userDataScriptPath: testUserDataScriptPath,
                vpc: mockVpc,
            });

            const template = Template.fromStack(stack);
            template.resourceCountIs('AWS::AutoScaling::AutoScalingGroup', 1);
        });

        it('should configure ASG with correct capacity settings', () => {
            new HANodesConstruct(stack, 'TestHANodes', {
                protocolConfig,
                deploymentConfig,
                userDataScriptPath: testUserDataScriptPath,
                vpc: mockVpc,
            });

            const template = Template.fromStack(stack);
            // From ha-nodes.env: HA_NUMBER_OF_NODES="3"
            template.hasResourceProperties('AWS::AutoScaling::AutoScalingGroup', {
                DesiredCapacity: '3',
                MinSize: '1',
                MaxSize: '6', // 2x desired capacity
            });
        });

        it('should configure ASG with ELB health check', () => {
            new HANodesConstruct(stack, 'TestHANodes', {
                protocolConfig,
                deploymentConfig,
                userDataScriptPath: testUserDataScriptPath,
                vpc: mockVpc,
            });

            const template = Template.fromStack(stack);
            template.hasResourceProperties('AWS::AutoScaling::AutoScalingGroup', {
                HealthCheckType: 'ELB',
                HealthCheckGracePeriod: 3600, // 60 minutes in seconds
            });
        });
    });

    describe('Launch Template Creation', () => {
        it('should create a launch template', () => {
            new HANodesConstruct(stack, 'TestHANodes', {
                protocolConfig,
                deploymentConfig,
                userDataScriptPath: testUserDataScriptPath,
                vpc: mockVpc,
            });

            const template = Template.fromStack(stack);
            template.resourceCountIs('AWS::EC2::LaunchTemplate', 1);
        });

        it('should configure launch template with correct instance type', () => {
            new HANodesConstruct(stack, 'TestHANodes', {
                protocolConfig,
                deploymentConfig,
                userDataScriptPath: testUserDataScriptPath,
                vpc: mockVpc,
            });

            const template = Template.fromStack(stack);
            // From ha-nodes.env: INSTANCE_TYPE="t3.large"
            template.hasResourceProperties('AWS::EC2::LaunchTemplate', {
                LaunchTemplateData: Match.objectLike({
                    InstanceType: 't3.large',
                }),
            });
        });

        it('should configure launch template with detailed monitoring', () => {
            new HANodesConstruct(stack, 'TestHANodes', {
                protocolConfig,
                deploymentConfig,
                userDataScriptPath: testUserDataScriptPath,
                vpc: mockVpc,
            });

            const template = Template.fromStack(stack);
            template.hasResourceProperties('AWS::EC2::LaunchTemplate', {
                LaunchTemplateData: Match.objectLike({
                    Monitoring: {
                        Enabled: true,
                    },
                }),
            });
        });

        it('should configure launch template with encrypted root volume', () => {
            new HANodesConstruct(stack, 'TestHANodes', {
                protocolConfig,
                deploymentConfig,
                userDataScriptPath: testUserDataScriptPath,
                vpc: mockVpc,
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

        it('should configure launch template with data volumes', () => {
            new HANodesConstruct(stack, 'TestHANodes', {
                protocolConfig,
                deploymentConfig,
                userDataScriptPath: testUserDataScriptPath,
                vpc: mockVpc,
            });

            const template = Template.fromStack(stack);
            // From ha-nodes.env: 2 data volumes
            template.hasResourceProperties('AWS::EC2::LaunchTemplate', {
                LaunchTemplateData: Match.objectLike({
                    BlockDeviceMappings: Match.arrayWith([
                        Match.objectLike({
                            DeviceName: '/dev/sdf',
                            Ebs: Match.objectLike({
                                VolumeSize: 200,
                                Iops: 6000,
                                Throughput: 250,
                                Encrypted: true,
                            }),
                        }),
                        Match.objectLike({
                            DeviceName: '/dev/sdg',
                            Ebs: Match.objectLike({
                                VolumeSize: 100,
                                Iops: 3000,
                                Throughput: 125,
                                Encrypted: true,
                            }),
                        }),
                    ]),
                }),
            });
        });

        it('should inject user data into launch template', () => {
            new HANodesConstruct(stack, 'TestHANodes', {
                protocolConfig,
                deploymentConfig,
                userDataScriptPath: testUserDataScriptPath,
                vpc: mockVpc,
            });

            const template = Template.fromStack(stack);
            template.hasResourceProperties('AWS::EC2::LaunchTemplate', {
                LaunchTemplateData: Match.objectLike({
                    UserData: Match.anyValue(),
                }),
            });
        });
    });


    describe('Security Group Creation', () => {
        it('should create two security groups (ALB and instances)', () => {
            new HANodesConstruct(stack, 'TestHANodes', {
                protocolConfig,
                deploymentConfig,
                userDataScriptPath: testUserDataScriptPath,
                vpc: mockVpc,
            });

            const template = Template.fromStack(stack);
            // 2 security groups: ALB + instances
            template.resourceCountIs('AWS::EC2::SecurityGroup', 2);
        });

        it('should create ALB security group with correct description', () => {
            new HANodesConstruct(stack, 'TestHANodes', {
                protocolConfig,
                deploymentConfig,
                userDataScriptPath: testUserDataScriptPath,
                vpc: mockVpc,
            });

            const template = Template.fromStack(stack);
            template.hasResourceProperties('AWS::EC2::SecurityGroup', {
                GroupDescription: 'ALB Security Group for dummy blockchain HA nodes',
            });
        });

        it('should create instance security group with correct description', () => {
            new HANodesConstruct(stack, 'TestHANodes', {
                protocolConfig,
                deploymentConfig,
                userDataScriptPath: testUserDataScriptPath,
                vpc: mockVpc,
            });

            const template = Template.fromStack(stack);
            template.hasResourceProperties('AWS::EC2::SecurityGroup', {
                GroupDescription: 'Instance Security Group for dummy blockchain HA nodes',
            });
        });

        it('should add ingress rules for protocol required ports on instance security group', () => {
            new HANodesConstruct(stack, 'TestHANodes', {
                protocolConfig,
                deploymentConfig,
                userDataScriptPath: testUserDataScriptPath,
                vpc: mockVpc,
            });

            const template = Template.fromStack(stack);
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

        it('should add ingress rules for port ranges on instance security group', () => {
            new HANodesConstruct(stack, 'TestHANodes', {
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

        it('should add egress rules for outbound traffic on instance security group', () => {
            new HANodesConstruct(stack, 'TestHANodes', {
                protocolConfig,
                deploymentConfig,
                userDataScriptPath: testUserDataScriptPath,
                vpc: mockVpc,
            });

            const template = Template.fromStack(stack);
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
        it('should create an IAM role for the instances', () => {
            new HANodesConstruct(stack, 'TestHANodes', {
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
            new HANodesConstruct(stack, 'TestHANodes', {
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
            new HANodesConstruct(stack, 'TestHANodes', {
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
            new HANodesConstruct(stack, 'TestHANodes', {
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

        it('should scope ASG lifecycle hook permissions to this stack\'s ASG (not *)', () => {
            new HANodesConstruct(stack, 'TestHANodes', {
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
                                'autoscaling:CompleteLifecycleAction',
                                'autoscaling:RecordLifecycleActionHeartbeat',
                            ]),
                            Effect: 'Allow',
                            Resource: 'arn:aws:autoscaling:us-east-1:123456789012:autoScalingGroup:*:autoScalingGroupName/TestStack',
                        }),
                    ]),
                }),
            });

            // No autoscaling statement may use a wildcard resource.
            const policies = template.findResources('AWS::IAM::Policy');
            for (const policy of Object.values(policies)) {
                const statements = policy.Properties.PolicyDocument.Statement as any[];
                for (const statement of statements) {
                    const actions = Array.isArray(statement.Action) ? statement.Action : [statement.Action];
                    const touchesAsg = actions.some((a: string) => typeof a === 'string' && a.startsWith('autoscaling:'));
                    if (touchesAsg) {
                        const resources = Array.isArray(statement.Resource) ? statement.Resource : [statement.Resource];
                        expect(resources).not.toContain('*');
                    }
                }
            }
        });

        it('should scope Secrets Manager permissions to the stack\'s own secrets (not *)', () => {
            new HANodesConstruct(stack, 'TestHANodes', {
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
            new HANodesConstruct(stack, 'TestHANodes', {
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
            const externalArn = 'arn:aws:secretsmanager:us-east-1:123456789012:secret:my-node-identity-AbCdEf';
            deploymentConfig.environment.CUSTOM_VARIABLES = {
                ...deploymentConfig.environment.CUSTOM_VARIABLES,
                SOLANA_NODE_IDENTITY_SECRET_ARN: externalArn,
            };

            new HANodesConstruct(stack, 'TestHANodes', {
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


    describe('Snapshot Staging Volume IAM (security)', () => {
        // Enable snapshot staging so the staging-volume policy statements are added.
        const enableStaging = () => {
            deploymentConfig.environment.SNAPSHOT_ENABLED = true;
            deploymentConfig.environment.SNAPSHOT_STAGING_VOL_SIZE = 100;
        };

        it('should not grant any ec2 *Volume write action on a wildcard resource', () => {
            enableStaging();
            new HANodesConstruct(stack, 'TestHANodes', {
                protocolConfig,
                deploymentConfig,
                userDataScriptPath: testUserDataScriptPath,
                vpc: mockVpc,
            });

            const template = Template.fromStack(stack);
            const policies = template.findResources('AWS::IAM::Policy');
            const writeVolumeActions = ['ec2:CreateVolume', 'ec2:AttachVolume', 'ec2:DetachVolume', 'ec2:DeleteVolume'];

            for (const policy of Object.values(policies)) {
                const statements = policy.Properties.PolicyDocument.Statement as any[];
                for (const statement of statements) {
                    const actions = Array.isArray(statement.Action) ? statement.Action : [statement.Action];
                    const hasWriteVolume = actions.some((a: string) => writeVolumeActions.includes(a));
                    if (hasWriteVolume) {
                        const resources = Array.isArray(statement.Resource) ? statement.Resource : [statement.Resource];
                        expect(resources).not.toContain('*');
                    }
                }
            }
        });

        it('should require the snapshot-staging tag to create a staging volume', () => {
            enableStaging();
            new HANodesConstruct(stack, 'TestHANodes', {
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
                            Action: 'ec2:CreateVolume',
                            Effect: 'Allow',
                            Condition: {
                                StringEquals: { 'aws:RequestTag/Purpose': 'snapshot-staging' },
                            },
                        }),
                    ]),
                }),
            });
        });

        it('should restrict attach/detach/delete to volumes tagged snapshot-staging', () => {
            enableStaging();
            new HANodesConstruct(stack, 'TestHANodes', {
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
                            Action: Match.arrayWith(['ec2:AttachVolume', 'ec2:DetachVolume', 'ec2:DeleteVolume']),
                            Effect: 'Allow',
                            Condition: {
                                StringEquals: { 'aws:ResourceTag/Purpose': 'snapshot-staging' },
                            },
                        }),
                    ]),
                }),
            });
        });

        it('should restrict attach/detach on the instance side to this ASG', () => {
            enableStaging();
            new HANodesConstruct(stack, 'TestHANodes', {
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
                            Action: Match.arrayWith(['ec2:AttachVolume', 'ec2:DetachVolume']),
                            Effect: 'Allow',
                            Condition: {
                                StringEquals: { 'aws:ResourceTag/aws:autoscaling:groupName': Match.anyValue() },
                            },
                        }),
                    ]),
                }),
            });
        });

        it('should not add the staging volume policy when snapshots are disabled', () => {
            // deploymentConfig from beforeEach has SNAPSHOT_ENABLED unset/false
            new HANodesConstruct(stack, 'TestHANodes', {
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
                    expect(actions).not.toContain('ec2:CreateVolume');
                }
            }
        });
    });


    describe('Lifecycle Hook Creation', () => {
        it('should create a lifecycle hook', () => {
            new HANodesConstruct(stack, 'TestHANodes', {
                protocolConfig,
                deploymentConfig,
                userDataScriptPath: testUserDataScriptPath,
                vpc: mockVpc,
            });

            const template = Template.fromStack(stack);
            template.resourceCountIs('AWS::AutoScaling::LifecycleHook', 1);
        });

        it('should configure lifecycle hook for instance launching', () => {
            new HANodesConstruct(stack, 'TestHANodes', {
                protocolConfig,
                deploymentConfig,
                userDataScriptPath: testUserDataScriptPath,
                vpc: mockVpc,
            });

            const template = Template.fromStack(stack);
            template.hasResourceProperties('AWS::AutoScaling::LifecycleHook', {
                LifecycleTransition: 'autoscaling:EC2_INSTANCE_LAUNCHING',
                DefaultResult: 'ABANDON',
            });
        });

        it('should configure lifecycle hook with correct heartbeat timeout', () => {
            new HANodesConstruct(stack, 'TestHANodes', {
                protocolConfig,
                deploymentConfig,
                userDataScriptPath: testUserDataScriptPath,
                vpc: mockVpc,
            });

            const template = Template.fromStack(stack);
            // From ha-nodes.env: HA_NODES_HEARTBEAT_DELAY_MIN="10"
            template.hasResourceProperties('AWS::AutoScaling::LifecycleHook', {
                HeartbeatTimeout: 600, // 10 minutes in seconds
            });
        });
    });

    describe('Construct Properties', () => {
        it('should expose alb property', () => {
            const construct = new HANodesConstruct(stack, 'TestHANodes', {
                protocolConfig,
                deploymentConfig,
                userDataScriptPath: testUserDataScriptPath,
                vpc: mockVpc,
            });

            expect(construct.alb).toBeDefined();
        });

        it('should expose targetGroup property', () => {
            const construct = new HANodesConstruct(stack, 'TestHANodes', {
                protocolConfig,
                deploymentConfig,
                userDataScriptPath: testUserDataScriptPath,
                vpc: mockVpc,
            });

            expect(construct.targetGroup).toBeDefined();
        });

        it('should expose autoScalingGroup property', () => {
            const construct = new HANodesConstruct(stack, 'TestHANodes', {
                protocolConfig,
                deploymentConfig,
                userDataScriptPath: testUserDataScriptPath,
                vpc: mockVpc,
            });

            expect(construct.autoScalingGroup).toBeDefined();
        });

        it('should expose instanceSecurityGroup property', () => {
            const construct = new HANodesConstruct(stack, 'TestHANodes', {
                protocolConfig,
                deploymentConfig,
                userDataScriptPath: testUserDataScriptPath,
                vpc: mockVpc,
            });

            expect(construct.instanceSecurityGroup).toBeDefined();
        });

        it('should expose albSecurityGroup property', () => {
            const construct = new HANodesConstruct(stack, 'TestHANodes', {
                protocolConfig,
                deploymentConfig,
                userDataScriptPath: testUserDataScriptPath,
                vpc: mockVpc,
            });

            expect(construct.albSecurityGroup).toBeDefined();
        });

        it('should expose instanceRole property', () => {
            const construct = new HANodesConstruct(stack, 'TestHANodes', {
                protocolConfig,
                deploymentConfig,
                userDataScriptPath: testUserDataScriptPath,
                vpc: mockVpc,
            });

            expect(construct.instanceRole).toBeDefined();
        });

        it('should expose vpc property', () => {
            const construct = new HANodesConstruct(stack, 'TestHANodes', {
                protocolConfig,
                deploymentConfig,
                userDataScriptPath: testUserDataScriptPath,
                vpc: mockVpc,
            });

            expect(construct.vpc).toBeDefined();
            expect(construct.vpc).toBe(mockVpc);
        });

        it('should expose lifecycleHookName property', () => {
            const construct = new HANodesConstruct(stack, 'TestHANodes', {
                protocolConfig,
                deploymentConfig,
                userDataScriptPath: testUserDataScriptPath,
                vpc: mockVpc,
            });

            expect(construct.lifecycleHookName).toBeDefined();
            expect(construct.lifecycleHookName).toBe('TestStack'); // Stack name
        });
    });

    describe('Error Handling', () => {
        it('should throw error when HA config has invalid values', () => {
            // Create deployment config with invalid HA config
            const testEnvPath = path.join(__dirname, '../../../blueprints/dummy/samples/.env-testnet-ha-nodes');
            const haEnvConfig = configLoader.loadEnvironmentConfig(testEnvPath);

            // Set invalid HA config (missing required field)
            delete (haEnvConfig.HA_CONFIG as any).HA_NUMBER_OF_NODES;

            const invalidDeploymentConfig: DeploymentConfig = {
                protocol: protocolConfig,
                environment: haEnvConfig,
            };

            expect(() => {
                new HANodesConstruct(stack, 'TestHANodes', {
                    protocolConfig,
                    deploymentConfig: invalidDeploymentConfig,
                    userDataScriptPath: testUserDataScriptPath,
                    vpc: mockVpc,
                });
            }).toThrow('Configuration validation for HA setup is failed');
        });
    });
});
