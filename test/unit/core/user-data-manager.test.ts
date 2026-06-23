// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import * as path from 'path';
import * as cdk from 'aws-cdk-lib';
import { UserDataManager } from '../../../lib/core/user-data-manager';
import { EnvironmentConfig, CFNandCDKUserDataConfig, DeploymentMode, CpuType } from '../../../lib/interfaces';

describe('UserDataManager', () => {
    let userDataManager: UserDataManager;
    const testUserDataScriptPath = path.join(__dirname, '../../../assets/common/user-data-ubuntu.sh');

    beforeEach(() => {
        userDataManager = new UserDataManager(testUserDataScriptPath);
    });

    describe('constructor', () => {
        it('should create instance with custom user data script path', () => {
            const manager = new UserDataManager(testUserDataScriptPath);
            expect(manager.getuserDataScriptPath()).toBe(testUserDataScriptPath);
        });

        it('should create instance with default path when not provided', () => {
            const manager = new UserDataManager();
            expect(manager.getuserDataScriptPath()).toContain('assets');
            expect(manager.getuserDataScriptPath()).toContain('common');
            expect(manager.getuserDataScriptPath()).toContain('user-data-ubuntu.sh');
        });

        it('should throw error when script file does not exist', () => {
            expect(() => {
                new UserDataManager('/nonexistent/path/script.sh');
            }).toThrow('User data script not found');
        });
    });

    describe('loadUserDataScript', () => {
        it('should load the user data script successfully', () => {
            const script = userDataManager.loadUserDataScript();

            expect(script).toBeDefined();
            expect(script.length).toBeGreaterThan(0);
            expect(script).toContain('#!/bin/bash');
        });

        it('should throw error when script file does not exist', () => {
            const invalidManager = new UserDataManager(testUserDataScriptPath);
            // Override the path to a non-existent file
            (invalidManager as any).userDataScriptPath = '/nonexistent/script.sh';

            expect(() => {
                invalidManager.loadUserDataScript();
            }).toThrow('Universal user data script not found');
        });

        it('should contain expected placeholder variables using CDK Fn.sub syntax', () => {
            const script = userDataManager.loadUserDataScript();

            // Variables should use ${VARIABLE_NAME} syntax, not ${_VARIABLE_NAME_}
            expect(script).toContain('${BLOCKCHAIN_PROTOCOL}');
            expect(script).toContain('${DEPLOYMENT_MODE}');
            expect(script).toContain('${AWS_REGION}');
            expect(script).toContain('${SNAPSHOT_ENABLED}');
            expect(script).toContain('${STACK_NAME}');
            expect(script).toContain('${COMMON_ASSETS_S3_PATH}');
            expect(script).toContain('${PROTOCOL_ASSETS_S3_PATH}');
            expect(script).toContain('##FLATTENED_CUSTOM_VARIABLES##');
            expect(script).toContain('##FLATTENED_DATA_VOLUMES##');
        });
    });

    describe('injectVariables', () => {
        let mockEnvironmentConfig: EnvironmentConfig;
        let mockCFNandCDKConfig: CFNandCDKUserDataConfig;

        beforeEach(() => {
            mockEnvironmentConfig = {
                AWS_ACCOUNT_ID: '123456789012',
                AWS_REGION: 'us-east-1',
                BLOCKCHAIN_PROTOCOL: 'ethereum',
                DEPLOYMENT_MODE: DeploymentMode.SINGLE_NODE,
                INSTANCE_TYPE: 't3.medium',
                CPU_TYPE: CpuType.X86_64,
                BC_NETWORK: 'mainnet',
                CLIENT_CONFIG: 'geth-lighthouse',
                CLIENT_VERSION: 'v1.14.12',
                SNAPSHOT_ENABLED: true,
                SNAPSHOT_DOWNLOAD_URL: 'https://snapshots.example.com/latest.tar.gz',
                DATA_VOLUMES_COUNT: 1,
                DATA_VOLUMES: [{
                    TYPE: 'gp3',
                    SIZE: 100,
                    IOPS: 3000,
                    THROUGHPUT: 125,
                    MOUNT_PATH: '/data',
                    DEVICE_NAME: '/dev/sdf'
                }],
                CUSTOM_VARIABLES: {
                    ETH_NETWORK: 'mainnet'
                },
                TRAFFIC_SHAPING_ENABLED: false,
                TRAFFIC_SHAPING_RATE_MBIT: 40,
                TRAFFIC_SHAPING_CHECK_INTERVAL_SEC: 60,
                TRAFFIC_SHAPING_MAX_BLOCKS_BEHIND: 10,
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

            mockCFNandCDKConfig = {
                STACK_NAME: 'test-stack',
                LOGICAL_RESOURCE_ID: 'resource-123',
                ASG_NAME: 'none',
                LIFECYCLE_HOOK_NAME: 'none',
                COMMON_ASSETS_S3_PATH: 's3://bucket/common/assets.zip',
                PROTOCOL_ASSETS_S3_PATH: 's3://bucket/ethereum/assets.zip',
                SNAPSHOT_STAGING_VOL_ID: 'none'
            };
        });

        it('should inject environment and CDK variables into script', () => {
            const script = 'Protocol: ${BLOCKCHAIN_PROTOCOL}, Region: ${AWS_REGION}, Stack: ${STACK_NAME}';
            
            const result = userDataManager.injectVariables(script, mockEnvironmentConfig, mockCFNandCDKConfig);

            // CDK Fn.sub returns a token, so we check the structure
            expect(result).toBeDefined();
            expect(typeof result).toBe('string');
        });

        it('should stringify first-level parameters', () => {
            const script = 'Count: ${DATA_VOLUMES_COUNT}, Enabled: ${SNAPSHOT_ENABLED}';
            
            const result = userDataManager.injectVariables(script, mockEnvironmentConfig, mockCFNandCDKConfig);

            expect(result).toBeDefined();
            expect(typeof result).toBe('string');
        });

        it('should convert objects to JSON', () => {
            const script = 'Volumes: ${DATA_VOLUMES}, Custom: ${CUSTOM_VARIABLES}';
            
            const result = userDataManager.injectVariables(script, mockEnvironmentConfig, mockCFNandCDKConfig);

            expect(result).toBeDefined();
            expect(typeof result).toBe('string');
        });

        it('should handle HA deployment configuration', () => {
            mockEnvironmentConfig.DEPLOYMENT_MODE = DeploymentMode.HA_NODES;
            mockEnvironmentConfig.HA_CONFIG = {
                HA_NUMBER_OF_NODES: 3,
                HA_ALB_HEALTHCHECK_PORT: 8545,
                HA_ALB_HEALTHCHECK_PATH: '/health',
                HA_ALB_HEALTHCHECK_GRACE_PERIOD_MIN: 60,
                HA_ALB_HEALTHCHECK_INTERVAL_SEC: 30,
                HA_ALB_HEALTHCHECK_TIMEOUT_SEC: 5,
                HA_ALB_HEALTHCHECK_HEALTHY_THRESHOLD: 3,
                HA_ALB_HEALTHCHECK_UNHEALTHY_THRESHOLD: 2,
                HA_NODES_HEARTBEAT_DELAY_MIN: 10,
                HA_ALB_DEREGISTRATION_DELAY_SEC: 30,
                    HA_ALB_HEALTHCHECK_HTTP_CODES: '200', HA_ALB_INTERNET_FACING: false, HA_ALB_ALLOWED_CIDR: '', HA_ALB_CERTIFICATE_ARN: 'none'
            };
            mockCFNandCDKConfig.LOGICAL_RESOURCE_ID = 'none';
            mockCFNandCDKConfig.ASG_NAME = 'test-asg';
            mockCFNandCDKConfig.LIFECYCLE_HOOK_NAME = 'test-hook';

            const script = 'Mode: ${DEPLOYMENT_MODE}, ASG: ${ASG_NAME}, Hook: ${LIFECYCLE_HOOK_NAME}';
            
            const result = userDataManager.injectVariables(script, mockEnvironmentConfig, mockCFNandCDKConfig);

            expect(result).toBeDefined();
            expect(typeof result).toBe('string');
        });

        it('should handle empty custom variables', () => {
            mockEnvironmentConfig.CUSTOM_VARIABLES = {};
            
            const script = 'Custom: ${CUSTOM_VARIABLES}';
            
            const result = userDataManager.injectVariables(script, mockEnvironmentConfig, mockCFNandCDKConfig);

            expect(result).toBeDefined();
            expect(typeof result).toBe('string');
        });

        it('should handle special characters in variable values', () => {
            mockEnvironmentConfig.SNAPSHOT_DOWNLOAD_URL = 'https://example.com/path?param=value&other=123';
            
            const script = 'URL: ${SNAPSHOT_DOWNLOAD_URL}';
            
            const result = userDataManager.injectVariables(script, mockEnvironmentConfig, mockCFNandCDKConfig);

            expect(result).toBeDefined();
            expect(typeof result).toBe('string');
        });

        it('should inject traffic shaping configuration variables', () => {
            mockEnvironmentConfig.TRAFFIC_SHAPING_ENABLED = true;
            mockEnvironmentConfig.TRAFFIC_SHAPING_RATE_MBIT = 40;
            mockEnvironmentConfig.TRAFFIC_SHAPING_CHECK_INTERVAL_SEC = 60;
            mockEnvironmentConfig.TRAFFIC_SHAPING_MAX_BLOCKS_BEHIND = 10;
            
            const script = 'Traffic Shaping: ${TRAFFIC_SHAPING_ENABLED}, Rate: ${TRAFFIC_SHAPING_RATE_MBIT}, Interval: ${TRAFFIC_SHAPING_CHECK_INTERVAL_SEC}, Max Behind: ${TRAFFIC_SHAPING_MAX_BLOCKS_BEHIND}';
            
            const result = userDataManager.injectVariables(script, mockEnvironmentConfig, mockCFNandCDKConfig);

            expect(result).toBeDefined();
            expect(typeof result).toBe('string');
        });

        describe('shell injection safety', () => {
            // Resolve the Fn::Sub token into [bodyTemplate, variablesMap] so we
            // can inspect the rendered shell text and the substitution values.
            const renderSub = (script: string, env: EnvironmentConfig): { body: string; vars: Record<string, string> } => {
                const result = userDataManager.injectVariables(script, env, mockCFNandCDKConfig);
                const stack = new cdk.Stack(new cdk.App(), 'ResolveStack');
                const resolved: any = stack.resolve(result);
                const sub = resolved['Fn::Sub'];
                return Array.isArray(sub) ? { body: sub[0], vars: sub[1] } : { body: sub, vars: {} };
            };

            it('single-quotes a malicious custom variable value so it cannot execute', () => {
                mockEnvironmentConfig.CUSTOM_VARIABLES = { ETH_EVIL: '$(touch /tmp/pwned)' };
                const { body } = renderSub('##FLATTENED_CUSTOM_VARIABLES##', mockEnvironmentConfig);

                // Emitted as a single-quoted literal, never as a bare expansion.
                expect(body).toContain("ETH_EVIL='$(touch /tmp/pwned)'");
                expect(body).not.toContain('ETH_EVIL=$(touch');
            });

            it('single-quotes values containing shell metacharacters (& ; | spaces)', () => {
                mockEnvironmentConfig.CUSTOM_VARIABLES = { ETH_X: 'a & b ; c | d `e`' };
                const { body } = renderSub('##FLATTENED_CUSTOM_VARIABLES##', mockEnvironmentConfig);

                expect(body).toContain("ETH_X='a & b ; c | d `e`'");
            });

            it('escapes embedded single quotes using the \'\\\'\' idiom', () => {
                mockEnvironmentConfig.CUSTOM_VARIABLES = { ETH_NAME: "O'Brien" };
                const { body } = renderSub('##FLATTENED_CUSTOM_VARIABLES##', mockEnvironmentConfig);

                // O'Brien -> 'O'\''Brien'
                expect(body).toContain("ETH_NAME='O'\\''Brien'");
            });

            it('single-quote-escapes Fn::Sub map values (e.g. URLs with & and quotes)', () => {
                mockEnvironmentConfig.SNAPSHOT_DOWNLOAD_URL = "https://x/snap?a=b&c=d'evil";
                const { vars } = renderSub('${SNAPSHOT_DOWNLOAD_URL}', mockEnvironmentConfig);

                // The map value is pre-escaped; the .sh wraps it as '${SNAPSHOT_DOWNLOAD_URL}'.
                expect(vars.SNAPSHOT_DOWNLOAD_URL).toBe("https://x/snap?a=b&c=d'\\''evil");
            });

            it('emits flattened data volume values as single-quoted lines', () => {
                const { body } = renderSub('##FLATTENED_DATA_VOLUMES##', mockEnvironmentConfig);
                expect(body).toContain("DATA_VOL_1_MOUNT_PATH='/data'");
                expect(body).toContain("DATA_VOL_1_TYPE='gp3'");
            });

            it('rejects an invalid (non-identifier) custom variable name', () => {
                mockEnvironmentConfig.CUSTOM_VARIABLES = { 'BAD NAME$': 'x' };
                expect(() => userDataManager.injectVariables('##FLATTENED_CUSTOM_VARIABLES##', mockEnvironmentConfig, mockCFNandCDKConfig))
                    .toThrow(/Invalid environment variable name/);
            });

            it('rejects a value containing a newline', () => {
                mockEnvironmentConfig.CUSTOM_VARIABLES = { ETH_MULTILINE: 'line1\nline2' };
                expect(() => userDataManager.injectVariables('##FLATTENED_CUSTOM_VARIABLES##', mockEnvironmentConfig, mockCFNandCDKConfig))
                    .toThrow(/must not contain newlines/);
            });

            it('renders no Fn::Sub references containing a dot (CloudFormation would misread them as resource attributes)', () => {
                // Regression guard: a literal "${...}" anywhere in the real user-data
                // script (e.g. in a comment) is parsed by Fn::Sub as a GetAtt-style
                // reference and fails deployment with
                //   "Template error: instance of Fn::Sub references invalid resource attribute".
                // Run the actual script (not a fragment) through injection and assert
                // no surviving ${...} placeholder contains a dot.
                const realScript = userDataManager.loadUserDataScript();
                const { body } = renderSub(realScript, mockEnvironmentConfig);
                const dottedRefs = [...body.matchAll(/\$\{([^}]*)\}/g)]
                    .map(m => m[1])
                    .filter(v => v.includes('.'));
                expect(dottedRefs).toEqual([]);
            });
        });
    });

    describe('getuserDataScriptPath', () => {
        it('should return the configured user data script path', () => {
            expect(userDataManager.getuserDataScriptPath()).toBe(testUserDataScriptPath);
        });
    });
});
