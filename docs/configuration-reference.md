# Configuration Reference

This document provides a comprehensive reference for all configuration options in the Universal Blockchain Node Runner.

## Overview

Configuration is managed through two main sources:

1. **`.env` file**: User-provided environment configuration
2. **Blueprint `package.json`**: Protocol-specific metadata (in `"aws-blockchain-node-runner"` field), resolved from the installed NPM package in `node_modules/`

Blueprints are NPM packages. Built-in blueprints (ethereum, solana, dummy) ship under `blueprints/` and are referenced as `file:` path dependencies in the root `package.json`. External blueprints are installed via `npm install`. After `npm install`, all blueprints land in `node_modules/` and the `ConfigurationLoader` resolves them from there — no distinction between built-in and external.

The application loads these configurations, validates them, and uses them to deploy the appropriate infrastructure.

## Environment Variables (.env)

### AWS Configuration

| Variable | Required | Description | Example |
|----------|----------|-------------|---------|
| `AWS_ACCOUNT_ID` | Yes | AWS account ID for deployment | `123456789012` |
| `AWS_REGION` | Yes | AWS region for deployment | `us-east-1` |
| `AWS_AZ` | No | Availability zone for single-node deployments (overrides automatic AZ selection) | `us-east-1a` |

**Notes**:
- Account ID must be a 12-digit number
- Region must be a valid AWS region code
- AZ must match the format `<region><letter>` (e.g., `us-east-1a`) and belong to the configured `AWS_REGION`. Ignored for HA deployments.

### Blockchain Configuration

| Variable | Required | Description | Example | Valid Values |
|----------|----------|-------------|---------|--------------|
| `BLOCKCHAIN_PROTOCOL` | Yes | Blockchain protocol to deploy | `ethereum` | Any installed blueprint package |
| `DEPLOYMENT_MODE` | Yes | Deployment architecture | `single-node` | `single-node`, `ha-nodes` |
| `BC_NETWORK` | Yes | Blockchain network | `mainnet` | Defined in protocol's `package.json` |
| `CLIENT_CONFIG` | Yes | Client configuration name | `geth-lighthouse` | Defined in protocol's `package.json` |
| `CLIENT_VERSION` | No | Override default client version | `v1.14.12-v6.0.1` | Protocol-specific version string |

**Notes**:
- `BLOCKCHAIN_PROTOCOL` must match the `BLOCKCHAIN_PROTOCOL` value declared in an installed blueprint package's `"aws-blockchain-node-runner"` field
- `DEPLOYMENT_MODE` determines whether to create single-node or HA infrastructure
- `BC_NETWORK` must be one of the networks listed in the protocol's `package.json`
- `CLIENT_CONFIG` must be one of the configurations listed in the protocol's `package.json`
- `CLIENT_VERSION` is optional; if not provided, uses the version from the selected configuration

### Stack Name Prefix

| Variable | Required | Description | Example | Valid Values |
|----------|----------|-------------|---------|--------------|
| `STACK_NAME_PREFIX` | No | Prefix prepended to the auto-generated stack name | `DEV` | Alphanumeric + hyphens, must start with alpha |

**Notes**:
- Enables multiple deployments of the same protocol/network/config on a single AWS account
- When set, the stack name becomes `{prefix}-{protocol}-{network}-{sanitizedClientConfig}` (e.g., `DEV-ethereum-mainnet-geth-lighthouse-full`)
- When not set or empty, the stack name is unchanged (current behavior)
- Must match the pattern `/^[A-Za-z][A-Za-z0-9-]*$/` (starts with a letter, then letters, digits, or hyphens)
- The combined stack name (prefix + `-` + base name) must not exceed 128 characters (CloudFormation limit)

**Example**:
```bash
# Deploy a DEV instance alongside a PROD instance of the same config
STACK_NAME_PREFIX="DEV"
# Resulting stack name: DEV-ethereum-mainnet-geth-lighthouse-full
```

### Instance Configuration

