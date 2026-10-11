// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import * as fs from 'fs';
import * as path from 'path';
import { ConfigurationLoader } from '../../lib/core/configuration-loader';
import { DeploymentMode } from '../../lib/interfaces/enums';

const BLUEPRINT = path.join(__dirname, '../../blueprints/robinhood');
const CONFIG = 'nitro-v3.11.5-full.yml';
const SAMPLES: Array<{ file: string; network: string; mode: DeploymentMode; minDataGiB: number }> = [
    { file: '.env-testnet-nitro-full', network: 'testnet', mode: DeploymentMode.SINGLE_NODE, minDataGiB: 1000 },
    // A mainnet restore holds the snapshot parts and the joined archive at once
    // (~2x the ~925 GiB snapshot), so mainnet needs the larger volume.
    { file: '.env-mainnet-nitro-full', network: 'mainnet', mode: DeploymentMode.SINGLE_NODE, minDataGiB: 2200 },
    { file: '.env-mainnet-nitro-full-ha', network: 'mainnet', mode: DeploymentMode.HA_NODES, minDataGiB: 2200 },
];

describe('Robinhood Chain Protocol Configuration', () => {
    let configLoader: ConfigurationLoader;

    beforeEach(() => {
        configLoader = new ConfigurationLoader('blueprints');
    });

    describe('Protocol Configuration', () => {
        it('should load the Robinhood protocol configuration', () => {
            const protocolConfig = configLoader.loadProtocolConfig('robinhood');

            expect(protocolConfig.BLOCKCHAIN_PROTOCOL).toBe('robinhood');
            expect(protocolConfig.supportedDeploymentModes).toContain(DeploymentMode.SINGLE_NODE);
            expect(protocolConfig.supportedDeploymentModes).toContain(DeploymentMode.HA_NODES);
            expect(protocolConfig.BC_NETWORKS).toEqual(['mainnet', 'testnet']);
        });

        it('should default to the pinned client configuration', () => {
            const protocolConfig = configLoader.loadProtocolConfig('robinhood');

            expect(protocolConfig.defaultConfiguration).toBe(CONFIG);
            expect(protocolConfig.availableConfigurations.map(c => c.name)).toContain(CONFIG);
        });

        it('should expose only VPC-internal RPC, WebSocket and metrics ports', () => {
            const protocolConfig = configLoader.loadProtocolConfig('robinhood');

            expect(protocolConfig.requiredPorts.map(p => p.port).sort()).toEqual([6070, 8547, 8548]);
            protocolConfig.requiredPorts.forEach(p => {
                expect(p.protocol).toBe('tcp');
                expect(p.public).toBe(false);
            });
        });

        it('should declare the L1 endpoints as ROBINHOOD custom variables', () => {
            const protocolConfig = configLoader.loadProtocolConfig('robinhood');

            expect(protocolConfig.customEnvVarsNamePrefix).toBe('ROBINHOOD');
            const names = (protocolConfig.customEnvVars ?? []).map(v => v.split('=')[0]);
            expect(names).toContain('ROBINHOOD_L1_RPC_URL');
            expect(names).toContain('ROBINHOOD_L1_BEACON_URL');
        });
    });

    describe.each(SAMPLES)('Sample $file', ({ file, network, mode, minDataGiB }) => {
        const envPath = path.join(BLUEPRINT, 'samples', file);

        it('should load with the expected network, mode and client configuration', () => {
            const envConfig = configLoader.loadEnvironmentConfig(envPath);

            expect(envConfig.BLOCKCHAIN_PROTOCOL).toBe('robinhood');
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

        it('should set real L1 endpoints for its parent chain', () => {
            const envConfig = configLoader.loadEnvironmentConfig(envPath);
            const rpc = envConfig.CUSTOM_VARIABLES.ROBINHOOD_L1_RPC_URL;
            const beacon = envConfig.CUSTOM_VARIABLES.ROBINHOOD_L1_BEACON_URL;

            expect(rpc).toMatch(/^https:\/\//);
            expect(beacon).toMatch(/^https:\/\//);
            expect(rpc).not.toContain('your-');
            expect(beacon).not.toContain('your-');
            // publicnode's free execution RPC refuses the historical eth_getLogs
            // Nitro needs after a snapshot restore.
            expect(rpc).not.toContain('publicnode');
            if (network === 'testnet') {
                expect(rpc).toContain('sepolia');
                expect(beacon).toContain('sepolia');
            } else {
                expect(rpc).not.toContain('sepolia');
                expect(beacon).not.toContain('sepolia');
            }
        });

        it('should size the data volume for the snapshot restore', () => {
            const envConfig = configLoader.loadEnvironmentConfig(envPath);
            const dataVol = envConfig.DATA_VOLUMES.find(v => v.MOUNT_PATH === '/data');

            expect(dataVol).toBeDefined();
            expect(dataVol!.SIZE).toBeGreaterThanOrEqual(minDataGiB);
        });

        it('should leave the framework S3 snapshot restore disabled', () => {
            const envConfig = configLoader.loadEnvironmentConfig(envPath);

            expect(envConfig.SNAPSHOT_ENABLED).toBe(false);
        });
    });

    describe('HA sample', () => {
        it('should accept the HTTP 400 Nitro returns for a plain GET on the RPC port', () => {
            const envPath = path.join(BLUEPRINT, 'samples', '.env-mainnet-nitro-full-ha');
            const envConfig = configLoader.loadEnvironmentConfig(envPath);

            expect(configLoader.validateHAConfigVariables(envConfig).isValid).toBe(true);
            expect(envConfig.HA_CONFIG!.HA_ALB_HEALTHCHECK_PORT).toBe(8547);
            expect(envConfig.HA_CONFIG!.HA_ALB_HEALTHCHECK_HTTP_CODES.split(',')).toContain('400');
        });
    });

    describe('Blueprint files', () => {
        it('should ship the required files', () => {
            ['package.json', 'README.md', 'user-data/node.sh', 'user-data/common/blob-proxy.py'].forEach(f => {
                expect(fs.existsSync(path.join(BLUEPRINT, f))).toBe(true);
            });
        });

        it('should have a file for every available configuration', () => {
            const protocolConfig = configLoader.loadProtocolConfig('robinhood');

            protocolConfig.availableConfigurations.forEach(config => {
                expect(fs.existsSync(path.join(BLUEPRINT, 'configurations', config.name))).toBe(true);
            });
        });

        it('should pin the Nitro image to an immutable tag', () => {
            const marker = fs.readFileSync(path.join(BLUEPRINT, 'configurations', CONFIG), 'utf8');

            expect(marker).toMatch(/^nitro_image: "offchainlabs\/nitro-node:v3\.11\.5-[0-9a-f]{7}"$/m);
            expect(marker).not.toMatch(/nitro-node:latest\b/);
        });
    });
});
