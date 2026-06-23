// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

/**
 * Protocol configuration interfaces for blockchain protocols
 */

import { DeploymentMode, CpuType } from './enums';

/**
 * Configuration for a specific blockchain client/version combination.
 *
 * The client version is encoded in the configuration file name (e.g.
 * `geth-1.17.3-lighthouse-8.1.3-full.yml`), which is the single source of
 * truth. There is intentionally no separate `version` field to avoid
 * duplicating the version string.
 */
export interface Configuration {
  name: string;
}

/**
 * Port configuration for blockchain protocols
 */
export interface PortConfig {
  port?: number;
  portRange?: {
    from: number;
    to: number;
  };
  protocol: "tcp" | "udp";
  description: string;
  public?: boolean;
}

/**
 * Storage volume configuration
 */
export interface StorageVolumeConfig {
  TYPE: "gp3" | "io1" | "io2" | "instance-store";
  SIZE: number; // In GiB
  FILESYSTEM?: "ext4" | "xfs";
  IOPS?: number;
  THROUGHPUT?: number;
  MOUNT_PATH: string;
  DEVICE_NAME: string;
}

/**
 * Storage configuration for a protocol
 */
export interface StorageConfig {
  defaultDataVolumes: StorageVolumeConfig[];
}

/**
 * Monitoring configuration for health checks and metrics
 */
export interface MonitoringConfig {
  healthCheckPath: string;
  metricsPort: number;
  clientNames?: string[]; // Array of client names for dashboard variable substitution (e.g., ["Execution Client", "Consensus Client"])
}

/**
 * Snapshot configuration for blockchain data initialization
 */
export interface SnapshotConfig {
  enabled: boolean;
  downloadUrl?: string;
}

/**
 * Complete protocol configuration defining all aspects of a blockchain protocol
 */
export interface ProtocolConfig {
  BLOCKCHAIN_PROTOCOL: string;
  BC_NETWORKS: string[];
  defaultConfiguration: string;
  availableConfigurations: Configuration[];
  supportedDeploymentModes: DeploymentMode[];
  defaultInstanceTypes: Partial<Record<CpuType, string>>;
  requiredPorts: PortConfig[];
  monitoring: MonitoringConfig;
  storage: StorageConfig;
  snapshot?: SnapshotConfig;
  customEnvVarsNamePrefix: string;
  customEnvVars?: string[];
  userDataScriptFileName?: string;
}

// Keep required keys next to the interface for easy maintenance
export const PROTOCOL_CONFIG_KEYS: (keyof ProtocolConfig)[] = [
    'BLOCKCHAIN_PROTOCOL',
    'BC_NETWORKS',
    'supportedDeploymentModes',
    'defaultInstanceTypes',
    'requiredPorts',
    'monitoring',
    'storage',
    'customEnvVarsNamePrefix'
];