| Variable | Required | Description | Example | Valid Values |
|----------|----------|-------------|---------|--------------|
| `INSTANCE_TYPE` | Yes | EC2 instance type | `m6a.2xlarge` | Valid AWS EC2 instance type |
| `CPU_TYPE` | Yes | CPU architecture | `x86_64` | `x86_64`, `ARM_64` |

**Notes**:
- Instance type must be available in the selected region
- CPU type must match the instance type architecture
- Recommended instance types are defined in protocol's `package.json`

**Common Instance Types**:

| Use Case | x86_64 | ARM_64 | vCPUs | Memory |
|----------|--------|--------|-------|--------|
| Development/Testing | t3.medium | t4g.medium | 2 | 4 GB |
| Light Production | m6a.large | m6g.large | 2 | 8 GB |
| Standard Production | m6a.2xlarge | m6g.2xlarge | 8 | 32 GB |
| High Performance | m6a.4xlarge | m6g.4xlarge | 16 | 64 GB |
| Storage Optimized | i4i.2xlarge | i4g.2xlarge | 8 | 64 GB |

### Snapshot Configuration

| Variable | Required | Description | Example | Valid Values |
|----------|----------|-------------|---------|--------------|
| `SNAPSHOT_ENABLED` | No | Enable snapshot download | `true` | `true`, `false` |
| `SNAPSHOT_DOWNLOAD_URL` | No | URL to download snapshot | `https://snapshots.example.com/latest.tar.gz` | Valid HTTPS URL |
| `SNAPSHOT_STAGING_VOL_SIZE` | No | Temporary EBS gp3 staging volume size in GiB for snapshot download | `5000` | Integer, `0` = disabled |

**Notes**:
- Snapshots significantly reduce initial sync time
- If `SNAPSHOT_ENABLED=true`, `SNAPSHOT_DOWNLOAD_URL` should be provided
- **`SNAPSHOT_DOWNLOAD_URL` must use HTTPS.** The archive is downloaded and extracted as root at boot, so a plaintext HTTP source is rejected at synth. HTTPS provides transport integrity and authenticates the snapshot server.
- Integrity verification depends on the provider: the BNB blueprint verifies the archive against the md5 published in 48Club's `data.json` (fails closed on mismatch); Base relies on HTTPS plus a completeness check (Base publishes no checksum); Solana snapshots are verified by the validator against its known validators and expected genesis hash. A checksum proves integrity (the bytes are intact), not that the snapshot represents the canonical chain — always use an official/trusted provider.
- Default snapshot URL is defined in protocol's `package.json`
- Snapshot must be compatible with the selected network
- `SNAPSHOT_STAGING_VOL_SIZE` creates a temporary gp3 EBS volume to hold the compressed archive during download, preventing disk overflow when `compressed_size + extracted_size > available /data space`. Set to `0` or omit to use existing behavior (download directly to `/data`). Set to ~1.1x the compressed archive size when needed.
- See [Snapshot Staging Guide](/docs/guides/snapshot-staging) for volume sizing guidance and cost analysis

**Example values per protocol**:
```bash
# Base mainnet op-reth (~4.86 TB compressed archive)
SNAPSHOT_STAGING_VOL_SIZE="5000"

# Base mainnet op-geth (~1.5 TB compressed archive)
SNAPSHOT_STAGING_VOL_SIZE="2000"

# BNB mainnet bsc-reth (~9.7 TB compressed archive)
SNAPSHOT_STAGING_VOL_SIZE="10000"

# BNB mainnet bsc-geth (~365 GB compressed archive)
SNAPSHOT_STAGING_VOL_SIZE="500"

# Disabled (default) — download directly to /data
SNAPSHOT_STAGING_VOL_SIZE="0"
```

### Traffic Shaping Configuration

Traffic shaping dynamically manages outbound bandwidth to optimize data transfer costs for RPC nodes. When enabled, the system automatically applies bandwidth limits when the node is fully synchronized and removes limits when the node falls behind.

