// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';
import * as ec2 from "aws-cdk-lib/aws-ec2";
import {
  IConfigurationLoader,
  BlueprintInfo,
  ProtocolConfig,
  EnvironmentConfig,
  ValidationResult,
  StorageVolumeConfig,
  DeploymentMode,
  DeploymentConfig,
  CpuType,
  InstanceStoreageDeviceVolumeType,
  HAConfig,
  HA_CONFIG_KEYS,
  HA_CONFIG_DEFAULTS,
  ENVIRONMENT_CONFIG_KEYS,
  PROTOCOL_CONFIG_KEYS,
  NoneValue,
} from '../interfaces';

/**
 * Implementation of configuration loader for blockchain protocols and environments.
 * Resolves blueprint packages from node_modules/ via root package.json dependencies.
 */
export class ConfigurationLoader implements IConfigurationLoader {
  private blueprintsPath: string;
  private nodeModulesPath: string;
  private rootPackageJsonPath: string;

  constructor(blueprintsPath: string = 'blueprints') {
    this.blueprintsPath = blueprintsPath;
    this.nodeModulesPath = path.join(process.cwd(), 'node_modules');
    this.rootPackageJsonPath = path.join(process.cwd(), 'package.json');
  }

  /**
   * Load .env file into process.env if it exists
   */
  loadEnvFile(envFilePath?: string): boolean {
    const envPath = envFilePath || path.join(process.cwd(), '.env');
    if (fs.existsSync(envPath)) {
      dotenv.config({ path: envPath });
      return true;
    }
    return false;
  }

  /**
   * Get the protocol name from process.env
   */
  getProtocolName(): string {
    const protocol = process.env.BLOCKCHAIN_PROTOCOL;
    if (!protocol) {
      throw new Error('BLOCKCHAIN_PROTOCOL environment variable is required');
    }
    return protocol;
  }

  /**
   * Check if a protocol exists by scanning node_modules/ for blueprint packages
   */
  protocolExists(protocolName: string): boolean {
    try {
      const blueprints = this.resolveInstalledBlueprints();
      return blueprints.some(b => b.BLOCKCHAIN_PROTOCOL === protocolName);
    } catch {
      return false;
    }
  }

  /**
   * Get list of available protocols from installed blueprint packages in node_modules/
   */
  getAvailableProtocols(): string[] {
    try {
      const blueprints = this.resolveInstalledBlueprints();
      return blueprints.map(b => b.BLOCKCHAIN_PROTOCOL);
    } catch {
      return [];
    }
  }

  /**
   * List all protocols available from root package.json dependencies.
   * Returns metadata including package name, version, description, and whether it's built-in.
   */
  listAvailableProtocols(): BlueprintInfo[] {
    return this.resolveInstalledBlueprints();
  }

  /**
   * Resolve the absolute path to a file within a blueprint package in node_modules/.
   * @example getBlueprintFilePath('ethereum', 'user-data/node.sh')
   */
  getBlueprintFilePath(protocolName: string, relativePath: string): string {
    const packageName = this.findPackageNameForProtocol(protocolName);
    return path.join(this.nodeModulesPath, packageName, relativePath);
  }


  /**
   * Load and validate complete deployment configuration from .env file and protocol config.
   */
  loadDeploymentConfig(envFilePath?: string): DeploymentConfig {
    this.loadEnvFile(envFilePath);

    const protocolName = this.getProtocolName();
    if (!this.protocolExists(protocolName)) {
      const availableProtocols = this.getAvailableProtocols();
      throw new Error(
        `Protocol '${protocolName}' not found in installed blueprint packages.\n` +
        `Available protocols: ${availableProtocols.join(', ')}`
      );
    }

    const protocolConfig = this.loadProtocolConfig(protocolName);
    const envConfig = this.loadEnvironmentFromProcessEnv(protocolConfig);

    const validationResult = this.validateConfiguration(envConfig);
    if (!validationResult.isValid) {
      throw new Error(
        `Configuration validation failed:\n${validationResult.errors.map(e => `  - ${e}`).join('\n')}`
      );
    }

    if (envConfig.DEPLOYMENT_MODE == "ha-nodes") {
      const validationResultHA = this.validateConfiguration(envConfig);
      if (!validationResultHA.isValid) {
        throw new Error(
          `Configuration validation for HA setup is failed:\n${validationResultHA.errors.map(e => `  - ${e}`).join('\n')}`
        );
      }
    }

    const bcConfiguration = envConfig.CUSTOM_VARIABLES?.CLIENT_CONFIG || protocolConfig.defaultConfiguration;
    if (bcConfiguration) {
      const protocolValidation = this.validateProtocolConfiguration(protocolName, bcConfiguration);
      if (!protocolValidation.isValid) {
        throw new Error(
          `Protocol configuration validation failed:\n${protocolValidation.errors.map(e => `  - ${e}`).join('\n')}`
        );
      }
    }

    return {
      protocol: protocolConfig,
      environment: envConfig
    };
  }

