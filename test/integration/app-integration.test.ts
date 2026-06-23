// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

/**
 * Integration tests for the main CDK application entry point (app.ts)
 * 
 * These tests verify the complete flow of the Universal Blockchain Node Runner
 * using the Dummy protocol for testing purposes.
 */

import * as path from 'path';
import * as fs from 'fs';
import * as cdk from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import { ConfigurationLoader } from '../../lib/core/configuration-loader';
import { UserDataManager } from '../../lib/core/user-data-manager';
import { StackFactory } from '../../lib/core/stack-factory';
import { DeploymentConfig, DeploymentMode } from '../../lib/interfaces';

describe('App Integration Tests with Dummy Protocol', () => {
    const blueprintsPath = path.join(__dirname, '../../blueprints');
    const sampleEnvPath = path.join(__dirname, '../../blueprints/dummy/samples');
    const assetsPath = path.join(__dirname, '../../assets/common');

    describe('Environment Variable Loading', () => {
        it('should detect BLOCKCHAIN_PROTOCOL from environment', () => {
            // Simulate environment variable
            const originalEnv = process.env.BLOCKCHAIN_PROTOCOL;
            process.env.BLOCKCHAIN_PROTOCOL = 'dummy';

            expect(process.env.BLOCKCHAIN_PROTOCOL).toBe('dummy');

            // Restore
            if (originalEnv !== undefined) {
                process.env.BLOCKCHAIN_PROTOCOL = originalEnv;
            } else {
                delete process.env.BLOCKCHAIN_PROTOCOL;
            }
        });

        it('should load configuration from .env file path', () => {
            const envPath = path.join(sampleEnvPath, ".env-mainnet-single-node");
            expect(fs.existsSync(envPath)).toBe(true);

            const configLoader = new ConfigurationLoader(blueprintsPath);
            const envConfig = configLoader.loadEnvironmentConfig(envPath);

            expect(envConfig.BLOCKCHAIN_PROTOCOL).toBe('dummy');
            expect(envConfig.DEPLOYMENT_MODE).toBe(DeploymentMode.SINGLE_NODE);
            expect(envConfig.AWS_ACCOUNT_ID).toBe('123456789012');
            expect(envConfig.AWS_REGION).toBe('us-east-1');
        });
    });

    describe('Protocol Detection and Validation', () => {
        it('should detect available protocols in blueprints directory', () => {
            const configLoader = new ConfigurationLoader(blueprintsPath);
            const protocols = configLoader.getAvailableProtocols();

            expect(protocols).toContain('dummy');
        });

        it('should validate protocol exists before loading', () => {
            const configLoader = new ConfigurationLoader(blueprintsPath);

            // Valid protocol should load
            expect(() => configLoader.loadProtocolConfig('dummy')).not.toThrow();

            // Invalid protocol should throw
            expect(() => configLoader.loadProtocolConfig('nonexistent')).toThrow();
        });
    });

    describe('Configuration Loading Flow', () => {
        let configLoader: ConfigurationLoader;

        beforeEach(() => {
            configLoader = new ConfigurationLoader(blueprintsPath);
        });

        it('should load protocol configuration from blueprints directory', () => {
            const protocolConfig = configLoader.loadProtocolConfig('dummy');

            expect(protocolConfig.BLOCKCHAIN_PROTOCOL).toBe('dummy');
            expect(protocolConfig.supportedDeploymentModes).toContain('single-node');
            expect(protocolConfig.supportedDeploymentModes).toContain('ha-nodes');
            expect(protocolConfig.customEnvVarsNamePrefix).toBe('DUMMY');
        });

        it('should load environment configuration from .env file', () => {
            const envPath = path.join(sampleEnvPath, ".env-mainnet-single-node");
            const envConfig = configLoader.loadEnvironmentConfig(envPath);

            expect(envConfig.BLOCKCHAIN_PROTOCOL).toBe('dummy');
            expect(envConfig.INSTANCE_TYPE).toBe('t3.medium');
            expect(envConfig.DATA_VOLUMES_COUNT).toBe(1);
        });

        it('should validate configuration completeness', () => {
            const envPath = path.join(sampleEnvPath, ".env-mainnet-single-node");
            const envConfig = configLoader.loadEnvironmentConfig(envPath);
            const validationResult = configLoader.validateConfiguration(envConfig);

            expect(validationResult.isValid).toBe(true);
            expect(validationResult.errors).toHaveLength(0);
        });

        it('should extract protocol-specific custom variables', () => {
            const protocolConfig = configLoader.loadProtocolConfig('dummy');
            const envPath = path.join(sampleEnvPath, ".env-mainnet-single-node");
            const envConfig = configLoader.loadEnvironmentConfig(envPath);

            const customVars = configLoader.extractProtocolCustomEnvVars(protocolConfig, envConfig);

            expect(customVars.DUMMY_NODE_TYPE).toBeDefined();
            expect(customVars.DUMMY_SYNC_MODE).toBeDefined();
        });
    });

    describe('Stack Creation Flow', () => {
        let app: cdk.App;
        let configLoader: ConfigurationLoader;
        let stackFactory: StackFactory;

        beforeEach(() => {
            app = new cdk.App();
            configLoader = new ConfigurationLoader(blueprintsPath);
            stackFactory = new StackFactory();
        });

        it('should create single-node stack for dummy protocol', () => {
            const protocolConfig = configLoader.loadProtocolConfig('dummy');
            const envPath = path.join(sampleEnvPath, ".env-mainnet-single-node");
            const envConfig = configLoader.loadEnvironmentConfig(envPath);

            const deploymentConfig: DeploymentConfig = {
                protocol: protocolConfig,
                environment: envConfig
            };
            const stackName = configLoader.getStackName(deploymentConfig);
            const testUserDataScriptPath = path.join(__dirname, '../../assets/common/user-data-ubuntu.sh');

            const stack = stackFactory.createSingleNodeStack(app, deploymentConfig, stackName, {
                userDataScriptPath: testUserDataScriptPath
            });
            const template = Template.fromStack(stack);

            // Verify EC2 instance
            template.hasResourceProperties('AWS::EC2::Instance', {
                InstanceType: 't3.medium'
            });

            // Verify security group
            template.resourceCountIs('AWS::EC2::SecurityGroup', 1);

            // Verify IAM role
            template.resourceCountIs('AWS::IAM::Role', 1);
        });

        it('should create HA nodes stack for dummy protocol', () => {
            const protocolConfig = configLoader.loadProtocolConfig('dummy');
            const envPath = path.join(sampleEnvPath, ".env-testnet-ha-nodes");
            const envConfig = configLoader.loadEnvironmentConfig(envPath);

            const deploymentConfig: DeploymentConfig = {
                protocol: protocolConfig,
                environment: envConfig
            };
            const stackName = configLoader.getStackName(deploymentConfig);
            const testUserDataScriptPath = path.join(__dirname, '../../assets/common/user-data-ubuntu.sh');

            const stack = stackFactory.createHANodesStack(app, deploymentConfig, stackName, {
                userDataScriptPath: testUserDataScriptPath
            });
            const template = Template.fromStack(stack);

            // Verify Auto Scaling Group
            template.hasResourceProperties('AWS::AutoScaling::AutoScalingGroup', {
                DesiredCapacity: '3'
            });

            // Verify ALB
            template.resourceCountIs('AWS::ElasticLoadBalancingV2::LoadBalancer', 1);

            // Verify Target Group
            template.resourceCountIs('AWS::ElasticLoadBalancingV2::TargetGroup', 1);
        });

        it('should route to correct stack based on deployment mode', () => {
            const protocolConfig = configLoader.loadProtocolConfig('dummy');
            const testUserDataScriptPath = path.join(__dirname, '../../assets/common/user-data-ubuntu.sh');

            // Single node
            const singleNodeEnvPath = path.join(sampleEnvPath, ".env-mainnet-single-node");
            const singleNodeEnvConfig = configLoader.loadEnvironmentConfig(singleNodeEnvPath);
            const singleNodeConfig: DeploymentConfig = {
                protocol: protocolConfig,
                environment: singleNodeEnvConfig
            };
            const singleNodeStackName = configLoader.getStackName(singleNodeConfig);

            const singleNodeStack = stackFactory.createStack(app, singleNodeConfig, singleNodeStackName, {
                userDataScriptPath: testUserDataScriptPath
            });
            expect(singleNodeStack).toBeDefined();

            // HA nodes
            const haApp = new cdk.App();
            const haEnvPath = path.join(sampleEnvPath, ".env-testnet-ha-nodes");
            const haEnvConfig = configLoader.loadEnvironmentConfig(haEnvPath);
            const haConfig: DeploymentConfig = {
                protocol: protocolConfig,
                environment: haEnvConfig
            };
            const haStackName = configLoader.getStackName(haConfig);

            const haStack = stackFactory.createStack(haApp, haConfig, haStackName, {
                userDataScriptPath: testUserDataScriptPath
            });
            expect(haStack).toBeDefined();
        });
    });

    describe('Complete Application Flow', () => {
        it('should complete full single-node deployment flow', () => {
            // Step 1: Load protocol configuration
            const configLoader = new ConfigurationLoader(blueprintsPath);
            const protocolConfig = configLoader.loadProtocolConfig('dummy');
            expect(protocolConfig.BLOCKCHAIN_PROTOCOL).toBe('dummy');

            // Step 2: Load environment configuration
            const envPath = path.join(sampleEnvPath, ".env-mainnet-single-node");
            const envConfig = configLoader.loadEnvironmentConfig(envPath);
            expect(envConfig.DEPLOYMENT_MODE).toBe(DeploymentMode.SINGLE_NODE);

            // Step 3: Validate configuration
            const validationResult = configLoader.validateConfiguration(envConfig);
            expect(validationResult.isValid).toBe(true);

            // Step 4: Extract custom variables
            const customVars = configLoader.extractProtocolCustomEnvVars(protocolConfig, envConfig);
            expect(Object.keys(customVars).length).toBeGreaterThan(0);

            // Step 5: Create deployment configuration
            const deploymentConfig: DeploymentConfig = {
                protocol: protocolConfig,
                environment: envConfig
            };

            // Step 6: Create stack
            const app = new cdk.App();
            const stackFactory = new StackFactory();
            const stackName = configLoader.getStackName(deploymentConfig);
            const testUserDataScriptPath = path.join(__dirname, '../../assets/common/user-data-ubuntu.sh');
            const stack = stackFactory.createSingleNodeStack(app, deploymentConfig, stackName, {
                userDataScriptPath: testUserDataScriptPath
            });
            expect(stack).toBeDefined();

            // Step 7: Verify stack resources
            const template = Template.fromStack(stack);
            template.hasResourceProperties('AWS::EC2::Instance', {
                InstanceType: 't3.medium'
            });
        });

        it('should complete full HA deployment flow', () => {
            // Step 1: Load configurations
            const configLoader = new ConfigurationLoader(blueprintsPath);
            const protocolConfig = configLoader.loadProtocolConfig('dummy');
            const envPath = path.join(sampleEnvPath, ".env-testnet-ha-nodes");
            const envConfig = configLoader.loadEnvironmentConfig(envPath);

            expect(envConfig.DEPLOYMENT_MODE).toBe(DeploymentMode.HA_NODES);
            expect(envConfig.HA_CONFIG).toBeDefined();
            expect(envConfig.HA_CONFIG?.HA_NUMBER_OF_NODES).toBe(3);

            // Step 2: Validate configuration
            const validationResult = configLoader.validateConfiguration(envConfig);
            expect(validationResult.isValid).toBe(true);

            // Step 3: Create deployment configuration
            const deploymentConfig: DeploymentConfig = {
                protocol: protocolConfig,
                environment: envConfig
            };

            // Step 4: Create stack
            const app = new cdk.App();
            const stackFactory = new StackFactory();
            const stackName = configLoader.getStackName(deploymentConfig);
            const testUserDataScriptPath = path.join(__dirname, '../../assets/common/user-data-ubuntu.sh');
            const stack = stackFactory.createHANodesStack(app, deploymentConfig, stackName, {
                userDataScriptPath: testUserDataScriptPath
            });
            expect(stack).toBeDefined();

            // Step 5: Verify stack resources
            const template = Template.fromStack(stack);
            template.hasResourceProperties('AWS::AutoScaling::AutoScalingGroup', {
                DesiredCapacity: '3'
            });
            template.resourceCountIs('AWS::ElasticLoadBalancingV2::LoadBalancer', 1);
        });
    });

    describe('Error Handling', () => {
        it('should throw error for missing protocol', () => {
            const configLoader = new ConfigurationLoader(blueprintsPath);
            expect(() => configLoader.loadProtocolConfig('nonexistent')).toThrow();
        });

        it('should throw error for missing environment file', () => {
            const configLoader = new ConfigurationLoader(blueprintsPath);
            expect(() => configLoader.loadEnvironmentConfig('/nonexistent/path/.env')).toThrow();
        });

        it('should throw error for HA stack without HA configuration', () => {
            const configLoader = new ConfigurationLoader(blueprintsPath);
            const protocolConfig = configLoader.loadProtocolConfig('dummy');

            // Load single-node config (has default HA config)
            const envPath = path.join(sampleEnvPath, ".env-mainnet-single-node");
            const envConfig = configLoader.loadEnvironmentConfig(envPath);

            // Delete a required HA config field to trigger validation error
            delete (envConfig.HA_CONFIG as any).HA_NUMBER_OF_NODES;

            const deploymentConfig: DeploymentConfig = {
                protocol: protocolConfig,
                environment: envConfig
            };
            const stackName = configLoader.getStackName(deploymentConfig);

            const app = new cdk.App();
            const stackFactory = new StackFactory();
            const testUserDataScriptPath = path.join(__dirname, '../../assets/common/user-data-ubuntu.sh');

            // Should throw because HA config is invalid
            expect(() => stackFactory.createHANodesStack(app, deploymentConfig, stackName, {
                userDataScriptPath: testUserDataScriptPath
            })).toThrow(
                'Configuration validation for HA setup is failed'
            );
        });

        it('should validate configuration and report errors', () => {
            const configLoader = new ConfigurationLoader(blueprintsPath);

            // Create invalid config
            const invalidConfig = {
                AWS_ACCOUNT_ID: 'invalid', // Should be 12 digits
                AWS_REGION: '',
                BLOCKCHAIN_PROTOCOL: '',
                DEPLOYMENT_MODE: DeploymentMode.SINGLE_NODE,
                INSTANCE_TYPE: '',
                CPU_TYPE: 'x86_64' as any,
                DATA_VOLUMES_COUNT: 10, // Exceeds max of 6
                DATA_VOLUMES: [],
                CUSTOM_VARIABLES: {},
                HA_CONFIG: {
                    HA_NUMBER_OF_NODES: 2,
                    HA_ALB_HEALTHCHECK_PORT: 8545,
                    HA_ALB_HEALTHCHECK_PATH: '/',
                    HA_ALB_HEALTHCHECK_GRACE_PERIOD_MIN: 60,
                    HA_ALB_HEALTHCHECK_INTERVAL_SEC: 30,
                    HA_ALB_HEALTHCHECK_TIMEOUT_SEC: 5,
                    HA_ALB_HEALTHCHECK_HEALTHY_THRESHOLD: 3,
                    HA_ALB_HEALTHCHECK_UNHEALTHY_THRESHOLD: 2,
                    HA_NODES_HEARTBEAT_DELAY_MIN: 10,
                    HA_ALB_DEREGISTRATION_DELAY_SEC: 30,
                    HA_ALB_HEALTHCHECK_HTTP_CODES: '200', HA_ALB_INTERNET_FACING: false, HA_ALB_ALLOWED_CIDR: '', HA_ALB_CERTIFICATE_ARN: 'none'
                }
            };

            const validationResult = configLoader.validateConfiguration(invalidConfig as any);
            expect(validationResult.isValid).toBe(false);
            expect(validationResult.errors.length).toBeGreaterThan(0);
        });
    });

    describe('Dashboard Template Integration', () => {
    });

    describe('Assets Validation', () => {
        it('should validate common assets exist', () => {
            const requiredAssets = [
                'user-data-ubuntu.sh',
                'setup-storage.sh',
                'cfn-hup-setup.sh',
                'cw-agent.json'
            ];

            requiredAssets.forEach(asset => {
                const assetPath = path.join(assetsPath, asset);
                expect(fs.existsSync(assetPath)).toBe(true);
            });
        });

        it('should validate dummy protocol assets exist', () => {
            const nodeScriptPath = path.join(blueprintsPath, 'dummy', 'user-data', 'node.sh');
            expect(fs.existsSync(nodeScriptPath)).toBe(true);
        });
    });
});