| Variable | Required | Description | Example | Valid Values |
|----------|----------|-------------|---------|--------------|
| `TRAFFIC_SHAPING_ENABLED` | No | Enable dynamic traffic shaping | `true` | `true`, `false` |
| `TRAFFIC_SHAPING_RATE_MBIT` | Conditional | Outbound bandwidth limit in Mbit/s | `40` | `20` to `500` |
| `TRAFFIC_SHAPING_CHECK_INTERVAL_SEC` | Conditional | Sync status check interval in seconds | `60` | `30` to `300` |
| `TRAFFIC_SHAPING_MAX_BLOCKS_BEHIND` | Conditional | Max blocks/slots behind before removing limit | `10` | `5` to `100` |

**Notes**:
- **RPC nodes only**: Traffic shaping is designed for RPC nodes. Do NOT use on validator/consensus nodes.
- **Cost savings**: Can reduce data transfer costs by up to 85% for high-traffic protocols
- **Recommended rate**: 40-100 Mbit/s provides optimal price-to-performance ratio
- **Minimum rate**: 20 Mbit/s is the minimum viable rate for most protocols
- **Protocol support**: Only available for protocols with block times <10 seconds (e.g., Solana, BSC, Polygon)
- **Conditional requirements**: If `TRAFFIC_SHAPING_ENABLED=true`, all other traffic shaping variables should be provided
- **Default values**: If not specified, uses protocol defaults from `package.json`
- See [Traffic Shaping Guide](/docs/guides/traffic-shaping) for detailed information and cost analysis

**Example Configuration**:
```bash
TRAFFIC_SHAPING_ENABLED="true"
TRAFFIC_SHAPING_RATE_MBIT="40"              # 40 Mbit/s limit (~0.4 TiB/month)
TRAFFIC_SHAPING_CHECK_INTERVAL_SEC="60"     # Check every minute
TRAFFIC_SHAPING_MAX_BLOCKS_BEHIND="10"       # Remove limit if >10 blocks behind
```

### Storage Configuration

Storage volumes are configured using numbered variables. The system supports up to 6 data volumes per instance.

#### Volume Count

| Variable | Required | Description | Example | Valid Values |
|----------|----------|-------------|---------|--------------|
| `DATA_VOLUMES_COUNT` | Yes | Number of data volumes | `2` | `1` to `6` |

#### Volume Configuration

For each volume (1 through `DATA_VOLUMES_COUNT`), configure the following variables:

| Variable Pattern | Required | Description | Example | Valid Values |
|-----------------|----------|-------------|---------|--------------|
| `DATA_VOL_{N}_TYPE` | Yes | EBS volume type | `gp3` | `gp3`, `io1`, `io2`, `instance-store` |
| `DATA_VOL_{N}_SIZE` | Yes | Volume size in GiB | `2000` | `1` to `65536` (varies by type) |
| `DATA_VOL_{N}_IOPS` | Conditional | Provisioned IOPS | `16000` | Type-specific limits |
| `DATA_VOL_{N}_THROUGHPUT` | Conditional | Throughput in MB/s | `1000` | `125` to `2000` (gp3 only) |
| `DATA_VOL_{N}_MOUNT_PATH` | Yes | Mount point path | `/data` | Valid Linux path |
| `DATA_VOL_{N}_DEVICE_NAME` | No | Device name | `/dev/xvdg` | `/dev/xvd[f-p]` |
| `DATA_VOL_{N}_FILESYSTEM` | No | Filesystem type | `ext4` | `ext4`, `xfs` |

**Volume Type Specifications**:

| Type | Size Limit | IOPS Range | Throughput | Use Case |
|------|------------|------------|------------|----------|
| `gp3` | 64 TiB | 3,000 - 80,000 | 125 - 2,000 MB/s | General purpose, cost-effective |
| `io1` | 16 TiB | 100 - 64,000 | Up to 1,000 MB/s | High performance, consistent IOPS |
| `io2` | 64 TiB | 100 - 256,000 | Up to 4,000 MB/s | Highest performance, 99.999% durability |
| `instance-store` | Varies | N/A | Varies | Temporary, high IOPS, ephemeral |

**Instance Store Volume Selection**:

When using `instance-store` type, volumes are automatically selected from available NVMe devices:
- Selection is based on sorted device names (nvme0n1, nvme1n1, etc.)
- Only unmounted devices larger than 100GB are considered (to avoid using root EBS disk)
- The `DATA_VOL_{N}_SIZE` parameter is ignored for instance-store volumes
- Multiple instance store volumes are assigned in order based on `DATA_VOLUMES_COUNT`
- Requires instance types with instance store support (i3, i4i, i4g, x2idn, etc.)

**Example: Single Volume Configuration**:
```bash
DATA_VOLUMES_COUNT="1"
DATA_VOL_1_TYPE="gp3"
DATA_VOL_1_SIZE="2000"
DATA_VOL_1_IOPS="16000"
DATA_VOL_1_THROUGHPUT="1000"
DATA_VOL_1_MOUNT_PATH="/data"
DATA_VOL_1_DEVICE_NAME="/dev/xvdg"
DATA_VOL_1_FILESYSTEM="ext4"
```

**Note**: With the latest gp3 improvements, volumes can now scale up to 64 TiB, 80,000 IOPS, and 2,000 MB/s throughput.

**Example: Multiple Volume Configuration** (e.g., Solana):
```bash
DATA_VOLUMES_COUNT="2"

# Volume 1: Ledger data
DATA_VOL_1_TYPE="io2"
DATA_VOL_1_SIZE="2000"
DATA_VOL_1_IOPS="17000"
DATA_VOL_1_THROUGHPUT="700"
DATA_VOL_1_MOUNT_PATH="/data"
DATA_VOL_1_DEVICE_NAME="/dev/xvdg"

# Volume 2: Accounts data
DATA_VOL_2_TYPE="io2"
DATA_VOL_2_SIZE="500"
DATA_VOL_2_IOPS="7000"
DATA_VOL_2_THROUGHPUT="700"
DATA_VOL_2_MOUNT_PATH="/accounts"
DATA_VOL_2_DEVICE_NAME="/dev/xvdh"
```

**Notes**:
- All volumes are encrypted at rest by default
- Device names are auto-generated if not specified
- IOPS is required for `io1` and `io2` types
- THROUGHPUT is only applicable to `gp3` type
- IOPS and THROUGHPUT are ignored for `instance-store` type
- Default filesystem is `ext4` if not specified
- Mount paths must be unique across volumes

### High Availability Configuration

These variables are only used when `DEPLOYMENT_MODE="ha-nodes"`.

#### Node Configuration

| Variable | Required | Description | Example | Valid Values |
|----------|----------|-------------|---------|--------------|
| `HA_NUMBER_OF_NODES` | Yes | Desired number of nodes | `3` | `2` to `10` |

#### Load Balancer Health Checks

| Variable | Required | Description | Example | Valid Values |
|----------|----------|-------------|---------|--------------|
| `HA_ALB_HEALTHCHECK_PORT` | Yes | Health check port | `8545` | Valid port number |
| `HA_ALB_HEALTHCHECK_PATH` | Yes | Health check path | `/health` | Valid URL path |
| `HA_ALB_HEALTHCHECK_HTTP_CODES` | No | HTTP status code(s) the ALB treats as healthy (defaults to `200`) | `200` | Single code (`200`), list (`200,202`), or range (`200-299`) |
| `HA_ALB_HEALTHCHECK_GRACE_PERIOD_MIN` | Yes | Grace period in minutes | `60` | `1` to `300` |
| `HA_ALB_HEALTHCHECK_INTERVAL_SEC` | Yes | Check interval in seconds | `30` | `5` to `300` |
| `HA_ALB_HEALTHCHECK_TIMEOUT_SEC` | Yes | Check timeout in seconds | `5` | `2` to `120` |
| `HA_ALB_HEALTHCHECK_HEALTHY_THRESHOLD` | Yes | Healthy threshold count | `3` | `2` to `10` |
| `HA_ALB_HEALTHCHECK_UNHEALTHY_THRESHOLD` | Yes | Unhealthy threshold count | `2` | `2` to `10` |

#### Lifecycle and Deregistration

| Variable | Required | Description | Example | Valid Values |
|----------|----------|-------------|---------|--------------|
| `HA_NODES_HEARTBEAT_DELAY_MIN` | Yes | Lifecycle hook heartbeat delay | `10` | `1` to `120` |
| `HA_ALB_DEREGISTRATION_DELAY_SEC` | Yes | Target deregistration delay | `30` | `0` to `3600` |