  /**
   * Get stack name from deployment configuration
   */
  getStackName(deploymentConfig: DeploymentConfig): string {
    const protocolName = deploymentConfig.protocol.BLOCKCHAIN_PROTOCOL;
    const bcNetwork = deploymentConfig.environment.BC_NETWORK || 'mainnet';
    const clientConfig = deploymentConfig.environment.CLIENT_CONFIG;

    const sanitizedClientConfig = clientConfig
      .replace(/\.(sh|yml|yaml)$/i, '')
      .replace(/[._]/g, '')
      .replace(/[^A-Za-z-]/g, '')
      .replace(/--+/g, '-');

    const baseName = `${protocolName}-${bcNetwork}-${sanitizedClientConfig}`;
    const prefix = deploymentConfig.environment.STACK_NAME_PREFIX;
    return prefix ? `${prefix}-${baseName}` : baseName;
  }

  /**
   * Get HA config variables from environment config
   */
  getHAConfigVariables(environment: EnvironmentConfig): HAConfig {
    const validationResultHA = this.validateHAConfigVariables(environment);
    if (!validationResultHA.isValid) {
      throw new Error(
        `Configuration validation for HA setup is failed:\n${validationResultHA.errors.map(e => `  - ${e}`).join('\n')}`
      );
    }
    return environment.HA_CONFIG || HA_CONFIG_DEFAULTS;
  }

  /**
   * Get dashboard template path for a protocol based on deployment mode.
   * Tries protocol-specific template from node_modules/ first, then falls back to common template.
   */
  getDashboardTemplatePath(protocolName: string, deploymentMode?: DeploymentMode): string {
    const isHAMode = deploymentMode === DeploymentMode.HA_NODES;
    if (isHAMode) {
      throw new Error(`HA deployments do not include default monitoring dashboards. Users should create custom dashboards for HA deployments.`);
    }

    const protocolTemplateFileName = 'single-node-dashboard-template.json';

    // Try protocol-specific template from node_modules/
    try {
      const packageName = this.findPackageNameForProtocol(protocolName);
      const protocolDashboardPath = path.join(this.nodeModulesPath, packageName, 'monitoring', protocolTemplateFileName);
      if (fs.existsSync(protocolDashboardPath)) {
        return protocolDashboardPath;
      }
    } catch {
      // Protocol not found in node_modules, fall through to common template
    }

    // Fallback to common template
    const commonDashboardPath = path.join(process.cwd(), 'lib', 'common', 'monitoring-dashboards', protocolTemplateFileName);
    if (!fs.existsSync(commonDashboardPath)) {
      throw new Error(`Dashboard template not found: neither protocol-specific nor common template exists`);
    }

    console.log(`Using common dashboard template for ${protocolName}: ${commonDashboardPath}`);
    return commonDashboardPath;
  }

  /**
   * Get user data script path
   */
  getUserDataScriptPath(deploymentConfig: DeploymentConfig, assetsPath?: string): string {
    const userDataScriptFileName = deploymentConfig.protocol.userDataScriptFileName
      ? deploymentConfig.protocol.userDataScriptFileName
      : 'user-data-ubuntu.sh';
    const _assetsPath = assetsPath ? assetsPath : path.join(process.cwd(), 'assets', 'common');
    const userDataScriptPath = path.join(_assetsPath, userDataScriptFileName);
    if (!fs.existsSync(userDataScriptPath)) {
      throw new Error(`User data script not found: ${userDataScriptPath}`);
    }
    return userDataScriptPath;
  }


