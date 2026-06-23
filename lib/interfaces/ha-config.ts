// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

/**
 * Additional environment configuration used during HA deployment 
 */
export interface HAConfig {
    HA_NUMBER_OF_NODES: number,
    HA_ALB_HEALTHCHECK_PORT: number,
    HA_ALB_HEALTHCHECK_PATH: string, 
    HA_ALB_HEALTHCHECK_GRACE_PERIOD_MIN: number, 
    HA_ALB_HEALTHCHECK_INTERVAL_SEC: number,
    HA_ALB_HEALTHCHECK_TIMEOUT_SEC: number,
    HA_ALB_HEALTHCHECK_HEALTHY_THRESHOLD: number,
    HA_ALB_HEALTHCHECK_UNHEALTHY_THRESHOLD: number,
    HA_NODES_HEARTBEAT_DELAY_MIN: number,
    HA_ALB_DEREGISTRATION_DELAY_SEC: number,
    // HTTP status codes the ALB accepts as healthy (e.g. "200" or "200,405").
    // Protocols whose RPC server doesn't respond 200 to GET need this — for
    // example Bitcoin Core returns 405 Method Not Allowed on GET requests.
    HA_ALB_HEALTHCHECK_HTTP_CODES: string,
    // --- ALB exposure controls (security) ---
    // Default is an INTERNAL load balancer reachable only from within the VPC.
    // Set HA_ALB_INTERNET_FACING="true" to expose the endpoint to the internet
    // (you MUST also scope HA_ALB_ALLOWED_CIDR and should set
    // HA_ALB_CERTIFICATE_ARN for TLS).
    HA_ALB_INTERNET_FACING: boolean,
    // CIDR allowed to reach the ALB listener. Empty => fall back to the VPC
    // CIDR (VPC-internal access only).
    HA_ALB_ALLOWED_CIDR: string,
    // Optional ACM certificate ARN. When set, the ALB listener uses HTTPS (TLS
    // terminated at the ALB); otherwise HTTP. "none"/empty => HTTP.
    HA_ALB_CERTIFICATE_ARN: string,
}

// Keep required keys next to the interface for easy maintenance
export const HA_CONFIG_KEYS: (keyof HAConfig)[] = [
    'HA_NUMBER_OF_NODES',
    'HA_ALB_HEALTHCHECK_PORT',
    'HA_ALB_HEALTHCHECK_PATH',
    'HA_ALB_HEALTHCHECK_GRACE_PERIOD_MIN',
    'HA_ALB_HEALTHCHECK_INTERVAL_SEC',
    'HA_ALB_HEALTHCHECK_TIMEOUT_SEC',
    'HA_ALB_HEALTHCHECK_HEALTHY_THRESHOLD',
    'HA_ALB_HEALTHCHECK_UNHEALTHY_THRESHOLD',
    'HA_NODES_HEARTBEAT_DELAY_MIN',
    'HA_ALB_DEREGISTRATION_DELAY_SEC'
];

export const HA_CONFIG_DEFAULTS: HAConfig = {
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
  HA_ALB_HEALTHCHECK_HTTP_CODES: '200',
  // Secure-by-default: internal ALB, VPC-only ingress, no TLS cert (HTTP).
  HA_ALB_INTERNET_FACING: false,
  HA_ALB_ALLOWED_CIDR: '',
  HA_ALB_CERTIFICATE_ARN: 'none',
}