#### ALB Exposure (security)

By default the load balancer is **internal** (reachable only from within the VPC) and ingress is restricted to the VPC CIDR. These variables control whether and how the RPC endpoint is exposed beyond the VPC.

| Variable | Required | Description | Example | Valid Values |
|----------|----------|-------------|---------|--------------|
| `HA_ALB_INTERNET_FACING` | No | Expose the ALB to the internet. Defaults to `false` (internal, VPC-only). | `false` | `true` or `false` |
| `HA_ALB_ALLOWED_CIDR` | No | CIDR allowed to reach the ALB listener. Empty defaults to the VPC CIDR. **Required (set to a trusted range) when `HA_ALB_INTERNET_FACING=true`** — do not use `0.0.0.0/0`. | `203.0.113.0/24` | Any IPv4 CIDR |
| `HA_ALB_CERTIFICATE_ARN` | No | ACM certificate ARN. When set, the ALB listener uses HTTPS (TLS terminated at the ALB); otherwise HTTP. | ACM certificate ARN | ACM certificate ARN or `none` |

**Example HA Configuration**:
```bash
DEPLOYMENT_MODE="ha-nodes"
HA_NUMBER_OF_NODES="3"
HA_ALB_HEALTHCHECK_PORT="8545"
HA_ALB_HEALTHCHECK_PATH="/health"
HA_ALB_HEALTHCHECK_GRACE_PERIOD_MIN="60"
HA_ALB_HEALTHCHECK_INTERVAL_SEC="30"
HA_ALB_HEALTHCHECK_TIMEOUT_SEC="5"
HA_ALB_HEALTHCHECK_HEALTHY_THRESHOLD="3"
HA_ALB_HEALTHCHECK_UNHEALTHY_THRESHOLD="2"
HA_NODES_HEARTBEAT_DELAY_MIN="10"
HA_ALB_DEREGISTRATION_DELAY_SEC="30"

# ALB exposure (defaults shown — internal, VPC-only, HTTP)
# HA_ALB_INTERNET_FACING="false"
# HA_ALB_ALLOWED_CIDR=""              # empty => VPC CIDR
# HA_ALB_CERTIFICATE_ARN="none"
```

**Notes**:
- Health check port should match the protocol's RPC port
- The ALB is internal by default; the RPC endpoint is not reachable from the internet unless you set `HA_ALB_INTERNET_FACING="true"`
- When exposing to the internet, always restrict `HA_ALB_ALLOWED_CIDR` to trusted source ranges and set `HA_ALB_CERTIFICATE_ARN` to serve traffic over HTTPS
- Grace period should be long enough for node initialization
- Interval × (healthy_threshold - 1) = time to mark healthy
- Heartbeat delay should allow for graceful node startup
- Deregistration delay allows in-flight requests to complete

### Protocol-Specific Variables

Each protocol can define custom environment variables using a prefix. These variables are defined in the protocol's `package.json` under `"aws-blockchain-node-runner".customEnvVars`.

**Format**: `{PREFIX}_{VARIABLE_NAME}`

**Example for Ethereum**:
```bash
# Prefix: ETH
ETH_CONSENSUS_CHECKPOINT_SYNC_URL="https://beaconstate.info"
```

**Example for Solana**:
```bash
# Prefix: SOLANA
SOLANA_NODE_IDENTITY_SECRET_ARN="arn:aws:secretsmanager:us-east-1:123456789012:secret:solana-identity"
```

**Notes**:
- Prefix is defined in protocol's `package.json` as `customEnvVarsNamePrefix`
- Variables are automatically extracted and made available to user data scripts
- Default values can be specified in `package.json`
- See protocol-specific documentation for available variables

## Protocol Configuration (Blueprint package.json)

Each blueprint is an NPM package. Protocol-specific configuration lives in the `"aws-blockchain-node-runner"` field of the blueprint's `package.json`. Standard NPM fields (`name`, `version`, `description`) are read from the top-level `package.json` fields and are not duplicated inside the `"aws-blockchain-node-runner"` field.

