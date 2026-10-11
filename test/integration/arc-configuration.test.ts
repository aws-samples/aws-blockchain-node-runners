// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import * as fs from 'fs';
import * as path from 'path';
import { ConfigurationLoader } from '../../lib/core/configuration-loader';
import { DeploymentMode } from '../../lib/interfaces/enums';

const BLUEPRINT = path.join(__dirname, '../../blueprints/arc');
const CONFIG = 'arc-execution-0.8.1-arc-consensus-0.8.1-full.yml';
const SAMPLES: Array<{ file: string; network: string; mode: DeploymentMode }> = [
    { file: '.env-testnet-arc-execution-arc-consensus-full', network: 'testnet', mode: DeploymentMode.SINGLE_NODE },
    { file: '.env-mainnet-arc-execution-arc-consensus-full', network: 'mainnet', mode: DeploymentMode.SINGLE_NODE },
    { file: '.env-mainnet-arc-execution-arc-consensus-full-ha', network: 'mainnet', mode: DeploymentMode.HA_NODES },
];

describe('Arc Protocol Configuration', () => {
    let configLoader: ConfigurationLoader;

    beforeEach(() => {
        configLoader = new ConfigurationLoader('blueprints');
    });

    describe('Protocol Configuration', () => {
        it('should load the Arc protocol configuration', () => {
            const protocolConfig = configLoader.loadProtocolConfig('arc');

            expect(protocolConfig.BLOCKCHAIN_PROTOCOL).toBe('arc');
            expect(protocolConfig.supportedDeploymentModes).toContain(DeploymentMode.SINGLE_NODE);
            expect(protocolConfig.supportedDeploymentModes).toContain(DeploymentMode.HA_NODES);
            expect(protocolConfig.BC_NETWORKS).toEqual(['mainnet', 'testnet']);
        });

        it('should default to the pinned client configuration', () => {
            const protocolConfig = configLoader.loadProtocolConfig('arc');

            expect(protocolConfig.defaultConfiguration).toBe(CONFIG);
            expect(protocolConfig.availableConfigurations.map(c => c.name)).toContain(CONFIG);
        });

        it('should expose only VPC-internal RPC and WebSocket ports', () => {
            const protocolConfig = configLoader.loadProtocolConfig('arc');

            expect(protocolConfig.requiredPorts.map(p => p.port).sort()).toEqual([8545, 8546]);
            protocolConfig.requiredPorts.forEach(p => {
                expect(p.protocol).toBe('tcp');
                expect(p.public).toBe(false);
            });
        });

        it('should use the ARC custom variable prefix', () => {
            const protocolConfig = configLoader.loadProtocolConfig('arc');

            expect(protocolConfig.customEnvVarsNamePrefix).toBe('ARC');
        });

        it('should monitor both clients', () => {
            const protocolConfig = configLoader.loadProtocolConfig('arc');

            expect(protocolConfig.monitoring.clientNames).toEqual(['arc-execution', 'arc-consensus']);
        });
    });

    describe.each(SAMPLES)('Sample $file', ({ file, network, mode }) => {
        const envPath = path.join(BLUEPRINT, 'samples', file);

        it('should load with the expected network, mode and client configuration', () => {
            const envConfig = configLoader.loadEnvironmentConfig(envPath);

            expect(envConfig.BLOCKCHAIN_PROTOCOL).toBe('arc');
            expect(envConfig.BC_NETWORK).toBe(network);
            expect(envConfig.DEPLOYMENT_MODE).toBe(mode);
            expect(envConfig.CLIENT_CONFIG).toBe(CONFIG);
        });

        it('should pass configuration validation apart from the account ID placeholder', () => {
            // Samples ship the repo-wide AWS_ACCOUNT_ID placeholder; users set
            // their own. Every other validation rule must pass. (The stand-in ID
            // is built at runtime so git-secrets does not flag a literal.)
            const envConfig = configLoader.loadEnvironmentConfig(envPath);
            const result = configLoader.validateConfiguration({ ...envConfig, AWS_ACCOUNT_ID: '1'.repeat(12) });

            expect(result.errors).toEqual([]);
            expect(result.isValid).toBe(true);
        });

        it('should use a supported network and an available client configuration', () => {
            const protocolConfig = configLoader.loadProtocolConfig('arc');
            const envConfig = configLoader.loadEnvironmentConfig(envPath);

            expect(protocolConfig.BC_NETWORKS).toContain(envConfig.BC_NETWORK);
            expect(protocolConfig.availableConfigurations.some(c => c.name === envConfig.CLIENT_CONFIG)).toBe(true);
        });

        it('should provision at least the 1000 GiB Arc requires', () => {
            const envConfig = configLoader.loadEnvironmentConfig(envPath);
            const dataVol = envConfig.DATA_VOLUMES.find(v => v.MOUNT_PATH === '/data');

            expect(dataVol).toBeDefined();
            expect(dataVol!.SIZE).toBeGreaterThanOrEqual(1000);
        });

        it('should leave the framework S3 snapshot restore disabled', () => {
            const envConfig = configLoader.loadEnvironmentConfig(envPath);

            expect(envConfig.SNAPSHOT_ENABLED).toBe(false);
        });
    });

    describe('HA sample', () => {
        it('should health-check the RPC port and accept the EL reply to a plain GET', () => {
            const envPath = path.join(BLUEPRINT, 'samples', '.env-mainnet-arc-execution-arc-consensus-full-ha');
            const envConfig = configLoader.loadEnvironmentConfig(envPath);

            expect(configLoader.validateHAConfigVariables(envConfig).isValid).toBe(true);
            expect(envConfig.HA_CONFIG!.HA_ALB_HEALTHCHECK_PORT).toBe(8545);
            expect(envConfig.HA_CONFIG!.HA_ALB_HEALTHCHECK_HTTP_CODES).toContain('405');
        });
    });

    describe('Blueprint files', () => {
        it('should ship the required files', () => {
            ['package.json', 'README.md', 'user-data/node.sh', 'user-data/common/prepare-arc.sh'].forEach(f => {
                expect(fs.existsSync(path.join(BLUEPRINT, f))).toBe(true);
            });
        });

        it('should have a file for every available configuration', () => {
            const protocolConfig = configLoader.loadProtocolConfig('arc');

            protocolConfig.availableConfigurations.forEach(config => {
                expect(fs.existsSync(path.join(BLUEPRINT, 'configurations', config.name))).toBe(true);
            });
        });

        it('should pin both client images to the configuration version', () => {
            const compose = fs.readFileSync(path.join(BLUEPRINT, 'configurations', CONFIG), 'utf8');

            expect(compose).toMatch(/arc-execution:0\.8\.1\b/);
            expect(compose).toMatch(/arc-consensus:0\.8\.1\b/);
            expect(compose).not.toMatch(/:latest\b/);
        });
    });
});