  /**
   * Load protocol configuration from the matching blueprint package in node_modules/.
   * Iterates root package.json dependencies to find the package whose
   * "aws-blockchain-node-runner".BLOCKCHAIN_PROTOCOL matches the requested protocol name.
   */
  loadProtocolConfig(protocolName: string): ProtocolConfig {
    const packageName = this.findPackageNameForProtocol(protocolName);
    const packageJsonPath = path.join(this.nodeModulesPath, packageName, 'package.json');

    let pkgJson: any;
    try {
      pkgJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
    } catch (error) {
      if (error instanceof SyntaxError) {
        throw new Error(`Invalid JSON in package.json for blueprint '${packageName}': ${packageJsonPath}`);
      }
      throw new Error(`Protocol configuration not found: ${packageJsonPath}`);
    }

    const bnrField = pkgJson['aws-blockchain-node-runner'];
    if (!bnrField) {
      throw new Error(`Protocol configuration not found: package '${packageName}' has no "aws-blockchain-node-runner" field`);
    }

    // Validate blueprint version compatibility with the core package
    this.validateBlueprintCompatibility(pkgJson, packageName);

    // Collect all validation errors and report them together
    const errors: string[] = [];

    // Validate required fields and types
    this.validateProtocolConfigStructure(bnrField, protocolName, errors);

    // Validate that files referenced in config actually exist on disk (in node_modules/)
    this.validateProtocolConfigFiles(bnrField, protocolName, packageName, errors);

    if (errors.length > 0) {
      throw new Error(
        `Blueprint validation failed for '${packageName}' (protocol '${protocolName}'):\n` +
        errors.map(e => `  - ${e}`).join('\n')
      );
    }

    return bnrField as ProtocolConfig;
  }

  /**
   * Load environment configuration from .env file
   */
  loadEnvironmentConfig(envPath: string): EnvironmentConfig {
    if (!fs.existsSync(envPath)) {
      throw new Error(`Environment configuration file not found: ${envPath}`);
    }
    const envVars = dotenv.parse(fs.readFileSync(envPath, 'utf8'));
    return this.parseEnvVars(envVars);
  }

  /**
   * Load environment configuration from process.env
   */
  loadEnvironmentFromProcessEnv(protocolConfig?: ProtocolConfig): EnvironmentConfig {
    const envVars: Record<string, string> = {};
    Object.keys(process.env).forEach(key => {
      if (process.env[key] !== undefined) {
        envVars[key] = process.env[key]!;
      }
    });
    return this.parseEnvVars(envVars, protocolConfig);
  }

  /**
   * Validate environment configuration for completeness and correctness
   */
  validateConfiguration(config: EnvironmentConfig): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (!config.AWS_ACCOUNT_ID) {
      errors.push('AWS_ACCOUNT_ID is required');
    } else if (!/^\d{12}$/.test(config.AWS_ACCOUNT_ID)) {
      errors.push('AWS_ACCOUNT_ID must be a 12-digit number');
    }

    const requiredFields = ENVIRONMENT_CONFIG_KEYS;
    requiredFields.forEach(field => {
      if (!(field in config)) {
        errors.push(`Missing required field '${field}'`);
      }
    });

    if (config.TRAFFIC_SHAPING_ENABLED) {
      if (config.TRAFFIC_SHAPING_RATE_MBIT !== undefined && config.TRAFFIC_SHAPING_RATE_MBIT < 0) {
        errors.push('TRAFFIC_SHAPING_RATE_MBIT must not be less than 0 Mbit/s');
      }
      if (config.TRAFFIC_SHAPING_CHECK_INTERVAL_SEC !== undefined && config.TRAFFIC_SHAPING_CHECK_INTERVAL_SEC < 0) {
        errors.push('TRAFFIC_SHAPING_CHECK_INTERVAL_SEC must not be less than 0 seconds');
      }
      if (config.TRAFFIC_SHAPING_MAX_BLOCKS_BEHIND !== undefined && config.TRAFFIC_SHAPING_MAX_BLOCKS_BEHIND < 0) {
        errors.push('TRAFFIC_SHAPING_MAX_BLOCKS_BEHIND must not be less than 0 blocks');
      }
    }

    // Snapshot URL must use HTTPS. The snapshot archive is downloaded and
    // extracted as root at boot, so it must arrive over an authenticated,
    // integrity-protected channel (HTTPS) — never plaintext HTTP, which is
    // trivially tampered with on the wire.
    if (config.SNAPSHOT_ENABLED && config.SNAPSHOT_DOWNLOAD_URL && config.SNAPSHOT_DOWNLOAD_URL !== NoneValue) {
      if (!/^https:\/\//i.test(config.SNAPSHOT_DOWNLOAD_URL)) {
        errors.push(
          `SNAPSHOT_DOWNLOAD_URL must use HTTPS (got '${config.SNAPSHOT_DOWNLOAD_URL}'). ` +
          `Snapshots are downloaded and extracted as root, so an unauthenticated HTTP source is not allowed.`
        );
      }
    }

