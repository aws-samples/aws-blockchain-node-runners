// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

/**
 * Enums for the Universal Blockchain Node Runner
 */

/**
 * Deployment modes supported by the universal blockchain node runner
 */
export enum DeploymentMode {
  SINGLE_NODE = "single-node",
  HA_NODES = "ha-nodes"
}

/**
 * CPU architectures supported for blockchain node deployment
 */
export enum CpuType {
  X86_64 = "x86_64",
  ARM_64 = "ARM_64"
}
