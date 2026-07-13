// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import * as path from 'path';
import { ConfigurationLoader } from '../../lib/core/configuration-loader';
import { DeploymentMode } from '../../lib/interfaces/enums';

describe('Ethereum Protocol Configuration', () => {
    let configLoader: ConfigurationLoader;

    beforeEach(() => {
        configLoader = new ConfigurationLoader('blueprints');
    });

    describe('Protocol Configuration', () => {
        it('should load Ethereum protocol configuration', () => {
            const protocolConfig = configLoader.loadProtocolConfig('ethereum');

            expect(protocolConfig.BLOCKCHAIN_PROTOCOL).toBe('ethereum');
            expect(protocolConfig.supportedDeploymentModes).toContain(DeploymentMode.SINGLE_NODE);
            expect(protocolConfig.supportedDeploymentModes).toContain(DeploymentMode.HA_NODES);
        });

        it('should have correct network options', () => {
            const protocolConfig = configLoader.loadProtocolConfig('ethereum');

            expect(protocolConfig.BC_NETWORKS).toContain('mainnet');
            expect(protocolConfig.BC_NETWORKS).toContain('sepolia');
            expect(protocolConfig.BC_NETWORKS).toContain('holesky');
        });

        it('should have multiple client configurations', () => {
            const protocolConfig = configLoader.loadProtocolConfig('ethereum');

            expect(protocolConfig.availableConfigurations.length).toBeGreaterThan(0);

            const gethLighthouse = protocolConfig.availableConfigurations.find(
                c => c.name === 'geth-1.17.4-lighthouse-8.2.0-full.yml'
            );
            expect(gethLighthouse).toBeDefined();
        });

        it('should have correct port configuration', () => {
            const protocolConfig = configLoader.loadProtocolConfig('ethereum');

            const rpcPort = protocolConfig.requiredPorts.find(p => p.port === 8545);
            expect(rpcPort).toBeDefined();
            expect(rpcPort?.protocol).toBe('tcp');
            expect(rpcPort?.description).toBe('JSON RPC');

            const p2pPort = protocolConfig.requiredPorts.find(p => p.port === 30303);
            expect(p2pPort).toBeDefined();
        });

        it('should have custom environment variables', () => {
            const protocolConfig = configLoader.loadProtocolConfig('ethereum');

            expect(protocolConfig.customEnvVarsNamePrefix).toBe('ETH');
            expect(protocolConfig.customEnvVars).toContain('ETH_CONSENSUS_CHECKPOINT_SYNC_URL=https://beaconstate.info');
        });

        it('should have monitoring configuration for dual clients', () => {
            const protocolConfig = configLoader.loadProtocolConfig('ethereum');

            expect(protocolConfig.monitoring.healthCheckPath).toBe('/');
            expect(protocolConfig.monitoring.metricsPort).toBe(8545);
            expect(protocolConfig.monitoring.clientNames).toHaveLength(2);
            expect(protocolConfig.monitoring.clientNames).toContain('Execution Client');
            expect(protocolConfig.monitoring.clientNames).toContain('Consensus Client');
        });
    });

    describe('Environment Configuration - Mainnet Single Node', () => {
        it('should load mainnet single node configuration', () => {
            const envPath = path.join(__dirname, '../../blueprints/ethereum/samples/.env-mainnet-geth-lighthouse-full');
            const envConfig = configLoader.loadEnvironmentConfig(envPath);

            expect(envConfig.BLOCKCHAIN_PROTOCOL).toBe('ethereum');
            expect(envConfig.DEPLOYMENT_MODE).toBe(DeploymentMode.SINGLE_NODE);
            expect(envConfig.BC_NETWORK).toBe('mainnet');
            expect(envConfig.CLIENT_CONFIG).toBe('geth-1.17.4-lighthouse-8.2.0-full.yml');
        });

        it('should have custom ETH variables', () => {
            const envPath = path.join(__dirname, '../../blueprints/ethereum/samples/.env-mainnet-geth-lighthouse-full');
            const envConfig = configLoader.loadEnvironmentConfig(envPath);

            expect(envConfig.CUSTOM_VARIABLES).toBeDefined();
            expect(envConfig.CUSTOM_VARIABLES.ETH_CONSENSUS_CHECKPOINT_SYNC_URL).toBe('https://beaconstate.info');
        });
    });

    describe('Deployment Configuration Validation', () => {
        it('should create valid deployment config for mainnet', () => {
            const protocolConfig = configLoader.loadProtocolConfig('ethereum');
            const envPath = path.join(__dirname, '../../blueprints/ethereum/samples/.env-mainnet-geth-lighthouse-full');
            const envConfig = configLoader.loadEnvironmentConfig(envPath);

            const deploymentConfig = {
                protocol: protocolConfig,
                environment: envConfig
            };

            expect(deploymentConfig.protocol.BLOCKCHAIN_PROTOCOL).toBe('ethereum');
            expect(deploymentConfig.environment.BC_NETWORK).toBe('mainnet');
            expect(deploymentConfig.environment.DEPLOYMENT_MODE).toBe(DeploymentMode.SINGLE_NODE);
        });

        it('should validate client config exists in available configurations', () => {
            const protocolConfig = configLoader.loadProtocolConfig('ethereum');
            const envPath = path.join(__dirname, '../../blueprints/ethereum/samples/.env-mainnet-geth-lighthouse-full');
            const envConfig = configLoader.loadEnvironmentConfig(envPath);

            const clientConfigExists = protocolConfig.availableConfigurations.some(
                c => c.name === envConfig.CLIENT_CONFIG
            );

            expect(clientConfigExists).toBe(true);
        });

        it('should validate network is supported', () => {
            const protocolConfig = configLoader.loadProtocolConfig('ethereum');
            const envPath = path.join(__dirname, '../../blueprints/ethereum/samples/.env-mainnet-geth-lighthouse-full');
            const envConfig = configLoader.loadEnvironmentConfig(envPath);

            expect(protocolConfig.BC_NETWORKS).toContain(envConfig.BC_NETWORK);
        });
    });

    describe('Configuration Files Existence', () => {
        it('should have all required configuration files', () => {
            const fs = require('fs');
            const protocolPath = path.join(__dirname, '../../blueprints/ethereum');

            expect(fs.existsSync(path.join(protocolPath, 'package.json'))).toBe(true);
            expect(fs.existsSync(path.join(protocolPath, 'README.md'))).toBe(true);
            expect(fs.existsSync(path.join(protocolPath, 'user-data/node.sh'))).toBe(true);
            expect(fs.existsSync(path.join(protocolPath, 'user-data/syncchecker.sh'))).toBe(true);
        });

        it('should have all docker-compose configurations', () => {
            const fs = require('fs');
            const protocolConfig = configLoader.loadProtocolConfig('ethereum');
            const configurationsPath = path.join(__dirname, '../../blueprints/ethereum/configurations');

            protocolConfig.availableConfigurations.forEach(config => {
                const configPath = path.join(configurationsPath, config.name);
                expect(fs.existsSync(configPath)).toBe(true);
            });
        });
    });
});
