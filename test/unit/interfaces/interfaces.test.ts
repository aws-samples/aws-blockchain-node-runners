// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

/**
 * Test to verify that all interfaces can be imported correctly
 */

import {
  DeploymentMode,
  CpuType,
  ProtocolConfig,
  EnvironmentConfig,
  DeploymentConfig,
  ValidationResult,
  Configuration,
  PortConfig,
  StorageVolumeConfig,
  StorageConfig,
  MonitoringConfig,
  SnapshotConfig,
  HAConfig
} from '../../../lib/interfaces';

describe('Interfaces Import Test', () => {
  it('should import all enums correctly', () => {
    expect(DeploymentMode.SINGLE_NODE).toBe('single-node');
    expect(DeploymentMode.HA_NODES).toBe('ha-nodes');
    expect(CpuType.X86_64).toBe('x86_64');
    expect(CpuType.ARM_64).toBe('ARM_64');
  });

  it('should have all interface types available', () => {
    // This test verifies that TypeScript can resolve all interface types
    // If any interface is missing or has issues, TypeScript compilation will fail
    
    const mockProtocolConfig: ProtocolConfig = {
      BLOCKCHAIN_PROTOCOL: 'test',
      defaultConfiguration: 'test-node',
      availableConfigurations: [ 
        {
          "name": "test-node-base"
        },
        {
          "name": "test-node-extended"
        }
      ],
      BC_NETWORKS: ['mainnet', 'testnet'],
      supportedDeploymentModes: [DeploymentMode.SINGLE_NODE],
      defaultInstanceTypes: { [CpuType.X86_64]: 'm5.large' },
      requiredPorts: [],
      monitoring: { healthCheckPath: '/', metricsPort: 8080 },
      storage: { defaultDataVolumes: [] },
      customEnvVarsNamePrefix: 'TEST'
    };

    const mockEnvironmentConfig: EnvironmentConfig = {
      AWS_ACCOUNT_ID: '123456789012',
      AWS_REGION: 'us-east-1',
      BLOCKCHAIN_PROTOCOL: 'test',
      DEPLOYMENT_MODE: DeploymentMode.SINGLE_NODE,
      INSTANCE_TYPE: 'm5.large',
      CPU_TYPE: CpuType.X86_64,
      BC_NETWORK: 'mainnet',
      CLIENT_CONFIG: 'test-base',
      CLIENT_VERSION: 'v1.0.0',
      SNAPSHOT_ENABLED: false,
      TRAFFIC_SHAPING_ENABLED: false,
      TRAFFIC_SHAPING_RATE_MBIT: 40,
      TRAFFIC_SHAPING_CHECK_INTERVAL_SEC: 60,
      TRAFFIC_SHAPING_MAX_BLOCKS_BEHIND: 10,
      DATA_VOLUMES_COUNT: 1,
      DATA_VOLUMES: [],
      CUSTOM_VARIABLES: {},
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

    const mockDeploymentConfig: DeploymentConfig = {
      protocol: mockProtocolConfig,
      environment: mockEnvironmentConfig
    };

    const mockValidationResult: ValidationResult = {
      isValid: true,
      errors: [],
      warnings: []
    };

    // If we reach this point, all interfaces are properly defined and importable
    expect(mockProtocolConfig).toBeDefined();
    expect(mockEnvironmentConfig).toBeDefined();
    expect(mockDeploymentConfig).toBeDefined();
    expect(mockValidationResult).toBeDefined();
  });
});