Blueprint packages follow the naming convention `aws-bnr-blueprint-<protocol>` (e.g., `aws-bnr-blueprint-ethereum`).

### Top-Level package.json Fields (Standard NPM)

| Field | Type | Description | Example |
|-------|------|-------------|---------|
| `name` | string | NPM package name | `"aws-bnr-blueprint-ethereum"` |
| `version` | string | Package version | `"2.0.0"` |
| `description` | string | Protocol description | `"Ethereum blockchain node runner..."` |
| `peerDependencies` | object | Core version compatibility | `{"aws-blockchain-node-runners": ">=2.0.0"}` |

### Required Fields (inside `"aws-blockchain-node-runner"`)

| Field | Type | Description | Example |
|-------|------|-------------|---------|
| `BLOCKCHAIN_PROTOCOL` | string | Unique protocol identifier (lowercase) | `"ethereum"` |
| `supportedDeploymentModes` | array | Supported deployment modes | `["single-node", "ha-nodes"]` |
| `defaultConfiguration` | string | Default client configuration file | `"geth-1.16.8-lighthouse-8.1.0-full.yml"` |
| `availableConfigurations` | array | Available client configurations | See below |
| `BC_NETWORKS` | array | Supported networks | `["mainnet", "sepolia"]` |
| `defaultInstanceTypes` | object | Recommended instance types | See below |
| `requiredPorts` | array | Ports to open in security group | See below |
| `monitoring` | object | Monitoring configuration | See below |
| `storage` | object | Storage configuration | See below |
| `customEnvVarsNamePrefix` | string | Prefix for custom variables | `"ETH"` |

### Optional Fields (inside `"aws-blockchain-node-runner"`)

| Field | Type | Description | Example |
|-------|------|-------------|---------|
| `snapshot` | object | Snapshot configuration | See below |
| `customEnvVars` | array | Custom environment variables with defaults | See below |
| `trafficShaping` | object | Traffic shaping support metadata | `{"supported": true, "recommendedForRPC": true}` |

### Field Details

#### defaultInstanceTypes

```json
{
  "x86_64": "m6a.2xlarge",
  "ARM_64": "m6g.2xlarge"
}
```

#### requiredPorts

```json
[
  {
    "port": 8545,
    "protocol": "tcp",
    "description": "JSON RPC",
    "public": true
  },
  {
    "portRange": {
      "from": 8001,
      "to": 8020
    },
    "protocol": "tcp",
    "description": "Gossip range"
  }
]
```

**Notes**:
- Use `port` for single port or `portRange` for range
- `public` field is optional (defaults to true)
- Protocol must be `"tcp"` or `"udp"`

#### monitoring

```json
{
  "healthCheckPath": "/health",
  "metricsPort": 8545
}
```

#### storage

```json
{
  "defaultDataVolumes": [
    {
      "sizeGiB": 2000,
      "type": "gp3",
      "iops": 16000,
      "throughput": 1000,
      "mountPath": "/data"
    }
  ]
}
```

#### availableConfigurations

```json
[
  {
    "name": "geth-lighthouse",
    "version": "v1.14.12-v6.0.1"
  },
  {
    "name": "reth-lighthouse",
    "version": "v1.6.0-v6.0.1"
  }
]
```

#### snapshot

```json
{
  "enabled": true,
  "downloadUrl": "https://snapshots.ethereum.org/mainnet/latest.tar.lz4"
}
```

#### customEnvVars

```json
[
  "ETH_CONSENSUS_CHECKPOINT_SYNC_URL=https://beaconstate.info",
  "ETH_CUSTOM_PARAM=default_value"
]
```

**Format**: `{PREFIX}_{VARIABLE_NAME}={DEFAULT_VALUE}`

## CDK-Managed Variables

These variables are automatically injected by the CDK application and are not user-configurable. They are available in the user data script via `/etc/cdk_environment`.

