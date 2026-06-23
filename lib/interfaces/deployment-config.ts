// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

/**
 * Deployment configuration interfaces combining protocol and environment configurations
 */

import { ProtocolConfig } from './protocol-config';
import { EnvironmentConfig } from './environment-config';

/**
 * Validation result interface for configuration validation
 */
export interface ValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
}

/**
 * Complete deployment configuration combining protocol and environment configurations
 */
export interface DeploymentConfig {
  protocol: ProtocolConfig;
  environment: EnvironmentConfig;
}