    // Stack Name Prefix validation
    if (config.STACK_NAME_PREFIX && config.STACK_NAME_PREFIX.trim() !== '') {
      const prefix = config.STACK_NAME_PREFIX.trim();
      if (!/^[A-Za-z][A-Za-z0-9-]*$/.test(prefix)) {
        errors.push('STACK_NAME_PREFIX must contain only alphanumeric characters and hyphens, and must start with an alphabetic character');
      }

      // Estimate full stack name length: prefix + '-' + base name
      const baseNameEstimate = `${config.BLOCKCHAIN_PROTOCOL || ''}-${config.BC_NETWORK || ''}-${config.CLIENT_CONFIG || ''}`;
      const fullLength = prefix.length + 1 + baseNameEstimate.length;
      if (fullLength > 128) {
        errors.push(`Stack name with prefix exceeds CloudFormation's 128-character limit (current length: ${fullLength})`);
      }
    }

    // AWS AZ validation
    if (config.AWS_AZ) {
      const azPattern = /^[a-z]{2}-[a-z]+-\d+[a-z]$/;
      if (!azPattern.test(config.AWS_AZ)) {
        errors.push(
          `AWS_AZ '${config.AWS_AZ}' is not a valid availability zone format. ` +
          `Expected format: region code followed by a single lowercase letter (e.g., 'us-east-1a')`
        );
      } else if (!config.AWS_AZ.startsWith(config.AWS_REGION)) {
        errors.push(
          `AWS_AZ '${config.AWS_AZ}' does not belong to the configured AWS_REGION '${config.AWS_REGION}'. ` +
          `The availability zone must start with the region code.`
        );
      }

      if (config.DEPLOYMENT_MODE === DeploymentMode.HA_NODES) {
        warnings.push(
          `AWS_AZ is set to '${config.AWS_AZ}' but will be ignored for HA deployments. ` +
          `HA deployments use the Auto Scaling Group's default multi-AZ placement strategy.`
        );
      }
    }