| Variable | Description | Example | Set By |
|----------|-------------|---------|--------|
| `STACK_NAME` | CloudFormation stack name (format: `${protocol}-${network}-${clientConfig}`, version numbers removed) | `ethereum-mainnet-geth-lighthouse-full` | CDK |
| `LOGICAL_RESOURCE_ID` | CloudFormation resource ID (single-node) | `BlockchainInstance` | CDK |
| `ASG_NAME` | Auto Scaling Group name (HA) | `MyChainASG` | CDK |
| `LIFECYCLE_HOOK_NAME` | Lifecycle hook name (HA) | `NodeStartupHook` | CDK |
| `COMMON_ASSETS_S3_PATH` | S3 path to common assets | `s3://bucket/common.zip` | AssetsManager |
| `PROTOCOL_ASSETS_S3_PATH` | S3 path to protocol assets | `s3://bucket/protocol.zip` | AssetsManager |

**Notes**:
- Stack name is automatically generated from `BLOCKCHAIN_PROTOCOL`, `BC_NETWORK`, and `CLIENT_CONFIG`
- When `STACK_NAME_PREFIX` is set, the prefix is prepended with a hyphen (e.g., `DEV-ethereum-mainnet-geth-lighthouse-full`)
- Version numbers, dots, underscores, and special characters are removed to reduce stack name variability
- This allows version updates without changing the stack name (e.g., updating from geth-1.14.0 to geth-1.15.0 keeps the same stack)
- Single-node deployments: `LOGICAL_RESOURCE_ID` is set, `ASG_NAME` and `LIFECYCLE_HOOK_NAME` are `"none"`
- HA deployments: `ASG_NAME` and `LIFECYCLE_HOOK_NAME` are set, `LOGICAL_RESOURCE_ID` is `"none"`
- Assets paths are used to download scripts and configurations to instances

## Configuration Examples

For complete, working configuration examples, refer to the sample configurations in the protocol blueprints:

### Dummy Protocol (Testing/Development)
- **Single-Node**: `blueprints/dummy/samples/.env-mainnet-single-node`
- **HA Deployment**: `blueprints/dummy/samples/.env-testnet-ha-nodes`

These sample configurations demonstrate:
- All required environment variables
- Proper storage configuration
- Protocol-specific variables
- HA configuration (when applicable)
- Recommended instance types and storage settings

To use a sample configuration:
```bash
# Copy the sample that matches your deployment
cp node_modules/aws-bnr-blueprint-dummy/samples/.env-testnet-single-node .env

# Edit with your AWS account details
nano .env
```

## Best Practices

### Security

- **Use Secrets Manager**: Store sensitive data in AWS Secrets Manager
- **Rotate credentials**: Regularly rotate AWS credentials
- **Least privilege**: Use minimal IAM permissions

### Performance

- **Right-size instances**: Start with recommended instance types
- **Optimize storage**: Use lower latency disk options for high-peroformant protocols
- **Enable snapshots**: Reduce initial sync time significantly
- **Monitor metrics**: Use CloudWatch to identify bottlenecks

### Cost Optimization

- **Use gp3 volumes**: More cost-effective than io2 for most workloads
- **Consider compute savings plans and Instance Store over EBS io2**: If you need to use io2 because of consistent latency, consider using intance store enabled instances to apply discount to both compute and storage
- **Right-size IOPS**: Don't over-provision IOPS
- **Use ARM instances**: Often cheaper than x86_64 for same performance
- **Clean up resources**: Destroy stacks when not needed

### Reliability

- **Use HA mode**: For production workloads
- **Configure health checks**: Appropriate grace periods and thresholds
- **Enable monitoring**: Set up CloudWatch alarms
- **Test deployments**: Validate on testnet before mainnet

## See Also

- [Adding New Protocols](/docs/ai-prompts/add-protocol-with-ai) - Guide for adding protocols
- [Deployment Guide](/docs/guides/deployment-guide) - Deployment scenarios and best practices
- [Troubleshooting](/docs/guides/troubleshooting) - Common issues and solutions
- [Design Document](https://github.com/aws-samples/aws-blockchain-node-runners/blob/main/.kiro/specs/universal-blockchain-node-runner/design.md) - System architecture and design decisions
