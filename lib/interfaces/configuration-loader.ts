// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import {
  ProtocolConfig,
  EnvironmentConfig,
  DeploymentConfig,
  ValidationResult,
  DeploymentMode
} from './index';

/**
 * Metadata about an installed blueprint package.
 */
export interface BlueprintInfo {
  BLOCKCHAIN_PROTOCOL: string;
  packageName: string;
  version: string;
  description: string;
  isBuiltIn: boolean; // true if dependency uses file: path prefix
}

/**
 * Interface for loading and validating blockchain protocol and environment configurations
 */
export interface IConfigurationLoader {
  /**
   * Load .env file into process.env if it exists
   * @param envFilePath Path to the .env file (defaults to .env in current directory)
   * @returns true if file was loaded, false if not found
   */
  loadEnvFile(envFilePath?: string): boolean;

  /**
   * Get the protocol name from process.env
   * @returns Protocol name
   * @throws Error if BLOCKCHAIN_PROTOCOL is not set
   */
  getProtocolName(): string;

  /**
   * Check if a protocol exists
   * @param protocolName Name of the protocol
   * @returns true if protocol exists
   */
  protocolExists(protocolName: string): boolean;

  /**
   * Get list of available protocols
   * @returns Array of protocol names
   */
  getAvailableProtocols(): string[];

  /**
   * Load and validate complete deployment configuration from .env file and protocol config.
   * This is the main entry point for loading all configuration in production.
   * @param envFilePath Optional path to .env file (defaults to .env in current directory)
   * @returns Complete deployment configuration
   * @throws Error if configuration is invalid or missing required values
   */
  loadDeploymentConfig(envFilePath?: string): DeploymentConfig;

  /**
   * Get stack name from deployment configuration
   * @param deploymentConfig Deployment configuration
   * @returns Generated stack name
   */
  getStackName(deploymentConfig: DeploymentConfig): string;

  /**
   * Get dashboard template path for a protocol based on deployment mode
   * @param protocolName Protocol name
   * @param deploymentMode Optional deployment mode (single-node or ha-nodes)
   * @returns Path to dashboard template or undefined
   */
  getDashboardTemplatePath(protocolName: string, deploymentMode?: DeploymentMode): string | undefined;

  /**
   * Load protocol configuration from JSON file
   * @param protocolName Name of the protocol to load
   * @returns Protocol configuration object
   * @throws Error if protocol not found or configuration invalid
   */
  loadProtocolConfig(protocolName: string): ProtocolConfig;

  /**
   * Load environment configuration from .env file
   * @param envPath Path to the .env file
   * @returns Environment configuration object
   * @throws Error if file not found or configuration invalid
   */
  loadEnvironmentConfig(envPath: string): EnvironmentConfig;

  /**
   * Load environment configuration from process.env
   * @param protocolConfig Optional protocol config for extracting protocol-specific vars
   * @returns Environment configuration object
   */
  loadEnvironmentFromProcessEnv(protocolConfig?: ProtocolConfig): EnvironmentConfig;

  /**
   * Validate environment configuration for completeness and correctness
   * @param config Environment configuration to validate
   * @returns Validation result with errors and warnings
   */
  validateConfiguration(config: EnvironmentConfig): ValidationResult;

  /**
   * Validate environment configuration for completeness and correctness for HA setup
   * @param config Environment configuration to validate
   * @returns Validation result with errors and warnings
   */
  validateHAConfigVariables(config: EnvironmentConfig): ValidationResult

  /**
   * Validate protocol-specific configuration compatibility
   * @param protocolName Name of the protocol
   * @param configName Name of the configuration
   * @returns Validation result with errors and warnings
   */
  validateProtocolConfiguration(protocolName: string, configName: string): ValidationResult;

  /**
   * Extract protocol-specific custom environment variables
   * @param protocol Protocol configuration containing custom variable definitions
   * @param env Environment configuration containing variable values
   * @returns Record of custom environment variables
   */
  extractProtocolCustomEnvVars(protocol: ProtocolConfig, env: EnvironmentConfig): Record<string, string>;

  /**
   * List all protocols available from root package.json dependencies.
   * Returns metadata including package name, version, description, and whether it's built-in.
   * Used by the GenAI assistant for blueprint discovery.
   * @returns Array of BlueprintInfo objects for each installed blueprint package
   */
  listAvailableProtocols(): BlueprintInfo[];

  /**
   * Resolve the absolute path to a file within a blueprint package in node_modules/.
   * @param protocolName Name of the blockchain protocol
   * @param relativePath Relative path to the file within the blueprint package
   * @returns Absolute path to the file
   * @throws Error if no installed package declares the given protocol
   * @example getBlueprintFilePath('ethereum', 'user-data/node.sh')
   */
  getBlueprintFilePath(protocolName: string, relativePath: string): string;
}