    return { isValid: errors.length === 0, errors, warnings };
  }

  /**
   * Validate environment configuration for completeness and correctness of HA configuration
   */
  validateHAConfigVariables(config: EnvironmentConfig): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];
    const requiredFields = HA_CONFIG_KEYS;

    if (!config.HA_CONFIG) {
      errors.push('HA_CONFIG is missing from environment configuration');
      return { isValid: false, errors, warnings };
    }

    requiredFields.forEach(field => {
      if (!(field in config.HA_CONFIG!)) {
        errors.push(`Missing required field '${String(field)}' in HA configuration`);
      }
    });

    return { isValid: errors.length === 0, errors, warnings };
  }

  /**
   * Validate protocol-specific configuration compatibility
   */
  validateProtocolConfiguration(protocolName: string, configName: string): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    try {
      const protocolConfig = this.loadProtocolConfig(protocolName);
      const configExists = protocolConfig.availableConfigurations.some(c => c.name === configName);
      if (!configExists) {
        errors.push(`Configuration '${configName}' not found for protocol '${protocolName}'`);
        warnings.push(`Available configurations: ${protocolConfig.availableConfigurations.map(c => c.name).join(', ')}`);
      }
    } catch (error) {
      errors.push(`Failed to load protocol configuration: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }

    return { isValid: errors.length === 0, errors, warnings };
  }

  /**
   * Extract protocol-specific custom environment variables
   */
  extractProtocolCustomEnvVars(protocol: ProtocolConfig, env: EnvironmentConfig): Record<string, string> {
    const customVars: Record<string, string> = {};
    const prefix = protocol.customEnvVarsNamePrefix;

    Object.entries(env.CUSTOM_VARIABLES).forEach(([key, value]) => {
      if (key.startsWith(prefix + '_')) {
        customVars[key] = value;
      }
    });

    if (protocol.customEnvVars) {
      protocol.customEnvVars.forEach(varDef => {
        const [varName, defaultValue] = varDef.split('=');
        if (!customVars[varName] && defaultValue) {
          customVars[varName] = defaultValue;
        }
      });
    }

    return customVars;
  }


  // ─── Private helper methods ───────────────────────────────────────────────

  /**
   * Scan node_modules/ for installed blueprint packages by reading root package.json
   * dependencies and checking each for the "aws-blockchain-node-runner" field.
   * Throws if two packages declare the same BLOCKCHAIN_PROTOCOL.
   */
  private resolveInstalledBlueprints(): BlueprintInfo[] {
    if (!fs.existsSync(this.rootPackageJsonPath)) {
      return [];
    }

    let rootPkg: any;
    try {
      rootPkg = JSON.parse(fs.readFileSync(this.rootPackageJsonPath, 'utf8'));
    } catch {
      return [];
    }

    const dependencies: Record<string, string> = {
      ...(rootPkg.dependencies || {}),
      ...(rootPkg.devDependencies || {}),
    };

    const blueprints: BlueprintInfo[] = [];
    const protocolToPackage: Record<string, string> = {};

    for (const [pkgName, pkgVersion] of Object.entries(dependencies)) {
      const pkgJsonPath = path.join(this.nodeModulesPath, pkgName, 'package.json');
      if (!fs.existsSync(pkgJsonPath)) {
        continue;
      }

      let pkgJson: any;
      try {
        pkgJson = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf8'));
      } catch {
        continue;
      }

      const bnrField = pkgJson['aws-blockchain-node-runner'];
      if (!bnrField || !bnrField.BLOCKCHAIN_PROTOCOL) {
        continue;
      }

      const protocol = bnrField.BLOCKCHAIN_PROTOCOL as string;

      // Check for duplicate protocol declarations
      if (protocolToPackage[protocol]) {
        throw new Error(
          `Conflict: two installed packages declare the same BLOCKCHAIN_PROTOCOL '${protocol}': ` +
          `'${protocolToPackage[protocol]}' and '${pkgName}'. ` +
          `Remove one of them from your package.json dependencies.`
        );
      }
      protocolToPackage[protocol] = pkgName;

      blueprints.push({
        BLOCKCHAIN_PROTOCOL: protocol,
        packageName: pkgName,
        version: pkgJson.version || 'unknown',
        description: pkgJson.description || '',
        isBuiltIn: typeof pkgVersion === 'string' && pkgVersion.startsWith('file:'),
      });
    }

    return blueprints;
  }

  /**
   * Find the npm package name for a given protocol name.
   * Throws a descriptive error if not found or if there's a conflict.
   */
  private findPackageNameForProtocol(protocolName: string): string {
    const blueprints = this.resolveInstalledBlueprints();
    const match = blueprints.find(b => b.BLOCKCHAIN_PROTOCOL === protocolName);

    if (!match) {
      const available = blueprints.map(b => `${b.BLOCKCHAIN_PROTOCOL} (${b.packageName})`);
      throw new Error(
        `Protocol configuration not found: no installed package declares BLOCKCHAIN_PROTOCOL '${protocolName}'.\n` +
        `Available protocols: ${available.length > 0 ? available.join(', ') : 'none'}`
      );
    }

    return match.packageName;
  }

  /**
   * Parse environment variables into EnvironmentConfig
   */
  private parseEnvVars(envVars: Record<string, string>, protocolConfig?: ProtocolConfig): EnvironmentConfig {
    const config: EnvironmentConfig = {
      AWS_ACCOUNT_ID: envVars.AWS_ACCOUNT_ID,
      AWS_REGION: envVars.AWS_REGION || 'us-east-1',
      BLOCKCHAIN_PROTOCOL: envVars.BLOCKCHAIN_PROTOCOL,
      DEPLOYMENT_MODE: this.parseDeploymentMode(envVars.DEPLOYMENT_MODE),
      INSTANCE_TYPE: envVars.INSTANCE_TYPE,
      CPU_TYPE: this.parseCpuType(envVars.CPU_TYPE),
      BC_NETWORK: envVars.BC_NETWORK,
      CLIENT_CONFIG: envVars.CLIENT_CONFIG,
      CLIENT_VERSION: envVars.CLIENT_VERSION,
      SNAPSHOT_ENABLED: envVars.SNAPSHOT_ENABLED === "true",
      SNAPSHOT_DOWNLOAD_URL: envVars.SNAPSHOT_DOWNLOAD_URL || NoneValue,
      SNAPSHOT_STAGING_VOL_SIZE: envVars.SNAPSHOT_STAGING_VOL_SIZE ? parseInt(envVars.SNAPSHOT_STAGING_VOL_SIZE) : 0,
      TRAFFIC_SHAPING_ENABLED: envVars.TRAFFIC_SHAPING_ENABLED === "true",
      TRAFFIC_SHAPING_RATE_MBIT: envVars.TRAFFIC_SHAPING_RATE_MBIT ? parseInt(envVars.TRAFFIC_SHAPING_RATE_MBIT) : 40,
      TRAFFIC_SHAPING_CHECK_INTERVAL_SEC: envVars.TRAFFIC_SHAPING_CHECK_INTERVAL_SEC ? parseInt(envVars.TRAFFIC_SHAPING_CHECK_INTERVAL_SEC) : 60,
      TRAFFIC_SHAPING_MAX_BLOCKS_BEHIND: envVars.TRAFFIC_SHAPING_MAX_BLOCKS_BEHIND ? parseInt(envVars.TRAFFIC_SHAPING_MAX_BLOCKS_BEHIND) : 10,
      DATA_VOLUMES_COUNT: parseInt(envVars.DATA_VOLUMES_COUNT || '1'),
      DATA_VOLUMES: [],
      CUSTOM_VARIABLES: this.extractProtocolSpecificVars(envVars, protocolConfig),
      HA_CONFIG: {
        HA_NUMBER_OF_NODES: parseInt(envVars.HA_NUMBER_OF_NODES) || HA_CONFIG_DEFAULTS.HA_NUMBER_OF_NODES,
        HA_ALB_HEALTHCHECK_PORT: parseInt(envVars.HA_ALB_HEALTHCHECK_PORT) || HA_CONFIG_DEFAULTS.HA_ALB_HEALTHCHECK_PORT,
        HA_ALB_HEALTHCHECK_PATH: envVars.HA_ALB_HEALTHCHECK_PATH || HA_CONFIG_DEFAULTS.HA_ALB_HEALTHCHECK_PATH,
        HA_ALB_HEALTHCHECK_GRACE_PERIOD_MIN: parseInt(envVars.HA_ALB_HEALTHCHECK_GRACE_PERIOD_MIN) || HA_CONFIG_DEFAULTS.HA_ALB_HEALTHCHECK_GRACE_PERIOD_MIN,
        HA_ALB_HEALTHCHECK_INTERVAL_SEC: parseInt(envVars.HA_ALB_HEALTHCHECK_INTERVAL_SEC) || HA_CONFIG_DEFAULTS.HA_ALB_HEALTHCHECK_INTERVAL_SEC,
        HA_ALB_HEALTHCHECK_TIMEOUT_SEC: parseInt(envVars.HA_ALB_HEALTHCHECK_TIMEOUT_SEC) || HA_CONFIG_DEFAULTS.HA_ALB_HEALTHCHECK_TIMEOUT_SEC,
        HA_ALB_HEALTHCHECK_HEALTHY_THRESHOLD: parseInt(envVars.HA_ALB_HEALTHCHECK_HEALTHY_THRESHOLD) || HA_CONFIG_DEFAULTS.HA_ALB_HEALTHCHECK_HEALTHY_THRESHOLD,
        HA_ALB_HEALTHCHECK_UNHEALTHY_THRESHOLD: parseInt(envVars.HA_ALB_HEALTHCHECK_UNHEALTHY_THRESHOLD) || HA_CONFIG_DEFAULTS.HA_ALB_HEALTHCHECK_UNHEALTHY_THRESHOLD,
        HA_NODES_HEARTBEAT_DELAY_MIN: parseInt(envVars.HA_NODES_HEARTBEAT_DELAY_MIN) || HA_CONFIG_DEFAULTS.HA_NODES_HEARTBEAT_DELAY_MIN,
        HA_ALB_DEREGISTRATION_DELAY_SEC: parseInt(envVars.HA_ALB_DEREGISTRATION_DELAY_SEC) || HA_CONFIG_DEFAULTS.HA_ALB_DEREGISTRATION_DELAY_SEC,
        HA_ALB_HEALTHCHECK_HTTP_CODES: envVars.HA_ALB_HEALTHCHECK_HTTP_CODES || HA_CONFIG_DEFAULTS.HA_ALB_HEALTHCHECK_HTTP_CODES,
        HA_ALB_INTERNET_FACING: envVars.HA_ALB_INTERNET_FACING === "true",
        HA_ALB_ALLOWED_CIDR: envVars.HA_ALB_ALLOWED_CIDR || HA_CONFIG_DEFAULTS.HA_ALB_ALLOWED_CIDR,
        HA_ALB_CERTIFICATE_ARN: envVars.HA_ALB_CERTIFICATE_ARN || HA_CONFIG_DEFAULTS.HA_ALB_CERTIFICATE_ARN
      }
    };

    // Stack Name Prefix (optional)
    if (envVars.STACK_NAME_PREFIX && envVars.STACK_NAME_PREFIX.trim() !== '') {
      config.STACK_NAME_PREFIX = envVars.STACK_NAME_PREFIX.trim();
    }

    // AWS Availability Zone (optional)
    if (envVars.AWS_AZ && envVars.AWS_AZ.trim() !== '') {
      config.AWS_AZ = envVars.AWS_AZ.trim();
    }

    config.DATA_VOLUMES = this.parseDataVolumes(config, envVars);
    return config;
  }

  private parseDataVolumes(env: EnvironmentConfig, rawEnv?: Record<string, string>): StorageVolumeConfig[] {
    const volumes: StorageVolumeConfig[] = [];
    const envVars = rawEnv || {};

    for (let i = 1; i <= env.DATA_VOLUMES_COUNT; i++) {
      const volume: StorageVolumeConfig = {
        SIZE: parseInt(envVars[`DATA_VOL_${i}_SIZE`] || '100'),
        TYPE: this.parseVolumeType(envVars[`DATA_VOL_${i}_TYPE`] || 'gp3'),
        MOUNT_PATH: envVars[`DATA_VOL_${i}_MOUNT_PATH`] || `/data`,
        DEVICE_NAME: envVars[`DATA_VOL_${i}_DEVICE_NAME`] || `/dev/xvd${String.fromCharCode(102 + i)}`
      };

      if (envVars[`DATA_VOL_${i}_IOPS`]) volume.IOPS = parseInt(envVars[`DATA_VOL_${i}_IOPS`]);
      if (envVars[`DATA_VOL_${i}_THROUGHPUT`]) volume.THROUGHPUT = parseInt(envVars[`DATA_VOL_${i}_THROUGHPUT`]);
      if (envVars[`DATA_VOL_${i}_FILESYSTEM`]) volume.FILESYSTEM = envVars[`DATA_VOL_${i}_FILESYSTEM`] as 'ext4' | 'xfs';

      volumes.push(volume);
    }

    return volumes;
  }

  private parseDeploymentMode(mode: string | undefined): DeploymentMode {
    switch (mode) {
      case 'single-node': return DeploymentMode.SINGLE_NODE;
      case 'ha-nodes': return DeploymentMode.HA_NODES;
      default: return DeploymentMode.SINGLE_NODE;
    }
  }

  private parseCpuType(type: string | undefined): CpuType {
    switch (type) {
      case 'ARM_64': return CpuType.ARM_64;
      case 'x86_64':
      default: return CpuType.X86_64;
    }
  }

  parseVolumeType(dataVolumeType: string): ec2.EbsDeviceVolumeType.GP3 | ec2.EbsDeviceVolumeType.IO2 | ec2.EbsDeviceVolumeType.IO1 | 'instance-store' {
    switch (dataVolumeType) {
      case "gp3": return ec2.EbsDeviceVolumeType.GP3;
      case "io2": return ec2.EbsDeviceVolumeType.IO2;
      case "io1": return ec2.EbsDeviceVolumeType.IO1;
      case "instance-store": return InstanceStoreageDeviceVolumeType;
      default: return ec2.EbsDeviceVolumeType.GP3;
    }
  }

  private extractProtocolSpecificVars(envVars: Record<string, string>, protocolConfig?: ProtocolConfig): { [key: string]: string } {
    const protocolVars: { [key: string]: string } = {};

    if (protocolConfig) {
      const prefix = protocolConfig.customEnvVarsNamePrefix;
      Object.entries(envVars).forEach(([key, value]) => {
        if (key.startsWith(`${prefix}_`)) {
          protocolVars[key] = value;
        }
      });
    } else {
      Object.entries(envVars).forEach(([key, value]) => {
        if (key.includes('_') && key === key.toUpperCase() &&
          !key.startsWith('AWS_') &&
          !key.startsWith('DATA_VOL_') &&
          !key.startsWith('HA_') &&
          !['BLOCKCHAIN_PROTOCOL', 'DEPLOYMENT_MODE', 'INSTANCE_TYPE', 'CPU_TYPE', 'DATA_VOLUMES_COUNT', 'SNAPSHOT_ENABLED', 'SNAPSHOT_DOWNLOAD_URL', 'SNAPSHOT_STAGING_VOL_SIZE'].includes(key)) {
          protocolVars[key] = value;
        }
      });
    }

    return protocolVars;
  }

  /**
   * Validate that files referenced in protocol config actually exist on disk (in node_modules/).
   * Collects all errors into the provided array rather than throwing on the first.
   */
  private validateProtocolConfigFiles(config: any, protocolName: string, packageName: string, errors: string[]): void {
    const protocolDir = path.join(this.nodeModulesPath, packageName);

    if (Array.isArray(config.availableConfigurations)) {
      config.availableConfigurations.forEach((entry: any) => {
        if (!entry.name) {
          errors.push(
            `availableConfigurations entry is missing 'name' field in protocol '${protocolName}'. ` +
            `Each entry must be an object with 'name' and 'version' fields.`
          );
          return;
        }
        const configFilePath = path.join(protocolDir, 'configurations', entry.name);
        if (!fs.existsSync(configFilePath)) {
          errors.push(
            `Configuration file '${entry.name}' listed in availableConfigurations not found: ${configFilePath}`
          );
        }
      });
    }

    // Check required user-data/node.sh script exists
    const nodeShPath = path.join(protocolDir, 'user-data', 'node.sh');
    if (!fs.existsSync(nodeShPath)) {
      errors.push(
        `Required user-data script 'user-data/node.sh' not found for protocol '${protocolName}': ${nodeShPath}`
      );
    }
  }

  /**
   * Validate that the "aws-blockchain-node-runner" field contains all required fields
   * and that their types conform to the ProtocolConfig schema.
   * Collects all errors into the provided array rather than throwing on the first.
   */
  /**
   * Validate that a blueprint's engine requirement is compatible with the core package version.
   * Reads the "engines"."aws-blockchain-node-runners" field from the blueprint's package.json
   * and compares it against the root package version.
   */
  private validateBlueprintCompatibility(blueprintPkgJson: any, packageName: string): void {
    const requiredRange = blueprintPkgJson?.engines?.['aws-blockchain-node-runners'];
    if (!requiredRange) {
      return; // No engine constraint declared — skip check
    }

    let rootPkg: any;
    try {
      rootPkg = JSON.parse(fs.readFileSync(this.rootPackageJsonPath, 'utf8'));
    } catch {
      return; // Can't read root package.json — skip check
    }

    const coreVersion = rootPkg.version;
    if (!coreVersion) {
      return; // No version in root package — skip check
    }

    if (!this.satisfiesVersionRange(coreVersion, requiredRange)) {
      throw new Error(
        `Blueprint '${packageName}' requires aws-blockchain-node-runners ${requiredRange}, ` +
        `but the installed core version is ${coreVersion}. ` +
        `Please update the core package or use a compatible blueprint version.`
      );
    }
  }

  /**
   * Minimal semver range check supporting >=X.Y.Z and ^X.Y.Z patterns.
   * Returns true if `version` satisfies the given `range`.
   */
  private satisfiesVersionRange(version: string, range: string): boolean {
    const parseVersion = (v: string): [number, number, number] | null => {
      const match = v.match(/^(\d+)\.(\d+)\.(\d+)/);
      if (!match) return null;
      return [parseInt(match[1], 10), parseInt(match[2], 10), parseInt(match[3], 10)];
    };

    const compareVersions = (a: [number, number, number], b: [number, number, number]): number => {
      for (let i = 0; i < 3; i++) {
        if (a[i] !== b[i]) return a[i] - b[i];
      }
      return 0;
    };

    const current = parseVersion(version);
    if (!current) return true; // Unparseable version — don't block

    // Handle >=X.Y.Z
    const gteMatch = range.match(/^>=\s*(.+)$/);
    if (gteMatch) {
      const min = parseVersion(gteMatch[1]);
      if (!min) return true;
      return compareVersions(current, min) >= 0;
    }

    // Handle ^X.Y.Z (compatible with: same major, >= minor.patch)
    const caretMatch = range.match(/^\^(.+)$/);
    if (caretMatch) {
      const base = parseVersion(caretMatch[1]);
      if (!base) return true;
      if (current[0] !== base[0]) return false;
      return compareVersions(current, base) >= 0;
    }

    // Handle exact version
    const exact = parseVersion(range);
    if (exact) {
      return compareVersions(current, exact) === 0;
    }

    return true; // Unrecognized range format — don't block
  }

  private validateProtocolConfigStructure(config: any, protocolName: string, errors: string[]): void {
    const requiredFields = PROTOCOL_CONFIG_KEYS;

    requiredFields.forEach(field => {
      if (!(field in config)) {
        errors.push(`Missing required field '${field}' in protocol configuration for ${protocolName}`);
      }
    });

    if ('supportedDeploymentModes' in config && !Array.isArray(config.supportedDeploymentModes)) {
      errors.push(`supportedDeploymentModes must be an array in protocol configuration for ${protocolName}`);
    }

    if ('requiredPorts' in config && !Array.isArray(config.requiredPorts)) {
      errors.push(`requiredPorts must be an array in protocol configuration for ${protocolName}`);
    }

    if ('monitoring' in config) {
      if (!config.monitoring.healthCheckPath || !config.monitoring.metricsPort) {
        errors.push(`monitoring configuration must include healthCheckPath and metricsPort for ${protocolName}`);
      }
    }

    if ('storage' in config) {
      if (!config.storage.defaultDataVolumes || !Array.isArray(config.storage.defaultDataVolumes)) {
        errors.push(`storage configuration must include defaultDataVolumes array for ${protocolName}`);
      }
    }

    // Validate defaultConfiguration exists in availableConfigurations
    if ('defaultConfiguration' in config && 'availableConfigurations' in config && Array.isArray(config.availableConfigurations)) {
      const configNames = config.availableConfigurations.map((c: any) => c.name);
      if (!configNames.includes(config.defaultConfiguration)) {
        errors.push(
          `defaultConfiguration '${config.defaultConfiguration}' does not exist in availableConfigurations for ${protocolName}. ` +
          `Available: ${configNames.join(', ')}`
        );
      }
    }
  }
}
