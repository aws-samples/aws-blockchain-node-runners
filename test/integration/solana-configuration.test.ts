// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import * as path from 'path';
import * as fs from 'fs';
import * as cdk from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import { ConfigurationLoader } from '../../lib/core/configuration-loader';
import { StackFactory } from '../../lib/core/stack-factory';
import { DeploymentMode, DeploymentConfig } from '../../lib/interfaces';

describe('Solana Protocol Configuration', () => {
    const blueprintsPath = path.join(__dirname, '../../blueprints');
    let configLoader: ConfigurationLoader;

    beforeEach(() => {
        configLoader = new ConfigurationLoader(blueprintsPath);
    });

    // ─── Protocol Configuration ───────────────────────────────────────────────

    describe('Protocol Configuration', () => {
        it('should load Solana protocol configuration', () => {
            const protocolConfig = configLoader.loadProtocolConfig('solana');

            expect(protocolConfig.BLOCKCHAIN_PROTOCOL).toBe('solana');
            expect(protocolConfig.supportedDeploymentModes).toContain(DeploymentMode.SINGLE_NODE);
            expect(protocolConfig.supportedDeploymentModes).toContain(DeploymentMode.HA_NODES);
        });

        it('should have correct network options', () => {
            const protocolConfig = configLoader.loadProtocolConfig('solana');

            expect(protocolConfig.BC_NETWORKS).toContain('mainnet-beta');
            expect(protocolConfig.BC_NETWORKS).toContain('testnet');
            expect(protocolConfig.BC_NETWORKS).toContain('devnet');
        });

        it('should have Agave and Frankendancer configurations', () => {
            const protocolConfig = configLoader.loadProtocolConfig('solana');

            expect(protocolConfig.availableConfigurations.length).toBe(8);

            const agaveBase = protocolConfig.availableConfigurations.find(
                c => c.name === 'agave-3.1.14-rpc-base.sh'
            );
            expect(agaveBase).toBeDefined();

            const agaveExtended = protocolConfig.availableConfigurations.find(
                c => c.name === 'agave-3.1.14-rpc-extended.sh'
            );
            expect(agaveExtended).toBeDefined();

            // Agave 4.x configurations (4.0.3 stable for mainnet-beta,
            // 4.1.2 matching the current devnet/testnet clusters).
            const agave403Base = protocolConfig.availableConfigurations.find(
                c => c.name === 'agave-4.0.3-rpc-base.sh'
            );
            expect(agave403Base).toBeDefined();

            const agave403Extended = protocolConfig.availableConfigurations.find(
                c => c.name === 'agave-4.0.3-rpc-extended.sh'
            );
            expect(agave403Extended).toBeDefined();

            const agave412Base = protocolConfig.availableConfigurations.find(
                c => c.name === 'agave-4.1.2-rpc-base.sh'
            );
            expect(agave412Base).toBeDefined();

            const agave412Extended = protocolConfig.availableConfigurations.find(
                c => c.name === 'agave-4.1.2-rpc-extended.sh'
            );
            expect(agave412Extended).toBeDefined();

            const fdBase = protocolConfig.availableConfigurations.find(
                c => c.name === 'frankendancer-0.1006.40100-rpc-base.sh'
            );
            expect(fdBase).toBeDefined();

            const fdExtended = protocolConfig.availableConfigurations.find(
                c => c.name === 'frankendancer-0.1006.40100-rpc-extended.sh'
            );
            expect(fdExtended).toBeDefined();
        });

        it('should have correct default configuration', () => {
            const protocolConfig = configLoader.loadProtocolConfig('solana');
            expect(protocolConfig.defaultConfiguration).toBe('agave-4.0.3-rpc-base.sh');
        });

        it('should have correct port configuration', () => {
            const protocolConfig = configLoader.loadProtocolConfig('solana');

            const rpcPort = protocolConfig.requiredPorts.find(p => p.port === 8899);
            expect(rpcPort).toBeDefined();
            expect(rpcPort?.protocol).toBe('tcp');
            expect(rpcPort?.description).toBe('JSON RPC');
            expect(rpcPort?.public).toBe(false);

            const wsPort = protocolConfig.requiredPorts.find(p => p.port === 8900);
            expect(wsPort).toBeDefined();
            expect(wsPort?.protocol).toBe('tcp');
            expect(wsPort?.description).toBe('WebSocket');
            expect(wsPort?.public).toBe(false);
        });

        it('should have gossip port ranges', () => {
            const protocolConfig = configLoader.loadProtocolConfig('solana');

            const gossipTcp = protocolConfig.requiredPorts.find(
                p => p.portRange?.from === 8001 && p.protocol === 'tcp'
            );
            expect(gossipTcp).toBeDefined();
            expect(gossipTcp?.portRange?.to).toBe(8029);
            expect(gossipTcp?.public).toBe(true);

            const gossipUdp = protocolConfig.requiredPorts.find(
                p => p.portRange?.from === 8001 && p.protocol === 'udp'
            );
            expect(gossipUdp).toBeDefined();
            expect(gossipUdp?.portRange?.to).toBe(8029);
            expect(gossipUdp?.public).toBe(true);
        });

        it('should have Frankendancer shred port', () => {
            const protocolConfig = configLoader.loadProtocolConfig('solana');

            const shredPort = protocolConfig.requiredPorts.find(
                p => p.port === 8003 && p.protocol === 'udp'
            );
            expect(shredPort).toBeDefined();
            expect(shredPort?.public).toBe(true);
            expect(shredPort?.description).toContain('Frankendancer');
        });

        it('should have custom environment variables with SOLANA prefix', () => {
            const protocolConfig = configLoader.loadProtocolConfig('solana');

            expect(protocolConfig.customEnvVarsNamePrefix).toBe('SOLANA');
            expect(protocolConfig.customEnvVars).toContain('SOLANA_NODE_IDENTITY_SECRET_ARN=none');
        });

        it('should have monitoring configuration for both clients', () => {
            const protocolConfig = configLoader.loadProtocolConfig('solana');

            expect(protocolConfig.monitoring.healthCheckPath).toBe('/health');
            expect(protocolConfig.monitoring.metricsPort).toBe(8899);
            expect(protocolConfig.monitoring.clientNames).toHaveLength(2);
            expect(protocolConfig.monitoring.clientNames).toContain('Agave Validator');
            expect(protocolConfig.monitoring.clientNames).toContain('Frankendancer');
        });

        it('should have two default data volumes', () => {
            const protocolConfig = configLoader.loadProtocolConfig('solana');
            // package.json defaultDataVolumes use camelCase (sizeGiB, mountPath, type)
            const volumes = protocolConfig.storage.defaultDataVolumes as any[];

            expect(volumes).toHaveLength(2);

            const dataVol = volumes.find(v => v.mountPath === '/data');
            expect(dataVol).toBeDefined();
            expect(dataVol.sizeGiB).toBe(2000);
            expect(dataVol.type).toBe('io2');

            const accountsVol = volumes.find(v => v.mountPath === '/accounts');
            expect(accountsVol).toBeDefined();
            expect(accountsVol.sizeGiB).toBe(500);
            expect(accountsVol.type).toBe('io2');
        });
    });

    // ─── Environment Configuration ────────────────────────────────────────────

    describe('Environment Configuration - Mainnet-Beta Single Node', () => {
        it('should load mainnet-beta single node configuration', () => {
            const envPath = path.join(blueprintsPath, 'solana/samples/.env-mainnet-beta-agave-rpc-base');
            const envConfig = configLoader.loadEnvironmentConfig(envPath);

            expect(envConfig.BLOCKCHAIN_PROTOCOL).toBe('solana');
            expect(envConfig.DEPLOYMENT_MODE).toBe(DeploymentMode.SINGLE_NODE);
            expect(envConfig.BC_NETWORK).toBe('mainnet-beta');
            expect(envConfig.CLIENT_CONFIG).toBe('agave-4.0.3-rpc-base.sh');
        });

        it('should have two storage volumes for mainnet-beta', () => {
            const envPath = path.join(blueprintsPath, 'solana/samples/.env-mainnet-beta-agave-rpc-base');
            const envConfig = configLoader.loadEnvironmentConfig(envPath);

            expect(envConfig.DATA_VOLUMES).toHaveLength(2);

            const dataVol = envConfig.DATA_VOLUMES.find(v => v.MOUNT_PATH === '/data');
            expect(dataVol).toBeDefined();
            expect(dataVol?.TYPE).toBe('instance-store');
            expect(dataVol?.SIZE).toBe(2000);

            const accountsVol = envConfig.DATA_VOLUMES.find(v => v.MOUNT_PATH === '/accounts');
            expect(accountsVol).toBeDefined();
            expect(accountsVol?.TYPE).toBe('instance-store');
            expect(accountsVol?.SIZE).toBe(500);
        });

        it('should have traffic shaping enabled for mainnet-beta', () => {
            const envPath = path.join(blueprintsPath, 'solana/samples/.env-mainnet-beta-agave-rpc-base');
            const envConfig = configLoader.loadEnvironmentConfig(envPath);

            expect(envConfig.TRAFFIC_SHAPING_ENABLED).toBe(true);
            expect(envConfig.TRAFFIC_SHAPING_RATE_MBIT).toBe(40);
            expect(envConfig.TRAFFIC_SHAPING_MAX_BLOCKS_BEHIND).toBe(10);
        });

        it('should have SOLANA custom variables', () => {
            const envPath = path.join(blueprintsPath, 'solana/samples/.env-mainnet-beta-agave-rpc-base');
            const envConfig = configLoader.loadEnvironmentConfig(envPath);

            expect(envConfig.CUSTOM_VARIABLES).toBeDefined();
            expect(envConfig.CUSTOM_VARIABLES.SOLANA_NODE_IDENTITY_SECRET_ARN).toBe('none');
        });
    });

    describe('Environment Configuration - Testnet', () => {
        it('should load testnet configuration', () => {
            const envPath = path.join(blueprintsPath, 'solana/samples/.env-testnet-agave-rpc-base');
            const envConfig = configLoader.loadEnvironmentConfig(envPath);

            expect(envConfig.BC_NETWORK).toBe('testnet');
            expect(envConfig.DEPLOYMENT_MODE).toBe(DeploymentMode.SINGLE_NODE);
        });

        it('should have smaller storage for testnet', () => {
            const envPath = path.join(blueprintsPath, 'solana/samples/.env-testnet-agave-rpc-base');
            const envConfig = configLoader.loadEnvironmentConfig(envPath);

            const dataVol = envConfig.DATA_VOLUMES.find(v => v.MOUNT_PATH === '/data');
            expect(dataVol?.SIZE).toBe(1000);
            expect(dataVol?.SIZE).toBeLessThan(2000);
        });

        it('should have traffic shaping disabled for testnet', () => {
            const envPath = path.join(blueprintsPath, 'solana/samples/.env-testnet-agave-rpc-base');
            const envConfig = configLoader.loadEnvironmentConfig(envPath);

            expect(envConfig.TRAFFIC_SHAPING_ENABLED).toBe(false);
        });
    });

    describe('Environment Configuration - Devnet', () => {
        it('should load devnet configuration', () => {
            const envPath = path.join(blueprintsPath, 'solana/samples/.env-devnet-agave-rpc-base');
            const envConfig = configLoader.loadEnvironmentConfig(envPath);

            expect(envConfig.BC_NETWORK).toBe('devnet');
            expect(envConfig.DEPLOYMENT_MODE).toBe(DeploymentMode.SINGLE_NODE);
        });

        it('should have gp3 storage for devnet', () => {
            const envPath = path.join(blueprintsPath, 'solana/samples/.env-devnet-agave-rpc-base');
            const envConfig = configLoader.loadEnvironmentConfig(envPath);

            const dataVol = envConfig.DATA_VOLUMES.find(v => v.MOUNT_PATH === '/data');
            expect(dataVol?.TYPE).toBe('instance-store');
        });
    });

    describe('Environment Configuration - HA Nodes', () => {
        it('should load HA nodes configuration', () => {
            const envPath = path.join(blueprintsPath, 'solana/samples/.env-mainnet-beta-agave-rpc-base-ha');
            const envConfig = configLoader.loadEnvironmentConfig(envPath);

            expect(envConfig.DEPLOYMENT_MODE).toBe(DeploymentMode.HA_NODES);
            expect(envConfig.HA_CONFIG).toBeDefined();
        });

        it('should have correct HA configuration', () => {
            const envPath = path.join(blueprintsPath, 'solana/samples/.env-mainnet-beta-agave-rpc-base-ha');
            const envConfig = configLoader.loadEnvironmentConfig(envPath);

            expect(envConfig.HA_CONFIG?.HA_NUMBER_OF_NODES).toBe(2);
            expect(envConfig.HA_CONFIG?.HA_ALB_HEALTHCHECK_PORT).toBe(8899);
            expect(envConfig.HA_CONFIG?.HA_ALB_HEALTHCHECK_PATH).toBe('/health');
        });
    });

    // ─── Configuration Files Existence ────────────────────────────────────────

    describe('Configuration Files Existence', () => {
        it('should have all required protocol files', () => {
            const protocolPath = path.join(blueprintsPath, 'solana');

            expect(fs.existsSync(path.join(protocolPath, 'package.json'))).toBe(true);
            expect(fs.existsSync(path.join(protocolPath, 'README.md'))).toBe(true);
            expect(fs.existsSync(path.join(protocolPath, 'user-data/node.sh'))).toBe(true);
            expect(fs.existsSync(path.join(protocolPath, 'user-data/syncchecker.sh'))).toBe(true);
        });

        it('should have all Agave configuration scripts', () => {
            const protocolConfig = configLoader.loadProtocolConfig('solana');
            const configurationsPath = path.join(blueprintsPath, 'solana/configurations');

            protocolConfig.availableConfigurations.forEach(config => {
                const configPath = path.join(configurationsPath, config.name);
                expect(fs.existsSync(configPath)).toBe(true);
            });
        });

        it('should have all sample environment files', () => {
            const samplesPath = path.join(blueprintsPath, 'solana/samples');

            // Agave samples
            expect(fs.existsSync(path.join(samplesPath, '.env-mainnet-beta-agave-rpc-base'))).toBe(true);
            expect(fs.existsSync(path.join(samplesPath, '.env-mainnet-beta-agave-rpc-base-ha'))).toBe(true);
            expect(fs.existsSync(path.join(samplesPath, '.env-testnet-agave-rpc-base'))).toBe(true);
            expect(fs.existsSync(path.join(samplesPath, '.env-devnet-agave-rpc-base'))).toBe(true);

            // Frankendancer samples
            expect(fs.existsSync(path.join(samplesPath, '.env-mainnet-beta-frankendancer-rpc-base'))).toBe(true);
            expect(fs.existsSync(path.join(samplesPath, '.env-mainnet-beta-frankendancer-rpc-extended'))).toBe(true);
            expect(fs.existsSync(path.join(samplesPath, '.env-mainnet-beta-frankendancer-rpc-base-ha'))).toBe(true);
            expect(fs.existsSync(path.join(samplesPath, '.env-testnet-frankendancer-rpc-base'))).toBe(true);
        });

        it('should have Frankendancer build script', () => {
            const commonPath = path.join(blueprintsPath, 'solana/user-data/common');
            expect(fs.existsSync(path.join(commonPath, 'build-frankendancer.sh'))).toBe(true);
        });

        it('should have common helper scripts', () => {
            const commonPath = path.join(blueprintsPath, 'solana/user-data/common');

            expect(fs.existsSync(path.join(commonPath, 'build-solana.sh'))).toBe(true);
            expect(fs.existsSync(path.join(commonPath, 'setup-configuration.sh'))).toBe(true);
            expect(fs.existsSync(path.join(commonPath, 'configure-monitoring.sh'))).toBe(true);
        });

        it('should have monitoring dashboard templates', () => {
            const monitoringPath = path.join(blueprintsPath, 'solana/monitoring');

            expect(fs.existsSync(path.join(monitoringPath, 'single-node-dashboard-template.json'))).toBe(true);
            expect(fs.existsSync(path.join(monitoringPath, 'ha-dashboard-template.json'))).toBe(true);
        });
    });

    // ─── Syncchecker Script ───────────────────────────────────────────────────

    describe('Syncchecker Script', () => {
        it('should contain Solana getHealth RPC call', () => {
            const scriptPath = path.join(blueprintsPath, 'solana/user-data/syncchecker.sh');
            const content = fs.readFileSync(scriptPath, 'utf8');

            expect(content).toContain('getHealth');
            expect(content).toContain('8899');
        });

        it('should extract numSlotsBehind from error.data path', () => {
            const scriptPath = path.join(blueprintsPath, 'solana/user-data/syncchecker.sh');
            const content = fs.readFileSync(scriptPath, 'utf8');

            expect(content).toContain('.error.data.numSlotsBehind');
        });

        it('should report c1_block_height and c1_blocks_behind metrics', () => {
            const scriptPath = path.join(blueprintsPath, 'solana/user-data/syncchecker.sh');
            const content = fs.readFileSync(scriptPath, 'utf8');

            expect(content).toContain('c1_block_height');
            expect(content).toContain('c1_blocks_behind');
            expect(content).toContain('CWAgent');
        });

        it('should control net-rules.service for traffic shaping', () => {
            const scriptPath = path.join(blueprintsPath, 'solana/user-data/syncchecker.sh');
            const content = fs.readFileSync(scriptPath, 'utf8');

            expect(content).toContain('net-rules.service');
            expect(content).toContain('systemctl start net-rules.service');
            expect(content).toContain('systemctl stop net-rules.service');
        });

        it('should check for init-completed file before running', () => {
            const scriptPath = path.join(blueprintsPath, 'solana/user-data/syncchecker.sh');
            const content = fs.readFileSync(scriptPath, 'utf8');

            expect(content).toContain('init-completed');
        });

        it('should use getBlockHeight for block height metric', () => {
            const scriptPath = path.join(blueprintsPath, 'solana/user-data/syncchecker.sh');
            const content = fs.readFileSync(scriptPath, 'utf8');

            expect(content).toContain('getBlockHeight');
        });
    });

    // ─── Deployment Configuration Validation ──────────────────────────────────

    describe('Deployment Configuration Validation', () => {
        it('should create valid deployment config for mainnet-beta', () => {
            const protocolConfig = configLoader.loadProtocolConfig('solana');
            const envPath = path.join(blueprintsPath, 'solana/samples/.env-mainnet-beta-agave-rpc-base');
            const envConfig = configLoader.loadEnvironmentConfig(envPath);

            const deploymentConfig = { protocol: protocolConfig, environment: envConfig };

            expect(deploymentConfig.protocol.BLOCKCHAIN_PROTOCOL).toBe('solana');
            expect(deploymentConfig.environment.BC_NETWORK).toBe('mainnet-beta');
            expect(deploymentConfig.environment.DEPLOYMENT_MODE).toBe(DeploymentMode.SINGLE_NODE);
        });

        it('should validate client config exists in available configurations', () => {
            const protocolConfig = configLoader.loadProtocolConfig('solana');
            const envPath = path.join(blueprintsPath, 'solana/samples/.env-mainnet-beta-agave-rpc-base');
            const envConfig = configLoader.loadEnvironmentConfig(envPath);

            const clientConfigExists = protocolConfig.availableConfigurations.some(
                c => c.name === envConfig.CLIENT_CONFIG
            );
            expect(clientConfigExists).toBe(true);
        });

        it('should validate network is supported', () => {
            const protocolConfig = configLoader.loadProtocolConfig('solana');
            const envPath = path.join(blueprintsPath, 'solana/samples/.env-mainnet-beta-agave-rpc-base');
            const envConfig = configLoader.loadEnvironmentConfig(envPath);

            expect(protocolConfig.BC_NETWORKS).toContain(envConfig.BC_NETWORK);
        });

        it('should validate protocol assets exist', () => {
            const app = new cdk.App();
            const stack = new cdk.Stack(app, 'TestStack', {
                env: { account: '123456789012', region: 'us-east-1' }
            });
            const { AssetsManager } = require('../../lib/core/assets-manager');
            const assetsManager = new AssetsManager(stack, blueprintsPath);

            const isValid = assetsManager.validateProtocolAssets('solana');
            expect(isValid).toBe(true);
        });
    });

    // ─── Stack Creation ────────────────────────────────────────────────────────

    describe('Single-Node Stack Creation', () => {
        it('should create single-node stack for Solana protocol', () => {
            // Use dummy protocol config for CDK stack creation (per testing-patterns.md)
            const dummyProtocolConfig = configLoader.loadProtocolConfig('dummy');
            const envPath = path.join(blueprintsPath, 'dummy/samples/.env-mainnet-single-node');
            const environmentConfig = configLoader.loadEnvironmentConfig(envPath);

            const deploymentConfig: DeploymentConfig = {
                protocol: dummyProtocolConfig,
                environment: environmentConfig
            };

            const app = new cdk.App();
            const stackFactory = new StackFactory();
            const stackName = configLoader.getStackName(deploymentConfig);
            const userDataScriptPath = path.join(__dirname, '../../assets/common/user-data-ubuntu.sh');

            const stack = stackFactory.createSingleNodeStack(app, deploymentConfig, stackName, {
                userDataScriptPath
            });

            expect(stack).toBeDefined();
            const template = Template.fromStack(stack);
            template.hasResourceProperties('AWS::EC2::Instance', {
                InstanceType: 't3.medium'
            });
        });
    });

    describe('HA Nodes Stack Creation', () => {
        it('should create HA nodes stack for Solana protocol', () => {
            // Use dummy protocol config for CDK stack creation (per testing-patterns.md)
            const dummyProtocolConfig = configLoader.loadProtocolConfig('dummy');
            const haEnvPath = path.join(blueprintsPath, 'dummy/samples/.env-testnet-ha-nodes');
            const haEnvironmentConfig = configLoader.loadEnvironmentConfig(haEnvPath);

            const haDeploymentConfig: DeploymentConfig = {
                protocol: dummyProtocolConfig,
                environment: haEnvironmentConfig
            };

            const app = new cdk.App();
            const stackFactory = new StackFactory();
            const stackName = configLoader.getStackName(haDeploymentConfig);
            const userDataScriptPath = path.join(__dirname, '../../assets/common/user-data-ubuntu.sh');

            const stack = stackFactory.createHANodesStack(app, haDeploymentConfig, stackName, {
                userDataScriptPath
            });

            expect(stack).toBeDefined();
            const template = Template.fromStack(stack);
            template.resourceCountIs('AWS::ElasticLoadBalancingV2::LoadBalancer', 1);
        });
    });

    // ─── Traffic Shaping ──────────────────────────────────────────────────────

    describe('Traffic Shaping Configuration', () => {
        it('should have traffic shaping enabled in mainnet-beta sample', () => {
            const envPath = path.join(blueprintsPath, 'solana/samples/.env-mainnet-beta-agave-rpc-base');
            const content = fs.readFileSync(envPath, 'utf8');

            expect(content).toContain('TRAFFIC_SHAPING_ENABLED="true"');
            expect(content).toContain('TRAFFIC_SHAPING_RATE_MBIT="40"');
        });

        it('should have traffic shaping disabled in testnet sample', () => {
            const envPath = path.join(blueprintsPath, 'solana/samples/.env-testnet-agave-rpc-base');
            const content = fs.readFileSync(envPath, 'utf8');

            expect(content).toContain('TRAFFIC_SHAPING_ENABLED="false"');
        });

        it('should parse traffic shaping config from mainnet-beta env', () => {
            const envPath = path.join(blueprintsPath, 'solana/samples/.env-mainnet-beta-agave-rpc-base');
            const envConfig = configLoader.loadEnvironmentConfig(envPath);

            expect(envConfig.TRAFFIC_SHAPING_ENABLED).toBe(true);
            expect(envConfig.TRAFFIC_SHAPING_RATE_MBIT).toBe(40);
            expect(envConfig.TRAFFIC_SHAPING_CHECK_INTERVAL_SEC).toBe(60);
            expect(envConfig.TRAFFIC_SHAPING_MAX_BLOCKS_BEHIND).toBe(10);
        });

        it('syncchecker should enable traffic shaping when slots_behind is 0', () => {
            const scriptPath = path.join(blueprintsPath, 'solana/user-data/syncchecker.sh');
            const content = fs.readFileSync(scriptPath, 'utf8');

            // When slots_behind <= 0, start net-rules.service
            expect(content).toContain('systemctl start net-rules.service');
        });

        it('syncchecker should disable traffic shaping when slots_behind exceeds threshold', () => {
            const scriptPath = path.join(blueprintsPath, 'solana/user-data/syncchecker.sh');
            const content = fs.readFileSync(scriptPath, 'utf8');

            // When slots_behind > TRAFFIC_SHAPING_MAX_BLOCKS_BEHIND, stop net-rules.service
            expect(content).toContain('systemctl stop net-rules.service');
            expect(content).toContain('TRAFFIC_SHAPING_MAX_BLOCKS_BEHIND');
        });
    });

    // ─── CloudWatch Metrics ───────────────────────────────────────────────────

    describe('CloudWatch Metrics', () => {
        it('should use CWAgent namespace for metrics', () => {
            const scriptPath = path.join(blueprintsPath, 'solana/user-data/syncchecker.sh');
            const content = fs.readFileSync(scriptPath, 'utf8');

            expect(content).toContain('"CWAgent"');
        });

        it('should report metrics with InstanceId dimension', () => {
            const scriptPath = path.join(blueprintsPath, 'solana/user-data/syncchecker.sh');
            const content = fs.readFileSync(scriptPath, 'utf8');

            expect(content).toContain('InstanceId=$INSTANCE_ID');
        });

        it('should have valid single-node dashboard template JSON', () => {
            const dashboardPath = path.join(
                blueprintsPath, 'solana/monitoring/single-node-dashboard-template.json'
            );
            const content = fs.readFileSync(dashboardPath, 'utf8');
            const dashboard = JSON.parse(content);

            expect(dashboard.widgets).toBeDefined();
            expect(dashboard.widgets.length).toBeGreaterThan(0);
        });

        it('should include c1_block_height and c1_blocks_behind in dashboard', () => {
            const dashboardPath = path.join(
                blueprintsPath, 'solana/monitoring/single-node-dashboard-template.json'
            );
            const content = fs.readFileSync(dashboardPath, 'utf8');

            expect(content).toContain('c1_block_height');
            expect(content).toContain('c1_blocks_behind');
        });
    });
});
