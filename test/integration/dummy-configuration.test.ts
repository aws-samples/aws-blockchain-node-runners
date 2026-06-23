// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import * as path from 'path';
import * as fs from 'fs';
import * as cdk from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import { ConfigurationLoader } from '../../lib/core/configuration-loader';
import { UserDataManager } from '../../lib/core/user-data-manager';
import { AssetsManager } from '../../lib/core/assets-manager';
import { StackFactory } from '../../lib/core/stack-factory';
import { DeploymentMode, DeploymentConfig } from '../../lib/interfaces';

describe('Dummy Protocol Configuration Integration Tests', () => {
    // Test with actual blueprints directory
    const blueprintsPath = path.join(__dirname, '../../blueprints');

    describe('Protocol Configuration Files', () => {
        it('should have valid package.json with aws-blockchain-node-runner field in blueprints/dummy/', () => {
            const pkgPath = path.join(blueprintsPath, 'dummy/package.json');
            expect(fs.existsSync(pkgPath)).toBe(true);

            const pkgContent = fs.readFileSync(pkgPath, 'utf8');
            const pkg = JSON.parse(pkgContent);

            expect(pkg['aws-blockchain-node-runner']).toBeDefined();
            const config = pkg['aws-blockchain-node-runner'];
            expect(config.BLOCKCHAIN_PROTOCOL).toBe('dummy');
            expect(config.customEnvVarsNamePrefix).toBe('DUMMY');
            expect(config.supportedDeploymentModes).toContain('single-node');
            expect(config.supportedDeploymentModes).toContain('ha-nodes');
        });

        it('should have valid sample .env-testnet-ha-nodes file', () => {
            const envPath = path.join(blueprintsPath, 'dummy/samples/.env-testnet-ha-nodes');
            expect(fs.existsSync(envPath)).toBe(true);

            const envContent = fs.readFileSync(envPath, 'utf8');
            expect(envContent).toContain('BLOCKCHAIN_PROTOCOL="dummy"');
            expect(envContent).toContain('DUMMY_NODE_TYPE');
            expect(envContent).toContain('DUMMY_SYNC_MODE');
        });

        it('should have valid user-data/node.sh script', () => {
            const scriptPath = path.join(blueprintsPath, 'dummy/user-data/node.sh');
            expect(fs.existsSync(scriptPath)).toBe(true);

            const scriptContent = fs.readFileSync(scriptPath, 'utf8');
            expect(scriptContent).toContain('#!/bin/bash');
            expect(scriptContent).toContain('CLIENT_CONFIG');
            expect(scriptContent).toContain('/opt/blueprints/configurations/');
        });

        it('should have README.md documentation', () => {
            const readmePath = path.join(blueprintsPath, 'dummy/README.md');
            expect(fs.existsSync(readmePath)).toBe(true);

            const readmeContent = fs.readFileSync(readmePath, 'utf8');
            expect(readmeContent).toContain('Dummy Protocol');
            expect(readmeContent).toContain('Setup Instructions');
            expect(readmeContent).toContain('FAQ');
        });
    });

    describe('ConfigurationLoader with Dummy Protocol', () => {
        let configLoader: ConfigurationLoader;

        beforeEach(() => {
            configLoader = new ConfigurationLoader(blueprintsPath);
        });

        it('should load dummy protocol configuration from blueprints directory', () => {
            const config = configLoader.loadProtocolConfig('dummy');

            expect(config.BLOCKCHAIN_PROTOCOL).toBe('dummy');
            expect(config.customEnvVarsNamePrefix).toBe('DUMMY');
            expect(config.BC_NETWORKS).toContain('testnet');
            expect(config.BC_NETWORKS).toContain('mainnet');
            expect(config.BC_NETWORKS).toContain('devnet');
            expect(config.defaultConfiguration).toBe('dummy-1.0.0-rpc-base.sh');
            expect(config.availableConfigurations).toHaveLength(2);
        });

        it('should validate dummy protocol configuration structure', () => {
            const config = configLoader.loadProtocolConfig('dummy');

            // Validate required fields
            expect(config.requiredPorts).toBeDefined();
            expect(config.monitoring).toBeDefined();
            expect(config.storage).toBeDefined();
            expect(config.monitoring.healthCheckPath).toBe('/health');
            expect(config.monitoring.metricsPort).toBe(8545);
        });

        it('should validate dummy-base configuration exists', () => {
            const result = configLoader.validateProtocolConfiguration('dummy', 'dummy-1.0.0-rpc-base.sh');
            expect(result.isValid).toBe(true);
            expect(result.errors).toHaveLength(0);
        });

        it('should validate dummy-extended configuration exists', () => {
            const result = configLoader.validateProtocolConfiguration('dummy', 'dummy-1.0.0-rpc-extended.sh');
            expect(result.isValid).toBe(true);
            expect(result.errors).toHaveLength(0);
        });

        it('should extract custom environment variables with DUMMY prefix', () => {
            const protocolConfig = configLoader.loadProtocolConfig('dummy');

            // Use protocol sample configs for environment config
            const sampleLoader = new ConfigurationLoader(blueprintsPath);
            const envPath = path.join(__dirname, '../../blueprints/dummy/samples/.env-mainnet-single-node');
            const envConfig = sampleLoader.loadEnvironmentConfig(envPath);

            const customVars = configLoader.extractProtocolCustomEnvVars(protocolConfig, envConfig);

            expect(customVars.DUMMY_NODE_TYPE).toBeDefined();
            expect(customVars.DUMMY_SYNC_MODE).toBeDefined();
        });
    });

    describe('UserDataManager with Dummy Protocol', () => {
        it('should load user data script successfully', () => {
            const testUserDataScriptPath = path.join(__dirname, '../../assets/common/user-data-ubuntu.sh');
            const userDataManager = new UserDataManager(testUserDataScriptPath);

            const script = userDataManager.loadUserDataScript();

            // The script should contain CDK Fn.sub placeholders
            expect(script).toContain('#!/bin/bash');
            expect(script).toContain('${BLOCKCHAIN_PROTOCOL}');
            expect(script).toContain('${DEPLOYMENT_MODE}');
            expect(script).toContain('${AWS_REGION}');
        });
    });

    describe('AssetsManager with Dummy Protocol', () => {
        let assetsManager: AssetsManager;
        let app: cdk.App;
        let stack: cdk.Stack;

        beforeEach(() => {
            app = new cdk.App();
            stack = new cdk.Stack(app, 'TestStack', {
                env: { account: '123456789012', region: 'us-east-1' }
            });
            assetsManager = new AssetsManager(stack, blueprintsPath);
        });

        it('should validate dummy protocol assets exist', () => {
            const isValid = assetsManager.validateProtocolAssets('dummy');
            expect(isValid).toBe(true);
        });

        it('should get correct protocol assets path', () => {
            const assetsPath = assetsManager.getProtocolAssetssPath('dummy');
            expect(assetsPath).toContain('aws-bnr-blueprint-dummy');
        });
    });

    describe('StackFactory with Dummy Protocol', () => {
        let app: cdk.App;
        let configLoader: ConfigurationLoader;
        let deploymentConfig: DeploymentConfig;

        beforeEach(() => {
            app = new cdk.App();
            configLoader = new ConfigurationLoader(blueprintsPath);

            const protocolConfig = configLoader.loadProtocolConfig('dummy');
            const envPath = path.join(__dirname, '../../blueprints/dummy/samples/.env-mainnet-single-node');
            const environmentConfig = configLoader.loadEnvironmentConfig(envPath);

            deploymentConfig = {
                protocol: protocolConfig,
                environment: environmentConfig
            };
        });

        it('should create single-node stack for dummy protocol', () => {
            const stackFactory = new StackFactory();
            const stackName = configLoader.getStackName(deploymentConfig);
            const testUserDataScriptPath = path.join(__dirname, '../../assets/common/user-data-ubuntu.sh');
            const stack = stackFactory.createSingleNodeStack(app, deploymentConfig, stackName, {
                userDataScriptPath: testUserDataScriptPath
            });

            expect(stack).toBeDefined();

            const template = Template.fromStack(stack);

            // Verify EC2 instance is created
            template.hasResourceProperties('AWS::EC2::Instance', {
                InstanceType: 't3.medium'
            });

            // Verify security group is created
            template.resourceCountIs('AWS::EC2::SecurityGroup', 1);
        });

        it('should create HA nodes stack for dummy protocol', () => {
            // Load HA configuration
            const haEnvPath = path.join(__dirname, '../../blueprints/dummy/samples/.env-testnet-ha-nodes');
            const haEnvironmentConfig = configLoader.loadEnvironmentConfig(haEnvPath);

            const haDeploymentConfig: DeploymentConfig = {
                protocol: deploymentConfig.protocol,
                environment: haEnvironmentConfig
            };

            const stackFactory = new StackFactory();
            const stackName = configLoader.getStackName(haDeploymentConfig);
            const testUserDataScriptPath = path.join(__dirname, '../../assets/common/user-data-ubuntu.sh');
            const stack = stackFactory.createHANodesStack(app, haDeploymentConfig, stackName, {
                userDataScriptPath: testUserDataScriptPath
            });

            expect(stack).toBeDefined();

            const template = Template.fromStack(stack);

            // Verify Auto Scaling Group is created
            template.hasResourceProperties('AWS::AutoScaling::AutoScalingGroup', {
                DesiredCapacity: '3'
            });

            // Verify ALB is created
            template.resourceCountIs('AWS::ElasticLoadBalancingV2::LoadBalancer', 1);
        });

        it('should route to correct stack based on deployment mode', () => {
            const stackFactory = new StackFactory();
            const testUserDataScriptPath = path.join(__dirname, '../../assets/common/user-data-ubuntu.sh');

            // Single node mode
            const singleNodeStackName = configLoader.getStackName(deploymentConfig);
            const singleNodeStack = stackFactory.createStack(app, deploymentConfig, singleNodeStackName, {
                userDataScriptPath: testUserDataScriptPath
            });
            expect(singleNodeStack).toBeDefined();

            // HA mode
            const haEnvPath = path.join(__dirname, '../../blueprints/dummy/samples/.env-testnet-ha-nodes');
            const haEnvironmentConfig = configLoader.loadEnvironmentConfig(haEnvPath);
            const haDeploymentConfig: DeploymentConfig = {
                protocol: deploymentConfig.protocol,
                environment: haEnvironmentConfig
            };

            const haApp = new cdk.App();
            const haStackName = configLoader.getStackName(haDeploymentConfig);
            const haStack = stackFactory.createStack(haApp, haDeploymentConfig, haStackName, {
                userDataScriptPath: testUserDataScriptPath
            });
            expect(haStack).toBeDefined();
        });
    });

    describe('End-to-End Configuration Flow', () => {
        it('should complete full configuration flow for single-node deployment', () => {
            // Step 1: Load protocol configuration
            const configLoader = new ConfigurationLoader(blueprintsPath);
            const protocolConfig = configLoader.loadProtocolConfig('dummy');
            expect(protocolConfig.BLOCKCHAIN_PROTOCOL).toBe('dummy');

            // Step 2: Load environment configuration
            const envPath = path.join(__dirname, '../../blueprints/dummy/samples/.env-mainnet-single-node');
            const envConfig = configLoader.loadEnvironmentConfig(envPath);
            expect(envConfig.DEPLOYMENT_MODE).toBe(DeploymentMode.SINGLE_NODE);

            // Step 3: Validate configuration
            const validationResult = configLoader.validateConfiguration(envConfig);
            expect(validationResult.isValid).toBe(true);

            // Step 4: Extract custom variables
            const customVars = configLoader.extractProtocolCustomEnvVars(protocolConfig, envConfig);
            expect(customVars.DUMMY_NODE_TYPE).toBeDefined();

            // Step 5: Create stack
            const app = new cdk.App();
            const deploymentConfig: DeploymentConfig = {
                protocol: protocolConfig,
                environment: envConfig
            };
            const stackFactory = new StackFactory();
            const stackName = configLoader.getStackName(deploymentConfig);
            const testUserDataScriptPath = path.join(__dirname, '../../assets/common/user-data-ubuntu.sh');
            const stack = stackFactory.createSingleNodeStack(app, deploymentConfig, stackName, {
                userDataScriptPath: testUserDataScriptPath
            });
            expect(stack).toBeDefined();

            // Step 6: Verify stack resources
            const template = Template.fromStack(stack);
            template.hasResourceProperties('AWS::EC2::Instance', {
                InstanceType: 't3.medium'
            });
        });

        it('should complete full configuration flow for HA deployment', () => {
            // Step 1: Load protocol configuration
            const configLoader = new ConfigurationLoader(blueprintsPath);
            const protocolConfig = configLoader.loadProtocolConfig('dummy');

            // Step 2: Load HA environment configuration
            const envPath = path.join(__dirname, '../../blueprints/dummy/samples/.env-testnet-ha-nodes');
            const envConfig = configLoader.loadEnvironmentConfig(envPath);
            expect(envConfig.DEPLOYMENT_MODE).toBe(DeploymentMode.HA_NODES);
            expect(envConfig.HA_CONFIG).toBeDefined();
            expect(envConfig.HA_CONFIG?.HA_NUMBER_OF_NODES).toBe(3);

            // Step 3: Validate configuration
            const validationResult = configLoader.validateConfiguration(envConfig);
            expect(validationResult.isValid).toBe(true);

            // Step 4: Create stack
            const app = new cdk.App();
            const deploymentConfig: DeploymentConfig = {
                protocol: protocolConfig,
                environment: envConfig
            };
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

    describe('Custom Environment Variables', () => {
        it('should correctly parse DUMMY_ prefixed variables', () => {
            const configLoader = new ConfigurationLoader(blueprintsPath);
            const protocolConfig = configLoader.loadProtocolConfig('dummy');

            // Verify custom env vars are defined in protocol config
            expect(protocolConfig.customEnvVars).toBeDefined();
            expect(protocolConfig.customEnvVars).toContain('DUMMY_NODE_TYPE=validator');
            expect(protocolConfig.customEnvVars).toContain('DUMMY_SYNC_MODE=fast');
            expect(protocolConfig.customEnvVars).toContain('DUMMY_LOG_LEVEL=info');
        });

        it('should use default values when custom variables not provided', () => {
            const configLoader = new ConfigurationLoader(blueprintsPath);
            const protocolConfig = configLoader.loadProtocolConfig('dummy');

            // Create minimal environment config without custom vars
            const envConfig = {
                AWS_ACCOUNT_ID: '123456789012',
                AWS_REGION: 'us-east-1',
                BLOCKCHAIN_PROTOCOL: 'dummy',
                DEPLOYMENT_MODE: DeploymentMode.SINGLE_NODE,
                INSTANCE_TYPE: 't3.medium',
                CPU_TYPE: 'x86_64' as any,
                BC_NETWORK: 'testnet',
                CLIENT_CONFIG: 'dummy-base',
                CLIENT_VERSION: 'v1.0.0',
                SNAPSHOT_ENABLED: false,
                DATA_VOLUMES_COUNT: 1,
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

            const customVars = configLoader.extractProtocolCustomEnvVars(protocolConfig, envConfig as any);

            // Should use defaults from protocol config
            expect(customVars.DUMMY_NODE_TYPE).toBe('validator');
            expect(customVars.DUMMY_SYNC_MODE).toBe('fast');
            expect(customVars.DUMMY_LOG_LEVEL).toBe('info');
        });
    });
});
