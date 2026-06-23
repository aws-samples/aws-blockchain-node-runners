// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import * as path from 'path';
import { UserDataManager } from '../../../lib/core/user-data-manager';
import { ConfigurationLoader } from '../../../lib/core/configuration-loader';
import { ProtocolConfig, EnvironmentConfig, CFNandCDKUserDataConfig } from '../../../lib/interfaces';

/**
 * Integration tests for UserDataManager that test the component
 * with actual assets and configuration files.
 */
describe('UserDataManager Integration', () => {
    let userDataManager: UserDataManager;
    let configLoader: ConfigurationLoader;

    // Use actual assets path for integration tests
    const actualUserDataScriptPath = path.join(process.cwd(), 'assets', 'common', 'user-data-ubuntu.sh');
    const testBlueprintsPath = path.join(__dirname, '../../../blueprints');

    beforeEach(() => {
        userDataManager = new UserDataManager(actualUserDataScriptPath);
        configLoader = new ConfigurationLoader(testBlueprintsPath);
    });

    describe('with actual assets', () => {
        it('should load the actual user data script', () => {
            const script = userDataManager.loadUserDataScript();

            expect(script).toBeDefined();
            expect(script).toContain('#!/bin/bash');
            expect(script).toContain('cdk_environment');
            expect(script).toContain('CloudWatch Agent');
        });

        it('should inject variables using CDK Fn.sub format', () => {
            const mockEnvironmentConfig: EnvironmentConfig = {
                AWS_ACCOUNT_ID: '123456789012',
                AWS_REGION: 'us-east-1',
                BLOCKCHAIN_PROTOCOL: 'dummy',
                DEPLOYMENT_MODE: 'single-node' as any,
                INSTANCE_TYPE: 't3.medium',
                CPU_TYPE: 'x86_64' as any,
                BC_NETWORK: 'testnet',
                CLIENT_CONFIG: 'dummy-base',
                CLIENT_VERSION: 'v1.0.0',
                SNAPSHOT_ENABLED: true,
                SNAPSHOT_DOWNLOAD_URL: 'https://snapshots.dummy.org/testnet/latest.tar.gz',
                TRAFFIC_SHAPING_ENABLED: false,
                TRAFFIC_SHAPING_RATE_MBIT: 40,
                TRAFFIC_SHAPING_CHECK_INTERVAL_SEC: 60,
                TRAFFIC_SHAPING_MAX_BLOCKS_BEHIND: 10,
                DATA_VOLUMES_COUNT: 1,
                DATA_VOLUMES: [],
                CUSTOM_VARIABLES: {
                    DUMMY_NODE_TYPE: 'validator',
                    DUMMY_SYNC_MODE: 'fast'
                },
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

            const mockCFNandCDKConfig: CFNandCDKUserDataConfig = {
                STACK_NAME: 'dummy-single-node',
                LOGICAL_RESOURCE_ID: 'DummyNode',
                ASG_NAME: 'none',
                LIFECYCLE_HOOK_NAME: 'none',
                COMMON_ASSETS_S3_PATH: 's3://cdk-assets-bucket/common.zip',
                PROTOCOL_ASSETS_S3_PATH: 's3://cdk-assets-bucket/dummy.zip',
                SNAPSHOT_STAGING_VOL_ID: 'none'
            };

            const script = userDataManager.loadUserDataScript();
            const processedScript = userDataManager.injectVariables(script, mockEnvironmentConfig, mockCFNandCDKConfig);

            // CDK Fn.sub returns a token, so we verify it's a string
            expect(processedScript).toBeDefined();
            expect(typeof processedScript).toBe('string');
        });
    });

    describe('with configuration loader', () => {
        it('should work with environment configuration from protocol samples', () => {
            const envPath = path.join(__dirname, '../../../blueprints/dummy/samples/.env-mainnet-single-node');
            const envConfig = configLoader.loadEnvironmentConfig(envPath);
            const protocolConfig = configLoader.loadProtocolConfig(envConfig.BLOCKCHAIN_PROTOCOL);

            // Build CDK config
            const cfnandCDKConfig: CFNandCDKUserDataConfig = {
                STACK_NAME: `${envConfig.BLOCKCHAIN_PROTOCOL}-${envConfig.DEPLOYMENT_MODE}`,
                LOGICAL_RESOURCE_ID: 'TestNode',
                ASG_NAME: 'none',
                LIFECYCLE_HOOK_NAME: 'none',
                COMMON_ASSETS_S3_PATH: 's3://test-bucket/common.zip',
                PROTOCOL_ASSETS_S3_PATH: `s3://test-bucket/${envConfig.BLOCKCHAIN_PROTOCOL}.zip`,
                SNAPSHOT_STAGING_VOL_ID: 'none'
            };

            const script = userDataManager.loadUserDataScript();
            const processedScript = userDataManager.injectVariables(script, envConfig, cfnandCDKConfig);

            expect(processedScript).toBeDefined();
            expect(typeof processedScript).toBe('string');
        });

        it('should work with HA deployment configuration', () => {
            const envPath = path.join(__dirname, '../../../blueprints/dummy/samples/.env-testnet-ha-nodes');
            const envConfig = configLoader.loadEnvironmentConfig(envPath);
            const protocolConfig = configLoader.loadProtocolConfig(envConfig.BLOCKCHAIN_PROTOCOL);

            // Build CDK config for HA mode
            const cfnandCDKConfig: CFNandCDKUserDataConfig = {
                STACK_NAME: `${envConfig.BLOCKCHAIN_PROTOCOL}-${envConfig.DEPLOYMENT_MODE}`,
                LOGICAL_RESOURCE_ID: 'none',
                ASG_NAME: `${envConfig.BLOCKCHAIN_PROTOCOL}-asg`,
                LIFECYCLE_HOOK_NAME: `${envConfig.BLOCKCHAIN_PROTOCOL}-lifecycle-hook`,
                COMMON_ASSETS_S3_PATH: 's3://test-bucket/common.zip',
                PROTOCOL_ASSETS_S3_PATH: `s3://test-bucket/${envConfig.BLOCKCHAIN_PROTOCOL}.zip`,
                SNAPSHOT_STAGING_VOL_ID: 'none'
            };

            const script = userDataManager.loadUserDataScript();
            const processedScript = userDataManager.injectVariables(script, envConfig, cfnandCDKConfig);

            expect(processedScript).toBeDefined();
            expect(typeof processedScript).toBe('string');
        });
    });

    describe('script content validation', () => {
        it('should produce valid bash script structure', () => {
            const mockEnvironmentConfig: EnvironmentConfig = {
                AWS_ACCOUNT_ID: '123456789012',
                AWS_REGION: 'us-east-1',
                BLOCKCHAIN_PROTOCOL: 'test',
                DEPLOYMENT_MODE: 'single-node' as any,
                INSTANCE_TYPE: 't3.medium',
                CPU_TYPE: 'x86_64' as any,
                BC_NETWORK: 'testnet',
                CLIENT_CONFIG: 'test-base',
                CLIENT_VERSION: 'v1.0.0',
                SNAPSHOT_ENABLED: false,
                TRAFFIC_SHAPING_ENABLED: false,
                TRAFFIC_SHAPING_RATE_MBIT: 40,
                TRAFFIC_SHAPING_CHECK_INTERVAL_SEC: 60,
                TRAFFIC_SHAPING_MAX_BLOCKS_BEHIND: 10,
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

            const mockCFNandCDKConfig: CFNandCDKUserDataConfig = {
                STACK_NAME: 'test-stack',
                LOGICAL_RESOURCE_ID: 'none',
                ASG_NAME: 'none',
                LIFECYCLE_HOOK_NAME: 'none',
                COMMON_ASSETS_S3_PATH: 'none',
                PROTOCOL_ASSETS_S3_PATH: 'none',
                SNAPSHOT_STAGING_VOL_ID: 'none'
            };

            const script = userDataManager.loadUserDataScript();

            // Verify bash script structure
            expect(script.startsWith('#!/bin/bash')).toBe(true);

            // Verify environment file creation
            expect(script).toContain('/etc/cdk_environment');
            expect(script).toContain('chmod 600');

            // Verify source command
            expect(script).toContain('source /etc/cdk_environment');
        });

        it('should handle special characters in snapshot URL', () => {
            const mockEnvironmentConfig: EnvironmentConfig = {
                AWS_ACCOUNT_ID: '123456789012',
                AWS_REGION: 'us-east-1',
                BLOCKCHAIN_PROTOCOL: 'ethereum',
                DEPLOYMENT_MODE: 'single-node' as any,
                INSTANCE_TYPE: 't3.medium',
                CPU_TYPE: 'x86_64' as any,
                BC_NETWORK: 'mainnet',
                CLIENT_CONFIG: 'geth-lighthouse',
                CLIENT_VERSION: 'v1.14.12',
                SNAPSHOT_ENABLED: true,
                SNAPSHOT_DOWNLOAD_URL: 'https://snapshots.example.com/mainnet/latest.tar.lz4?token=abc123&version=2',
                TRAFFIC_SHAPING_ENABLED: false,
                TRAFFIC_SHAPING_RATE_MBIT: 40,
                TRAFFIC_SHAPING_CHECK_INTERVAL_SEC: 60,
                TRAFFIC_SHAPING_MAX_BLOCKS_BEHIND: 10,
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

            const mockCFNandCDKConfig: CFNandCDKUserDataConfig = {
                STACK_NAME: 'eth-stack',
                LOGICAL_RESOURCE_ID: 'none',
                ASG_NAME: 'none',
                LIFECYCLE_HOOK_NAME: 'none',
                COMMON_ASSETS_S3_PATH: 's3://bucket/common.zip',
                PROTOCOL_ASSETS_S3_PATH: 's3://bucket/eth.zip',
                SNAPSHOT_STAGING_VOL_ID: 'none'
            };

            const script = userDataManager.loadUserDataScript();
            const processedScript = userDataManager.injectVariables(script, mockEnvironmentConfig, mockCFNandCDKConfig);

            expect(processedScript).toBeDefined();
            expect(typeof processedScript).toBe('string');
        });
    });
});
