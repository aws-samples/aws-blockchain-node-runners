// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import * as fs from 'fs';
import * as path from 'path';
import { ConfigurationLoader } from '../../../lib/core/configuration-loader';
import { DeploymentMode, CpuType } from '../../../lib/interfaces';

describe('ConfigurationLoader', () => {
  let configLoader: ConfigurationLoader;
  const testBlueprintsPath = path.join(__dirname, '../../../blueprints');

  beforeEach(() => {
    configLoader = new ConfigurationLoader(testBlueprintsPath);
  });

  describe('loadProtocolConfig', () => {
    it('should load dummy protocol configuration successfully', () => {
      const config = configLoader.loadProtocolConfig('dummy');
      
      expect(config.BLOCKCHAIN_PROTOCOL).toBe('dummy');
      expect(config.supportedDeploymentModes).toEqual(['single-node', 'ha-nodes']);
      expect(config.BC_NETWORKS).toEqual(['testnet', 'mainnet', 'devnet']);
      expect(config.customEnvVarsNamePrefix).toBe('DUMMY');
      expect(config.requiredPorts).toHaveLength(5);
      expect(config.monitoring.healthCheckPath).toBe('/health');
      expect(config.monitoring.metricsPort).toBe(8545);
      expect(config.monitoring.clientNames).toEqual(['Dummy Execution']);
      expect(config.defaultConfiguration).toBe('dummy-1.0.0-rpc-base.sh');
      expect(config.availableConfigurations).toHaveLength(2);
    });

    it('should throw error for non-existent protocol', () => {
      expect(() => {
        configLoader.loadProtocolConfig('nonexistent');
      }).toThrow('Protocol configuration not found');
    });

    it('should validate required fields in protocol config', () => {
      expect(() => {
        // This would fail if we had a malformed config, but our dummy config is valid
        configLoader.loadProtocolConfig('dummy');
      }).not.toThrow();
    });
  });

  describe('loadEnvironmentConfig', () => {
    it('should load single-node environment configuration', () => {
      const envPath = path.join(__dirname, '../../../blueprints/dummy/samples/.env-mainnet-single-node');
      const config = configLoader.loadEnvironmentConfig(envPath);
      
      expect(config.AWS_ACCOUNT_ID).toBe('123456789012');
      expect(config.AWS_REGION).toBe('us-east-1');
      expect(config.BLOCKCHAIN_PROTOCOL).toBe('dummy');
      expect(config.DEPLOYMENT_MODE).toBe(DeploymentMode.SINGLE_NODE);
      expect(config.INSTANCE_TYPE).toBe('t3.medium');
      expect(config.CPU_TYPE).toBe(CpuType.X86_64);
      expect(config.DATA_VOLUMES_COUNT).toBe(1);
      expect(config.BC_NETWORK).toBe('testnet');
      expect(config.CLIENT_CONFIG).toBe('dummy-1.0.0-rpc-base.sh');
      expect(config.CLIENT_VERSION).toBe('v1.0.0');
      expect(config.CUSTOM_VARIABLES.DUMMY_NODE_TYPE).toBe('validator');
      expect(config.CUSTOM_VARIABLES.DUMMY_SYNC_MODE).toBe('fast');
    });

    it('should load HA nodes environment configuration', () => {
      const envPath = path.join(__dirname, '../../../blueprints/dummy/samples/.env-testnet-ha-nodes');
      const config = configLoader.loadEnvironmentConfig(envPath);
      
      expect(config.AWS_ACCOUNT_ID).toBe('123456789012');
      expect(config.AWS_REGION).toBe('us-east-1');
      expect(config.BLOCKCHAIN_PROTOCOL).toBe('dummy');
      expect(config.DEPLOYMENT_MODE).toBe(DeploymentMode.HA_NODES);
      expect(config.INSTANCE_TYPE).toBe('t3.large');
      expect(config.DATA_VOLUMES_COUNT).toBe(2);
      expect(config.HA_CONFIG).toBeDefined();
      expect(config.HA_CONFIG?.HA_NUMBER_OF_NODES).toBe(3);
      expect(config.HA_CONFIG?.HA_ALB_HEALTHCHECK_PORT).toBe(8545);
      expect(config.HA_CONFIG?.HA_ALB_HEALTHCHECK_PATH).toBe('/health');
      expect(config.BC_NETWORK).toBe('mainnet');
      expect(config.CLIENT_CONFIG).toBe('dummy-1.0.0-rpc-extended.sh');
    });

    it('should throw error for non-existent environment file', () => {
      expect(() => {
        configLoader.loadEnvironmentConfig('nonexistent.env');
      }).toThrow('Environment configuration file not found');
    });
  });

  describe('parseDataVolumes', () => {
    it('should parse single data volume configuration', () => {
      const envPath = path.join(__dirname, '../../../blueprints/dummy/samples/.env-mainnet-single-node');
      const config = configLoader.loadEnvironmentConfig(envPath);
      
      expect(config.DATA_VOLUMES).toHaveLength(1);
      expect(config.DATA_VOLUMES[0].SIZE).toBe(100);
      expect(config.DATA_VOLUMES[0].TYPE).toBe('gp3');
      expect(config.DATA_VOLUMES[0].IOPS).toBe(3000);
      expect(config.DATA_VOLUMES[0].THROUGHPUT).toBe(125);
      expect(config.DATA_VOLUMES[0].MOUNT_PATH).toBe('/data');
      expect(config.DATA_VOLUMES[0].DEVICE_NAME).toBe('/dev/sdf');
    });

    it('should parse multiple data volumes configuration', () => {
      const envPath = path.join(__dirname, '../../../blueprints/dummy/samples/.env-testnet-ha-nodes');
      const config = configLoader.loadEnvironmentConfig(envPath);
      
      expect(config.DATA_VOLUMES).toHaveLength(2);
      expect(config.DATA_VOLUMES[0].SIZE).toBe(200);
      expect(config.DATA_VOLUMES[0].MOUNT_PATH).toBe('/data');
      expect(config.DATA_VOLUMES[0].DEVICE_NAME).toBe('/dev/sdf'); // From fixture
      expect(config.DATA_VOLUMES[1].SIZE).toBe(100);
      expect(config.DATA_VOLUMES[1].MOUNT_PATH).toBe('/accounts');
      expect(config.DATA_VOLUMES[1].DEVICE_NAME).toBe('/dev/sdg'); // From fixture
    });
  });

  describe('parseHAConfig', () => {
    it('should have default HA config for single-node deployment', () => {
      const envPath = path.join(__dirname, '../../../blueprints/dummy/samples/.env-mainnet-single-node');
      const config = configLoader.loadEnvironmentConfig(envPath);
      
      // Single-node deployment still has HA_CONFIG with defaults, but it's not used
      expect(config.HA_CONFIG).toBeDefined();
      expect(config.HA_CONFIG?.HA_NUMBER_OF_NODES).toBe(2); // Default value
    });

    it('should parse HA configuration for HA deployment', () => {
      const envPath = path.join(__dirname, '../../../blueprints/dummy/samples/.env-testnet-ha-nodes');
      const config = configLoader.loadEnvironmentConfig(envPath);
      
      expect(config.HA_CONFIG).toBeDefined();
      expect(config.HA_CONFIG?.HA_NUMBER_OF_NODES).toBe(3);
      expect(config.HA_CONFIG?.HA_ALB_HEALTHCHECK_PORT).toBe(8545);
      expect(config.HA_CONFIG?.HA_ALB_HEALTHCHECK_PATH).toBe('/health');
      expect(config.HA_CONFIG?.HA_ALB_HEALTHCHECK_GRACE_PERIOD_MIN).toBe(60);
      expect(config.HA_CONFIG?.HA_ALB_HEALTHCHECK_INTERVAL_SEC).toBe(30);
      expect(config.HA_CONFIG?.HA_NODES_HEARTBEAT_DELAY_MIN).toBe(10);
      expect(config.HA_CONFIG?.HA_ALB_DEREGISTRATION_DELAY_SEC).toBe(30);
    });
  });

  describe('parseTrafficShapingConfig', () => {
    it('should parse traffic shaping configuration when enabled', () => {
      // Create a test environment with traffic shaping enabled
      const envVars = {
        AWS_ACCOUNT_ID: '123456789012',
        AWS_REGION: 'us-east-1',
        BLOCKCHAIN_PROTOCOL: 'dummy',
        DEPLOYMENT_MODE: 'single-node',
        INSTANCE_TYPE: 't3.medium',
        CPU_TYPE: 'x86_64',
        BC_NETWORK: 'testnet',
        CLIENT_CONFIG: 'dummy-1.0.0-rpc-base.sh',
        CLIENT_VERSION: 'v1.0.0',
        DATA_VOLUMES_COUNT: '1',
        SNAPSHOT_ENABLED: 'false',
        TRAFFIC_SHAPING_ENABLED: 'true',
        TRAFFIC_SHAPING_RATE_MBIT: '40',
        TRAFFIC_SHAPING_CHECK_INTERVAL_SEC: '60',
        TRAFFIC_SHAPING_MAX_BLOCKS_BEHIND: '10'
      };

      // Set environment variables
      Object.entries(envVars).forEach(([key, value]) => {
        process.env[key] = value;
      });

      const config = configLoader.loadEnvironmentFromProcessEnv();
      
      expect(config.TRAFFIC_SHAPING_ENABLED).toBe(true);
      expect(config.TRAFFIC_SHAPING_RATE_MBIT).toBe(40);
      expect(config.TRAFFIC_SHAPING_CHECK_INTERVAL_SEC).toBe(60);
      expect(config.TRAFFIC_SHAPING_MAX_BLOCKS_BEHIND).toBe(10);

      // Clean up
      Object.keys(envVars).forEach(key => {
        delete process.env[key];
      });
    });

    it('should use default values when traffic shaping is disabled', () => {
      const envVars = {
        AWS_ACCOUNT_ID: '123456789012',
        AWS_REGION: 'us-east-1',
        BLOCKCHAIN_PROTOCOL: 'dummy',
        DEPLOYMENT_MODE: 'single-node',
        INSTANCE_TYPE: 't3.medium',
        CPU_TYPE: 'x86_64',
        BC_NETWORK: 'testnet',
        CLIENT_CONFIG: 'dummy-1.0.0-rpc-base.sh',
        CLIENT_VERSION: 'v1.0.0',
        DATA_VOLUMES_COUNT: '1',
        SNAPSHOT_ENABLED: 'false',
        TRAFFIC_SHAPING_ENABLED: 'false'
      };

      Object.entries(envVars).forEach(([key, value]) => {
        process.env[key] = value;
      });

      const config = configLoader.loadEnvironmentFromProcessEnv();
      
      expect(config.TRAFFIC_SHAPING_ENABLED).toBe(false);
      expect(config.TRAFFIC_SHAPING_RATE_MBIT).toBe(40); // Default value
      expect(config.TRAFFIC_SHAPING_CHECK_INTERVAL_SEC).toBe(60); // Default value
      expect(config.TRAFFIC_SHAPING_MAX_BLOCKS_BEHIND).toBe(10); // Default value

      Object.keys(envVars).forEach(key => {
        delete process.env[key];
      });
    });

    it('should use default values when traffic shaping variables are not specified', () => {
      const envVars = {
        AWS_ACCOUNT_ID: '123456789012',
        AWS_REGION: 'us-east-1',
        BLOCKCHAIN_PROTOCOL: 'dummy',
        DEPLOYMENT_MODE: 'single-node',
        INSTANCE_TYPE: 't3.medium',
        CPU_TYPE: 'x86_64',
        BC_NETWORK: 'testnet',
        CLIENT_CONFIG: 'dummy-1.0.0-rpc-base.sh',
        CLIENT_VERSION: 'v1.0.0',
        DATA_VOLUMES_COUNT: '1',
        SNAPSHOT_ENABLED: 'false',
        TRAFFIC_SHAPING_ENABLED: 'true'
        // No TRAFFIC_SHAPING_RATE_MBIT, etc.
      };

      Object.entries(envVars).forEach(([key, value]) => {
        process.env[key] = value;
      });

      const config = configLoader.loadEnvironmentFromProcessEnv();
      
      expect(config.TRAFFIC_SHAPING_ENABLED).toBe(true);
      expect(config.TRAFFIC_SHAPING_RATE_MBIT).toBe(40); // Default
      expect(config.TRAFFIC_SHAPING_CHECK_INTERVAL_SEC).toBe(60); // Default
      expect(config.TRAFFIC_SHAPING_MAX_BLOCKS_BEHIND).toBe(10); // Default

      Object.keys(envVars).forEach(key => {
        delete process.env[key];
      });
    });
  });

  describe('validateConfiguration', () => {
    it('should validate valid single-node configuration', () => {
      const envPath = path.join(__dirname, '../../../blueprints/dummy/samples/.env-mainnet-single-node');
      const config = configLoader.loadEnvironmentConfig(envPath);
      
      const result = configLoader.validateConfiguration(config);
      
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should validate valid HA configuration', () => {
      const envPath = path.join(__dirname, '../../../blueprints/dummy/samples/.env-testnet-ha-nodes');
      const config = configLoader.loadEnvironmentConfig(envPath);
      
      const result = configLoader.validateConfiguration(config);
      
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should detect missing required fields', () => {
      const envPath = path.join(__dirname, '../../../blueprints/dummy/samples/.env-mainnet-single-node');
      const config = configLoader.loadEnvironmentConfig(envPath);
      
      // Remove required field
      config.AWS_ACCOUNT_ID = '';
      
      const result = configLoader.validateConfiguration(config);
      
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('AWS_ACCOUNT_ID is required');
    });

    it('should validate AWS account ID format', () => {
      const envPath = path.join(__dirname, '../../../blueprints/dummy/samples/.env-mainnet-single-node');
      const config = configLoader.loadEnvironmentConfig(envPath);
      
      // Invalid account ID
      config.AWS_ACCOUNT_ID = '12345';
      
      const result = configLoader.validateConfiguration(config);
      
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('AWS_ACCOUNT_ID must be a 12-digit number');
    });

    it('should validate traffic shaping rate is within valid range', () => {
      const envPath = path.join(__dirname, '../../../blueprints/dummy/samples/.env-mainnet-single-node');
      const config = configLoader.loadEnvironmentConfig(envPath);
      
      config.TRAFFIC_SHAPING_ENABLED = true;
      config.TRAFFIC_SHAPING_RATE_MBIT = -1; // Negative value
      
      const result = configLoader.validateConfiguration(config);
      
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('TRAFFIC_SHAPING_RATE_MBIT must not be less than 0 Mbit/s');
    });

    it('should validate traffic shaping check interval is within valid range', () => {
      const envPath = path.join(__dirname, '../../../blueprints/dummy/samples/.env-mainnet-single-node');
      const config = configLoader.loadEnvironmentConfig(envPath);
      
      config.TRAFFIC_SHAPING_ENABLED = true;
      config.TRAFFIC_SHAPING_CHECK_INTERVAL_SEC = -5; // Negative value
      
      const result = configLoader.validateConfiguration(config);
      
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('TRAFFIC_SHAPING_CHECK_INTERVAL_SEC must not be less than 0 seconds');
    });

    it('should validate traffic shaping max blocks behind is within valid range', () => {
      const envPath = path.join(__dirname, '../../../blueprints/dummy/samples/.env-mainnet-single-node');
      const config = configLoader.loadEnvironmentConfig(envPath);
      
      config.TRAFFIC_SHAPING_ENABLED = true;
      config.TRAFFIC_SHAPING_MAX_BLOCKS_BEHIND = -10; // Negative value
      
      const result = configLoader.validateConfiguration(config);
      
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('TRAFFIC_SHAPING_MAX_BLOCKS_BEHIND must not be less than 0 blocks');
    });

    it('should pass validation when traffic shaping is disabled', () => {
      const envPath = path.join(__dirname, '../../../blueprints/dummy/samples/.env-mainnet-single-node');
      const config = configLoader.loadEnvironmentConfig(envPath);
      
      config.TRAFFIC_SHAPING_ENABLED = false;
      config.TRAFFIC_SHAPING_RATE_MBIT = -1; // Invalid but should be ignored
      
      const result = configLoader.validateConfiguration(config);
      
      expect(result.isValid).toBe(true);
    });

    it('should pass validation with valid traffic shaping configuration', () => {
      const envPath = path.join(__dirname, '../../../blueprints/dummy/samples/.env-mainnet-single-node');
      const config = configLoader.loadEnvironmentConfig(envPath);
      
      config.TRAFFIC_SHAPING_ENABLED = true;
      config.TRAFFIC_SHAPING_RATE_MBIT = 40;
      config.TRAFFIC_SHAPING_CHECK_INTERVAL_SEC = 60;
      config.TRAFFIC_SHAPING_MAX_BLOCKS_BEHIND = 10;
      
      const result = configLoader.validateConfiguration(config);
      
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should pass validation with high traffic shaping values', () => {
      const envPath = path.join(__dirname, '../../../blueprints/dummy/samples/.env-mainnet-single-node');
      const config = configLoader.loadEnvironmentConfig(envPath);
      
      config.TRAFFIC_SHAPING_ENABLED = true;
      config.TRAFFIC_SHAPING_RATE_MBIT = 2000; // High value should be allowed
      config.TRAFFIC_SHAPING_CHECK_INTERVAL_SEC = 5000; // High value should be allowed
      config.TRAFFIC_SHAPING_MAX_BLOCKS_BEHIND = 5000; // High value should be allowed
      
      const result = configLoader.validateConfiguration(config);
      
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should reject a non-HTTPS SNAPSHOT_DOWNLOAD_URL when snapshots are enabled', () => {
      const envPath = path.join(__dirname, '../../../blueprints/dummy/samples/.env-mainnet-single-node');
      const config = configLoader.loadEnvironmentConfig(envPath);
      config.SNAPSHOT_ENABLED = true;
      config.SNAPSHOT_DOWNLOAD_URL = 'http://snapshots.example.com/latest.tar.zst';

      const result = configLoader.validateConfiguration(config);

      expect(result.isValid).toBe(false);
      expect(result.errors.some(e => e.includes('SNAPSHOT_DOWNLOAD_URL must use HTTPS'))).toBe(true);
    });

    it('should accept an HTTPS SNAPSHOT_DOWNLOAD_URL', () => {
      const envPath = path.join(__dirname, '../../../blueprints/dummy/samples/.env-mainnet-single-node');
      const config = configLoader.loadEnvironmentConfig(envPath);
      config.SNAPSHOT_ENABLED = true;
      config.SNAPSHOT_DOWNLOAD_URL = 'https://snapshots.example.com/latest.tar.zst';

      const result = configLoader.validateConfiguration(config);

      expect(result.isValid).toBe(true);
    });

    it('should not enforce HTTPS when no snapshot URL is configured', () => {
      const envPath = path.join(__dirname, '../../../blueprints/dummy/samples/.env-mainnet-single-node');
      const config = configLoader.loadEnvironmentConfig(envPath);
      config.SNAPSHOT_ENABLED = true;
      config.SNAPSHOT_DOWNLOAD_URL = 'none';

      const result = configLoader.validateConfiguration(config);

      expect(result.isValid).toBe(true);
    });
  });

  describe('validateProtocolConfiguration', () => {
    it('should validate existing protocol configuration', () => {
      const result = configLoader.validateProtocolConfiguration('dummy', 'dummy-1.0.0-rpc-base.sh');
      
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should detect non-existent configuration', () => {
      const result = configLoader.validateProtocolConfiguration('dummy', 'nonexistent-config');
      
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain("Configuration 'nonexistent-config' not found for protocol 'dummy'");
      expect(result.warnings[0]).toContain('Available configurations: dummy-1.0.0-rpc-base.sh, dummy-1.0.0-rpc-extended.sh');
    });

    it('should handle non-existent protocol', () => {
      const result = configLoader.validateProtocolConfiguration('nonexistent', 'any-config');
      
      expect(result.isValid).toBe(false);
      expect(result.errors[0]).toContain('Failed to load protocol configuration');
    });
  });

  describe('extractProtocolCustomEnvVars', () => {
    it('should extract protocol-specific custom variables', () => {
      const protocolConfig = configLoader.loadProtocolConfig('dummy');
      const envPath = path.join(__dirname, '../../../blueprints/dummy/samples/.env-mainnet-single-node');
      const envConfig = configLoader.loadEnvironmentConfig(envPath);
      
      const customVars = configLoader.extractProtocolCustomEnvVars(protocolConfig, envConfig);
      
      expect(customVars.DUMMY_NODE_TYPE).toBe('validator');
      expect(customVars.DUMMY_SYNC_MODE).toBe('fast');
    });

    it('should include default values for missing custom variables', () => {
      const protocolConfig = configLoader.loadProtocolConfig('dummy');
      const envPath = path.join(__dirname, '../../../blueprints/dummy/samples/.env-mainnet-single-node');
      const envConfig = configLoader.loadEnvironmentConfig(envPath);
      
      // Remove custom variables from environment
      delete envConfig.CUSTOM_VARIABLES.DUMMY_NODE_TYPE;
      delete envConfig.CUSTOM_VARIABLES.DUMMY_SYNC_MODE;
      
      const customVars = configLoader.extractProtocolCustomEnvVars(protocolConfig, envConfig);
      
      // Should use defaults from protocol config
      expect(customVars.DUMMY_NODE_TYPE).toBe('validator');
      expect(customVars.DUMMY_SYNC_MODE).toBe('fast');
    });
  });

  describe('getDashboardTemplatePath', () => {
    it('should fallback to common template for single-node when protocol template does not exist', () => {
      // Dummy protocol doesn't have single-node-dashboard-template.json, should fallback
      const templatePath = configLoader.getDashboardTemplatePath('dummy', DeploymentMode.SINGLE_NODE);
      
      expect(templatePath).toContain('lib/common/monitoring-dashboards/single-node-dashboard-template.json');
      expect(require('fs').existsSync(templatePath)).toBe(true);
    });

    it('should throw error for HA deployments requesting dashboard template', () => {
      expect(() => {
        configLoader.getDashboardTemplatePath('dummy', DeploymentMode.HA_NODES);
      }).toThrow('HA deployments do not include default monitoring dashboards');
    });

    it('should fallback to common template when protocol template does not exist', () => {
      // Create a temporary config loader with a non-existent protocol path
      const tempConfigLoader = new ConfigurationLoader('nonexistent-blueprints');
      
      // This should fallback to common template
      const templatePath = tempConfigLoader.getDashboardTemplatePath('dummy', DeploymentMode.SINGLE_NODE);
      
      expect(templatePath).toContain('lib/common/monitoring-dashboards/single-node-dashboard-template.json');
      expect(require('fs').existsSync(templatePath)).toBe(true);
    });

    it('should throw error when neither protocol nor common template exists', () => {
      // Mock fs.existsSync to always return false
      const fs = require('fs');
      const originalExistsSync = fs.existsSync;
      fs.existsSync = jest.fn().mockReturnValue(false);

      const tempConfigLoader = new ConfigurationLoader('nonexistent-blueprints');
      
      expect(() => {
        tempConfigLoader.getDashboardTemplatePath('dummy', DeploymentMode.SINGLE_NODE);
      }).toThrow('Dashboard template not found');

      // Restore original function
      fs.existsSync = originalExistsSync;
    });
  });

  describe('Blueprint resolution from node_modules', () => {
    it('should resolve protocols from root package.json dependencies in node_modules', () => {
      const protocols = configLoader.getAvailableProtocols();

      expect(protocols).toContain('dummy');
      expect(protocols).toContain('ethereum');
      expect(protocols).toContain('solana');
    });

    it('should list available protocols with metadata from installed packages', () => {
      const blueprints = configLoader.listAvailableProtocols();

      expect(blueprints.length).toBeGreaterThanOrEqual(3);

      const dummy = blueprints.find(b => b.BLOCKCHAIN_PROTOCOL === 'dummy');
      expect(dummy).toBeDefined();
      expect(dummy!.packageName).toBe('aws-bnr-blueprint-dummy');
      expect(dummy!.version).toBe('2.0.0');
      expect(dummy!.isBuiltIn).toBe(true);

      const ethereum = blueprints.find(b => b.BLOCKCHAIN_PROTOCOL === 'ethereum');
      expect(ethereum).toBeDefined();
      expect(ethereum!.packageName).toBe('aws-bnr-blueprint-ethereum');
      expect(ethereum!.isBuiltIn).toBe(true);

      const solana = blueprints.find(b => b.BLOCKCHAIN_PROTOCOL === 'solana');
      expect(solana).toBeDefined();
      expect(solana!.packageName).toBe('aws-bnr-blueprint-solana');
      expect(solana!.isBuiltIn).toBe(true);
    });

    it('should resolve protocol config from node_modules package.json aws-blockchain-node-runner field', () => {
      const config = configLoader.loadProtocolConfig('dummy');

      expect(config.BLOCKCHAIN_PROTOCOL).toBe('dummy');
      expect(config.supportedDeploymentModes).toEqual(['single-node', 'ha-nodes']);
      expect(config.defaultConfiguration).toBe('dummy-1.0.0-rpc-base.sh');
    });

    it('should resolve ethereum protocol from node_modules', () => {
      const config = configLoader.loadProtocolConfig('ethereum');

      expect(config.BLOCKCHAIN_PROTOCOL).toBe('ethereum');
      expect(config.customEnvVarsNamePrefix).toBe('ETH');
      expect(config.requiredPorts.length).toBeGreaterThan(0);
    });

    it('should resolve solana protocol from node_modules', () => {
      const config = configLoader.loadProtocolConfig('solana');

      expect(config.BLOCKCHAIN_PROTOCOL).toBe('solana');
      expect(config.customEnvVarsNamePrefix).toBe('SOLANA');
    });

    it('should check protocol existence via node_modules resolution', () => {
      expect(configLoader.protocolExists('dummy')).toBe(true);
      expect(configLoader.protocolExists('ethereum')).toBe(true);
      expect(configLoader.protocolExists('solana')).toBe(true);
      expect(configLoader.protocolExists('nonexistent')).toBe(false);
    });

    it('should resolve blueprint file paths from node_modules', () => {
      const nodeShPath = configLoader.getBlueprintFilePath('dummy', 'user-data/node.sh');

      expect(nodeShPath).toContain('node_modules');
      expect(nodeShPath).toContain('aws-bnr-blueprint-dummy');
      expect(nodeShPath).toContain('user-data/node.sh');
      expect(fs.existsSync(nodeShPath)).toBe(true);
    });

    it('should throw descriptive error for unknown protocol listing available ones', () => {
      expect(() => {
        configLoader.loadProtocolConfig('nonexistent');
      }).toThrow(/no installed package declares BLOCKCHAIN_PROTOCOL 'nonexistent'/);

      expect(() => {
        configLoader.loadProtocolConfig('nonexistent');
      }).toThrow(/Available protocols:/);
    });

    it('should return empty protocols when root package.json does not exist', () => {
      const originalPath = (configLoader as any).rootPackageJsonPath;
      (configLoader as any).rootPackageJsonPath = '/nonexistent/package.json';

      expect(configLoader.getAvailableProtocols()).toEqual([]);
      expect(configLoader.protocolExists('dummy')).toBe(false);

      (configLoader as any).rootPackageJsonPath = originalPath;
    });
  });

  describe('Blueprint conflict detection', () => {
    let mockDir: string;
    let mockConfigLoader: ConfigurationLoader;

    beforeEach(() => {
      // Create a temporary directory structure for mock node_modules
      mockDir = path.join(__dirname, '__mock_nm_conflict__');
      fs.mkdirSync(mockDir, { recursive: true });
    });

    afterEach(() => {
      fs.rmSync(mockDir, { recursive: true, force: true });
    });

    function setupMockBlueprints(
      rootPkg: any,
      packages: Record<string, any>,
    ) {
      // Write root package.json
      const rootPkgPath = path.join(mockDir, 'package.json');
      fs.writeFileSync(rootPkgPath, JSON.stringify(rootPkg));

      // Write each package's package.json in mock node_modules
      const nodeModulesDir = path.join(mockDir, 'node_modules');
      for (const [pkgName, pkgJson] of Object.entries(packages)) {
        const pkgDir = path.join(nodeModulesDir, pkgName);
        fs.mkdirSync(pkgDir, { recursive: true });
        fs.writeFileSync(path.join(pkgDir, 'package.json'), JSON.stringify(pkgJson));
      }

      // Create a ConfigurationLoader and override internal paths
      mockConfigLoader = new ConfigurationLoader();
      (mockConfigLoader as any).rootPackageJsonPath = rootPkgPath;
      (mockConfigLoader as any).nodeModulesPath = nodeModulesDir;
    }

    it('should throw error when two packages declare the same BLOCKCHAIN_PROTOCOL', () => {
      setupMockBlueprints(
        {
          name: 'test-app', version: '2.0.0',
          dependencies: { 'blueprint-a': 'file:a', 'blueprint-b': 'file:b' },
        },
        {
          'blueprint-a': {
            name: 'blueprint-a', version: '1.0.0',
            'aws-blockchain-node-runner': { BLOCKCHAIN_PROTOCOL: 'my-chain' },
          },
          'blueprint-b': {
            name: 'blueprint-b', version: '1.0.0',
            'aws-blockchain-node-runner': { BLOCKCHAIN_PROTOCOL: 'my-chain' },
          },
        },
      );

      expect(() => {
        mockConfigLoader.listAvailableProtocols();
      }).toThrow(/Conflict: two installed packages declare the same BLOCKCHAIN_PROTOCOL 'my-chain'/);

      expect(() => {
        mockConfigLoader.listAvailableProtocols();
      }).toThrow(/blueprint-a.*blueprint-b|blueprint-b.*blueprint-a/);
    });

    it('should not throw when packages declare different protocols', () => {
      setupMockBlueprints(
        {
          name: 'test-app', version: '2.0.0',
          dependencies: { 'blueprint-a': 'file:a', 'blueprint-b': 'file:b' },
        },
        {
          'blueprint-a': {
            name: 'blueprint-a', version: '1.0.0',
            'aws-blockchain-node-runner': { BLOCKCHAIN_PROTOCOL: 'chain-a' },
          },
          'blueprint-b': {
            name: 'blueprint-b', version: '1.0.0',
            'aws-blockchain-node-runner': { BLOCKCHAIN_PROTOCOL: 'chain-b' },
          },
        },
      );

      const protocols = mockConfigLoader.getAvailableProtocols();
      expect(protocols).toContain('chain-a');
      expect(protocols).toContain('chain-b');
    });

    it('should skip packages without aws-blockchain-node-runner field', () => {
      setupMockBlueprints(
        {
          name: 'test-app', version: '2.0.0',
          dependencies: { 'regular-package': '^1.0.0', 'blueprint-a': 'file:a' },
        },
        {
          'regular-package': { name: 'regular-package', version: '1.0.0' },
          'blueprint-a': {
            name: 'blueprint-a', version: '1.0.0',
            'aws-blockchain-node-runner': { BLOCKCHAIN_PROTOCOL: 'chain-a' },
          },
        },
      );

      const protocols = mockConfigLoader.getAvailableProtocols();
      expect(protocols).toEqual(['chain-a']);
    });

    it('should mark file: dependencies as built-in and others as external', () => {
      setupMockBlueprints(
        {
          name: 'test-app', version: '2.0.0',
          dependencies: { 'built-in-bp': 'file:blueprints/builtin', 'external-bp': '^1.0.0' },
        },
        {
          'built-in-bp': {
            name: 'built-in-bp', version: '1.0.0', description: 'Built-in',
            'aws-blockchain-node-runner': { BLOCKCHAIN_PROTOCOL: 'builtin-chain' },
          },
          'external-bp': {
            name: 'external-bp', version: '2.0.0', description: 'External',
            'aws-blockchain-node-runner': { BLOCKCHAIN_PROTOCOL: 'external-chain' },
          },
        },
      );

      const blueprints = mockConfigLoader.listAvailableProtocols();
      const builtInBp = blueprints.find(b => b.BLOCKCHAIN_PROTOCOL === 'builtin-chain');
      const externalBp = blueprints.find(b => b.BLOCKCHAIN_PROTOCOL === 'external-chain');

      expect(builtInBp!.isBuiltIn).toBe(true);
      expect(externalBp!.isBuiltIn).toBe(false);
    });

    it('should skip packages whose package.json is missing from node_modules', () => {
      // Only write root package.json, but don't create the package in node_modules
      const rootPkgPath = path.join(mockDir, 'package.json');
      fs.writeFileSync(rootPkgPath, JSON.stringify({
        name: 'test-app', version: '2.0.0',
        dependencies: { 'missing-bp': '^1.0.0' },
      }));

      const nodeModulesDir = path.join(mockDir, 'node_modules');
      fs.mkdirSync(nodeModulesDir, { recursive: true });

      mockConfigLoader = new ConfigurationLoader();
      (mockConfigLoader as any).rootPackageJsonPath = rootPkgPath;
      (mockConfigLoader as any).nodeModulesPath = nodeModulesDir;

      const protocols = mockConfigLoader.getAvailableProtocols();
      expect(protocols).toEqual([]);
    });
  });

  describe('Stack Name Prefix', () => {
    const singleNodeEnvPath = path.join(__dirname, '../../../blueprints/dummy/samples/.env-mainnet-single-node');
    const haNodesEnvPath = path.join(__dirname, '../../../blueprints/dummy/samples/.env-testnet-ha-nodes');

    describe('getStackName()', () => {
      it('should prepend prefix to stack name when STACK_NAME_PREFIX is set', () => {
        const protocolConfig = configLoader.loadProtocolConfig('dummy');
        const envConfig = configLoader.loadEnvironmentConfig(singleNodeEnvPath);
        envConfig.STACK_NAME_PREFIX = 'DEV';

        const deploymentConfig = { protocol: protocolConfig, environment: envConfig };
        const stackName = configLoader.getStackName(deploymentConfig);

        expect(stackName).toMatch(/^DEV-/);
        // Verify the base name follows the prefix
        const baseName = stackName.substring(4); // Remove 'DEV-'
        expect(baseName).toBe(`dummy-testnet-dummy-rpc-base`);
      });

      it('should return original name when prefix is undefined', () => {
        const protocolConfig = configLoader.loadProtocolConfig('dummy');
        const envConfig = configLoader.loadEnvironmentConfig(singleNodeEnvPath);
        // STACK_NAME_PREFIX is undefined by default (not in .env file)

        const deploymentConfig = { protocol: protocolConfig, environment: envConfig };
        const stackName = configLoader.getStackName(deploymentConfig);

        expect(stackName).not.toContain('undefined');
        expect(stackName).toBe(`dummy-testnet-dummy-rpc-base`);
      });

      it('should return original name when prefix is empty string', () => {
        const protocolConfig = configLoader.loadProtocolConfig('dummy');
        const envConfig = configLoader.loadEnvironmentConfig(singleNodeEnvPath);
        envConfig.STACK_NAME_PREFIX = '';

        const deploymentConfig = { protocol: protocolConfig, environment: envConfig };
        const stackName = configLoader.getStackName(deploymentConfig);

        expect(stackName).toBe(`dummy-testnet-dummy-rpc-base`);
      });

      it('should produce identical prefix behavior for single-node and ha-nodes modes', () => {
        const protocolConfig = configLoader.loadProtocolConfig('dummy');

        const singleNodeEnv = configLoader.loadEnvironmentConfig(singleNodeEnvPath);
        singleNodeEnv.STACK_NAME_PREFIX = 'STAGING';
        const singleNodeConfig = { protocol: protocolConfig, environment: singleNodeEnv };

        const haNodesEnv = configLoader.loadEnvironmentConfig(haNodesEnvPath);
        haNodesEnv.STACK_NAME_PREFIX = 'STAGING';
        const haNodesConfig = { protocol: protocolConfig, environment: haNodesEnv };

        const singleNodeStackName = configLoader.getStackName(singleNodeConfig);
        const haNodesStackName = configLoader.getStackName(haNodesConfig);

        // Both should start with the same prefix
        expect(singleNodeStackName).toMatch(/^STAGING-/);
        expect(haNodesStackName).toMatch(/^STAGING-/);
      });
    });

    describe('validateConfiguration() - prefix validation', () => {
      it('should reject prefix starting with a digit', () => {
        const config = configLoader.loadEnvironmentConfig(singleNodeEnvPath);
        config.STACK_NAME_PREFIX = '123';

        const result = configLoader.validateConfiguration(config);

        expect(result.isValid).toBe(false);
        expect(result.errors).toEqual(
          expect.arrayContaining([
            expect.stringContaining('STACK_NAME_PREFIX must contain only alphanumeric characters and hyphens'),
          ])
        );
      });

      it('should reject prefix containing underscore', () => {
        const config = configLoader.loadEnvironmentConfig(singleNodeEnvPath);
        config.STACK_NAME_PREFIX = 'MY_PREFIX';

        const result = configLoader.validateConfiguration(config);

        expect(result.isValid).toBe(false);
        expect(result.errors).toEqual(
          expect.arrayContaining([
            expect.stringContaining('STACK_NAME_PREFIX must contain only alphanumeric characters and hyphens'),
          ])
        );
      });

      it('should accept valid prefix "DEV"', () => {
        const config = configLoader.loadEnvironmentConfig(singleNodeEnvPath);
        config.STACK_NAME_PREFIX = 'DEV';

        const result = configLoader.validateConfiguration(config);

        expect(result.isValid).toBe(true);
      });

      it('should accept valid prefix "my-prefix"', () => {
        const config = configLoader.loadEnvironmentConfig(singleNodeEnvPath);
        config.STACK_NAME_PREFIX = 'my-prefix';

        const result = configLoader.validateConfiguration(config);

        expect(result.isValid).toBe(true);
      });

      it('should accept valid prefix "Test123"', () => {
        const config = configLoader.loadEnvironmentConfig(singleNodeEnvPath);
        config.STACK_NAME_PREFIX = 'Test123';

        const result = configLoader.validateConfiguration(config);

        expect(result.isValid).toBe(true);
      });

      it('should reject prefix that pushes total stack name length past 128 characters', () => {
        const config = configLoader.loadEnvironmentConfig(singleNodeEnvPath);
        // Create a prefix long enough to exceed 128 chars when combined with base name
        config.STACK_NAME_PREFIX = 'A' + 'a'.repeat(120);

        const result = configLoader.validateConfiguration(config);

        expect(result.isValid).toBe(false);
        expect(result.errors).toEqual(
          expect.arrayContaining([
            expect.stringContaining("128-character limit"),
          ])
        );
      });

      it('should pass validation when prefix is not set', () => {
        const config = configLoader.loadEnvironmentConfig(singleNodeEnvPath);
        // No STACK_NAME_PREFIX set

        const result = configLoader.validateConfiguration(config);

        expect(result.isValid).toBe(true);
      });
    });

    describe('parseEnvVars() - STACK_NAME_PREFIX parsing', () => {
      it('should store STACK_NAME_PREFIX on EnvironmentConfig when set via process.env', () => {
        const envVars: Record<string, string> = {
          AWS_ACCOUNT_ID: '123456789012',
          AWS_REGION: 'us-east-1',
          BLOCKCHAIN_PROTOCOL: 'dummy',
          DEPLOYMENT_MODE: 'single-node',
          INSTANCE_TYPE: 't3.medium',
          CPU_TYPE: 'x86_64',
          BC_NETWORK: 'testnet',
          CLIENT_CONFIG: 'dummy-1.0.0-rpc-base.sh',
          CLIENT_VERSION: 'v1.0.0',
          DATA_VOLUMES_COUNT: '1',
          SNAPSHOT_ENABLED: 'false',
          STACK_NAME_PREFIX: 'MYPREFIX',
        };

        Object.entries(envVars).forEach(([key, value]) => {
          process.env[key] = value;
        });

        const config = configLoader.loadEnvironmentFromProcessEnv();

        expect(config.STACK_NAME_PREFIX).toBe('MYPREFIX');

        // Clean up
        Object.keys(envVars).forEach(key => {
          delete process.env[key];
        });
      });

      it('should leave STACK_NAME_PREFIX undefined when not set in env vars', () => {
        const envVars: Record<string, string> = {
          AWS_ACCOUNT_ID: '123456789012',
          AWS_REGION: 'us-east-1',
          BLOCKCHAIN_PROTOCOL: 'dummy',
          DEPLOYMENT_MODE: 'single-node',
          INSTANCE_TYPE: 't3.medium',
          CPU_TYPE: 'x86_64',
          BC_NETWORK: 'testnet',
          CLIENT_CONFIG: 'dummy-1.0.0-rpc-base.sh',
          CLIENT_VERSION: 'v1.0.0',
          DATA_VOLUMES_COUNT: '1',
          SNAPSHOT_ENABLED: 'false',
        };

        Object.entries(envVars).forEach(([key, value]) => {
          process.env[key] = value;
        });

        const config = configLoader.loadEnvironmentFromProcessEnv();

        expect(config.STACK_NAME_PREFIX).toBeUndefined();

        // Clean up
        Object.keys(envVars).forEach(key => {
          delete process.env[key];
        });
      });

      it('should leave STACK_NAME_PREFIX undefined when set to empty string', () => {
        const envVars: Record<string, string> = {
          AWS_ACCOUNT_ID: '123456789012',
          AWS_REGION: 'us-east-1',
          BLOCKCHAIN_PROTOCOL: 'dummy',
          DEPLOYMENT_MODE: 'single-node',
          INSTANCE_TYPE: 't3.medium',
          CPU_TYPE: 'x86_64',
          BC_NETWORK: 'testnet',
          CLIENT_CONFIG: 'dummy-1.0.0-rpc-base.sh',
          CLIENT_VERSION: 'v1.0.0',
          DATA_VOLUMES_COUNT: '1',
          SNAPSHOT_ENABLED: 'false',
          STACK_NAME_PREFIX: '',
        };

        Object.entries(envVars).forEach(([key, value]) => {
          process.env[key] = value;
        });

        const config = configLoader.loadEnvironmentFromProcessEnv();

        expect(config.STACK_NAME_PREFIX).toBeUndefined();

        // Clean up
        Object.keys(envVars).forEach(key => {
          delete process.env[key];
        });
      });
    });
  });

  describe('Version compatibility via engines', () => {
    it('should have engines constraint on core package in dummy blueprint', () => {
      const pkgJsonPath = configLoader.getBlueprintFilePath('dummy', 'package.json');
      const pkgJson = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf8'));

      expect(pkgJson.engines).toBeDefined();
      expect(pkgJson.engines['aws-blockchain-node-runners']).toBeDefined();
    });

    it('should have engines constraint on core package in ethereum blueprint', () => {
      const pkgJsonPath = configLoader.getBlueprintFilePath('ethereum', 'package.json');
      const pkgJson = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf8'));

      expect(pkgJson.engines).toBeDefined();
      expect(pkgJson.engines['aws-blockchain-node-runners']).toBeDefined();
    });

    it('should have engines constraint on core package in solana blueprint', () => {
      const pkgJsonPath = configLoader.getBlueprintFilePath('solana', 'package.json');
      const pkgJson = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf8'));

      expect(pkgJson.engines).toBeDefined();
      expect(pkgJson.engines['aws-blockchain-node-runners']).toBeDefined();
    });
  });
});
