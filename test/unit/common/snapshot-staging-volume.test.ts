// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import { Template, Match } from 'aws-cdk-lib/assertions';
import * as path from 'path';
import { SingleNodeConstruct } from '../../../lib/common/single-node-construct';
import { HANodesConstruct } from '../../../lib/common/ha-nodes-construct';
import { ConfigurationLoader } from '../../../lib/core/configuration-loader';
import { DeploymentConfig, ProtocolConfig, DeploymentMode } from '../../../lib/interfaces';

/**
 * Tests for the snapshot staging volume CDK wiring (snapshot-staging-cleanup-fix).
 *
 * These validate that when staging is enabled the construct produces the gp3
 * staging volume, the /dev/xvdz attachment, and the scoped Detach/Delete IAM,
 * and that when staging is disabled none of that is produced (preservation).
 *
 * The bash cleanup behavior itself is exercised by the Dummy blueprint debug
 * path (blueprints/dummy/user-data/common/download-snapshot.sh), not here.
 */
describe('Snapshot staging volume wiring', () => {
    let app: cdk.App;
    let stack: cdk.Stack;
    let configLoader: ConfigurationLoader;
    let protocolConfig: ProtocolConfig;
    let mockVpc: ec2.IVpc;
    let testUserDataScriptPath: string;

    const blueprintsPath = path.join(__dirname, '../../../blueprints');
    const stagingDebugEnv = path.join(blueprintsPath, 'dummy/samples/.env-testnet-staging-debug');
    const disabledEnv = path.join(blueprintsPath, 'dummy/samples/.env-mainnet-single-node');
    const haEnv = path.join(blueprintsPath, 'dummy/samples/.env-testnet-ha-nodes');

    beforeEach(() => {
        app = new cdk.App();
        stack = new cdk.Stack(app, 'TestStack', {
            env: { account: '123456789012', region: 'us-east-1' },
        });
        mockVpc = new ec2.Vpc(stack, 'MockVPC', { maxAzs: 2 });

        configLoader = new ConfigurationLoader(blueprintsPath);
        protocolConfig = configLoader.loadProtocolConfig('dummy');
        testUserDataScriptPath = path.join(__dirname, '../../../assets/common/user-data-ubuntu.sh');
    });

    describe('single-node with staging enabled', () => {
        let template: Template;

        beforeEach(() => {
            const environment = configLoader.loadEnvironmentConfig(stagingDebugEnv);
            const deploymentConfig: DeploymentConfig = { protocol: protocolConfig, environment };

            new SingleNodeConstruct(stack, 'TestNode', {
                protocolConfig,
                deploymentConfig,
                userDataScriptPath: testUserDataScriptPath,
                vpc: mockVpc,
            });
            template = Template.fromStack(stack);
        });

        it('creates a gp3 staging volume tagged Purpose=snapshot-staging', () => {
            template.hasResourceProperties('AWS::EC2::Volume', {
                VolumeType: 'gp3',
                Size: 10, // SNAPSHOT_STAGING_VOL_SIZE from the debug env
                Encrypted: true,
                Tags: Match.arrayWith([
                    Match.objectLike({ Key: 'Purpose', Value: 'snapshot-staging' }),
                ]),
            });
        });

        it('attaches the staging volume at /dev/xvdz', () => {
            template.hasResourceProperties('AWS::EC2::VolumeAttachment', {
                Device: '/dev/xvdz',
            });
        });

        it('grants the instance role ec2:DetachVolume and ec2:DeleteVolume', () => {
            template.hasResourceProperties('AWS::IAM::Policy', {
                PolicyDocument: Match.objectLike({
                    Statement: Match.arrayWith([
                        Match.objectLike({
                            Effect: 'Allow',
                            Action: Match.arrayWith(['ec2:DetachVolume', 'ec2:DeleteVolume']),
                        }),
                    ]),
                }),
            });
        });

        it('scopes the detach/delete grant to both the volume and the instance', () => {
            // ec2:DetachVolume authorizes against the volume AND the instance,
            // so the policy must include an instance ARN or detach is denied
            // (which previously orphaned the staging volume).
            const policies = template.findResources('AWS::IAM::Policy');
            const serialized = JSON.stringify(policies);
            expect(serialized).toContain(':volume/');
            expect(serialized).toContain(':instance/');
        });
    });

    describe('single-node with staging disabled (preservation)', () => {
        let template: Template;

        beforeEach(() => {
            const environment = configLoader.loadEnvironmentConfig(disabledEnv);
            // .env-mainnet-single-node sets SNAPSHOT_STAGING_VOL_SIZE="0"
            const deploymentConfig: DeploymentConfig = { protocol: protocolConfig, environment };

            new SingleNodeConstruct(stack, 'TestNode', {
                protocolConfig,
                deploymentConfig,
                userDataScriptPath: testUserDataScriptPath,
                vpc: mockVpc,
            });
            template = Template.fromStack(stack);
        });

        it('does not create a staging volume or attach at /dev/xvdz', () => {
            // No volume tagged as staging.
            const volumes = template.findResources('AWS::EC2::Volume', {
                Properties: {
                    Tags: Match.arrayWith([
                        Match.objectLike({ Key: 'Purpose', Value: 'snapshot-staging' }),
                    ]),
                },
            });
            expect(Object.keys(volumes)).toHaveLength(0);

            const xvdzAttachments = template.findResources('AWS::EC2::VolumeAttachment', {
                Properties: { Device: '/dev/xvdz' },
            });
            expect(Object.keys(xvdzAttachments)).toHaveLength(0);
        });

        it('does not grant DeleteVolume on the instance role', () => {
            const policies = template.findResources('AWS::IAM::Policy');
            const serialized = JSON.stringify(policies);
            expect(serialized).not.toContain('ec2:DeleteVolume');
        });
    });

    describe('HA nodes with staging enabled', () => {
        it('grants scoped, tag-gated staging volume permissions to the instance role', () => {
            const environment = configLoader.loadEnvironmentConfig(haEnv);
            // Enable staging for the HA case (HA sample defaults to disabled).
            environment.SNAPSHOT_ENABLED = true;
            environment.SNAPSHOT_STAGING_VOL_SIZE = 50;
            const deploymentConfig: DeploymentConfig = { protocol: protocolConfig, environment };

            new HANodesConstruct(stack, 'TestHANodes', {
                protocolConfig,
                deploymentConfig,
                userDataScriptPath: testUserDataScriptPath,
                vpc: mockVpc,
            });
            const template = Template.fromStack(stack);

            // CreateVolume gated on the snapshot-staging request tag, scoped to a volume ARN.
            template.hasResourceProperties('AWS::IAM::Policy', {
                PolicyDocument: Match.objectLike({
                    Statement: Match.arrayWith([
                        Match.objectLike({
                            Effect: 'Allow',
                            Action: 'ec2:CreateVolume',
                            Condition: {
                                StringEquals: { 'aws:RequestTag/Purpose': 'snapshot-staging' },
                            },
                        }),
                        // Attach/detach/delete gated on the snapshot-staging resource tag.
                        Match.objectLike({
                            Effect: 'Allow',
                            Action: Match.arrayWith(['ec2:AttachVolume', 'ec2:DetachVolume', 'ec2:DeleteVolume']),
                            Condition: {
                                StringEquals: { 'aws:ResourceTag/Purpose': 'snapshot-staging' },
                            },
                        }),
                    ]),
                }),
            });
        });

        it('does not grant any ec2 *Volume write action on a wildcard resource', () => {
            const environment = configLoader.loadEnvironmentConfig(haEnv);
            environment.SNAPSHOT_ENABLED = true;
            environment.SNAPSHOT_STAGING_VOL_SIZE = 50;
            const deploymentConfig: DeploymentConfig = { protocol: protocolConfig, environment };

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
                    if (actions.some((a: string) => writeVolumeActions.includes(a))) {
                        const resources = Array.isArray(statement.Resource) ? statement.Resource : [statement.Resource];
                        expect(resources).not.toContain('*');
                    }
                }
            }
        });
    });
});
