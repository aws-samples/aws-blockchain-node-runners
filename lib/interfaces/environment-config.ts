// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

/**
 * Environment configuration interfaces loaded from .env files
 */

import { DeploymentMode, CpuType } from './enums';
import { HAConfig } from './ha-config';
import { StorageVolumeConfig } from './protocol-config';

export interface EnvironmentConfig {
  // AWS Configuration
  AWS_ACCOUNT_ID: string;
  AWS_REGION: string;
  AWS_AZ?: string;
  
  // Blockchain Configuration
  BLOCKCHAIN_PROTOCOL: string;
  DEPLOYMENT_MODE: DeploymentMode;
  
  // Instance Configuration
  INSTANCE_TYPE: string;
  CPU_TYPE: CpuType;
  
  // Generic Protocol Configuration
  BC_NETWORK: string;
  CLIENT_CONFIG: string;
  CLIENT_VERSION: string;

  // Snapshot Configuration
  SNAPSHOT_ENABLED: boolean;
  SNAPSHOT_DOWNLOAD_URL?: string;
  SNAPSHOT_STAGING_VOL_SIZE?: number;  // Size in GiB for temp staging volume (0 = disabled)
  
  // Traffic Shaping Configuration
  TRAFFIC_SHAPING_ENABLED: boolean;
  TRAFFIC_SHAPING_RATE_MBIT?: number;
  TRAFFIC_SHAPING_CHECK_INTERVAL_SEC?: number;
  TRAFFIC_SHAPING_MAX_BLOCKS_BEHIND?: number;
  
  // Storage Configuration
  DATA_VOLUMES_COUNT: number;
  DATA_VOLUMES: StorageVolumeConfig[]; // Parsed storage volume configurations

  // Protocol-specific Configuration Variables
  CUSTOM_VARIABLES: { [key: string]: string }; // Protocol-specific environment variables

  // High Availability Configuration
  HA_CONFIG: HAConfig;

  // Stack Name Prefix (optional)
  STACK_NAME_PREFIX?: string;
}

// Keep required keys next to the interface for easy maintenance
export const ENVIRONMENT_CONFIG_KEYS: (keyof EnvironmentConfig)[] = [
    // AWS Configuration
    'AWS_ACCOUNT_ID',
    'AWS_REGION',
  
    // Blockchain Configuration
    'BLOCKCHAIN_PROTOCOL',
    'INSTANCE_TYPE',
    'DATA_VOLUMES',
];

/**
 * Default values for .env variables
 */
export const ENVIRONMENT_CONFIG_DEFAULTS = {
  // AWS Configuration
  AWS_ACCOUNT_ID: '',
  AWS_REGION: 'us-east-1',
  
  // Blockchain Configuration
  BLOCKCHAIN_PROTOCOL: '',
  DEPLOYMENT_MODE: '',
  
  // Instance Configuration
  INSTANCE_TYPE: '',
  CPU_TYPE: '',
  
  // Generic Protocol Configuration
  BC_NETWORK: '',
  CLIENT_CONFIG: '',
  CLIENT_VERSION: '',

  // Snapshot Configuration
  SNAPSHOT_ENABLED: false,
  SNAPSHOT_DOWNLOAD_URL: '',
  SNAPSHOT_STAGING_VOL_SIZE: 0,
  
  // Traffic Shaping Configuration
  TRAFFIC_SHAPING_ENABLED: false,
  TRAFFIC_SHAPING_RATE_MBIT: 40,
  TRAFFIC_SHAPING_CHECK_INTERVAL_SEC: 60,
  TRAFFIC_SHAPING_MAX_BLOCKS_BEHIND: 10,
  
  // Storage Configuration
  DATA_VOLUMES_COUNT: 0,
  DATA_VOLUMES: [], // Parsed storage volume configurations

  // Protocol-specific Configuration Variables
  CUSTOM_VARIABLES: [], // Protocol-specific environment variables

  // High Availability Configuration
  HA_CONFIG: {},
}
