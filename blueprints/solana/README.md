# Solana Protocol Node Runner

This protocol implementation provides support for running Solana RPC nodes on AWS using the Universal Blockchain Node Runner. It supports two validator clients: **Agave** (the canonical Solana validator by Anza) and **Frankendancer** (a high-performance hybrid client by Jump Trading). Both are installed natively for maximum performance.

## Overview of Deployment Architectures

The Solana protocol supports two deployment modes, each compatible with both Agave and Frankendancer clients:

### Single Node Deployment

A single EC2 instance running the selected validator client in RPC mode, suitable for development, testing, and production RPC access.

```
┌─────────────────────────────────────────────────────────────┐
│                         VPC (Default)                        │
│  ┌─────────────────────────────────────────────────────────┐│
│  │                    Public Subnet                         ││
│  │  ┌─────────────────────────────────────────────────────┐││
│  │  │         EC2 Instance (Solana Node)                  │││
│  │  │  ┌──────────────────────────────────────────────┐   │││
│  │  │  │    Agave or Frankendancer (RPC Mode)         │   │││
│  │  │  │  Port 8899 (JSON RPC) - internal only        │   │││
│  │  │  │  Port 8900 (WebSocket) - internal only       │   │││
│  │  │  │  Ports 8001-8029 (Gossip + P2P) - public     │   │││
│  │  │  │  Port 8003/UDP (Shred/Turbine) - public      │   │││
│  │  │  │  Dynamic port range: 8004-8029 (both clients)│   │││
│  │  │  └──────────────────────────────────────────────┘   │││
│  │  │  ┌──────────────────────────────────────────────┐   │││
│  │  │  │  NVMe /data (2 TB+) - Ledger               │   │││
│  │  │  │  NVMe /accounts (500 GB+) - Accounts DB    │   │││
│  │  │  └──────────────────────────────────────────────┘   │││
│  │  └─────────────────────────────────────────────────────┘││
│  └─────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────┘
```

### High Availability (HA) Deployment

Multiple EC2 instances behind an Application Load Balancer with auto-scaling for production RPC workloads.

```
┌─────────────────────────────────────────────────────────────┐
│                         VPC (Default)                        │
│  ┌─────────────────────────────────────────────────────────┐│
│  │           Application Load Balancer (Port 8899)          ││
│  └─────────────────────────────────────────────────────────┘│
│                              │                               │
│  ┌───────────────────────────┼───────────────────────────┐  │
│  │                Auto Scaling Group                      │  │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐    │  │
│  │  │   Node 1    │  │   Node 2    │  │   Node N    │    │  │
│  │  │ Agave or FD │  │ Agave or FD │  │ Agave or FD │    │  │
│  │  │  (RPC Mode) │  │  (RPC Mode) │  │  (RPC Mode) │    │  │
│  │  └─────────────┘  └─────────────┘  └─────────────┘    │  │
│  └───────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

## Supported Configurations

The Solana protocol provides sample configurations for two validator clients across base and extended RPC modes:

### Available Configurations

| Configuration | Client | Description | Best For |
|--------------|--------|-------------|----------|
| agave-&lt;version&gt;-rpc-base.sh | Agave | Standard RPC with full transaction history | General RPC access |
| agave-&lt;version&gt;-rpc-extended.sh | Agave | Extended RPC with account indexing | dApps needing token/program lookups |
| frankendancer-&lt;version&gt;-rpc-base.sh | Frankendancer | Standard RPC with high-performance networking | General RPC access with lower latency |
| frankendancer-&lt;version&gt;-rpc-extended.sh | Frankendancer | Extended RPC with account indexing | dApps needing token/program lookups with lower latency |

> **Note:** Configuration file names include the pinned client version (shown as `<version>` above). For the exact current filename, run `ls node_modules/aws-bnr-blueprint-solana/configurations/`, or simply copy the matching sample from `samples/` — it already sets `CLIENT_CONFIG` for you.

### Configuration Differences

**Base RPC** (agave `rpc-base` / frankendancer `rpc-base`):
- Full RPC API access
- Transaction history enabled
- Lower memory footprint

**Extended RPC** (agave `rpc-extended` / frankendancer `rpc-extended`):
- All base RPC features
- Account indexes: `spl-token-owner`, `program-id`, `spl-token-mint`
- Required for `getTokenAccountsByOwner`, `getProgramAccounts` queries
- Higher memory and storage requirements

## Agave vs Frankendancer

Both clients expose the same Solana JSON RPC API on port 8899 and are fully interchangeable for RPC workloads. The key differences are in how they are configured, built, and run.

| Aspect | Agave | Frankendancer |
|--------|-------|---------------|
| Maintained by | Anza (formerly Solana Labs) | Jump Trading (Firedancer team) |
| Configuration format | CLI flags | TOML file (`frankendancer.toml`) |
| Binary | `agave-validator` | `fdctl` (manages Firedancer tiles + Agave subprocess) |
| Networking stack | Standard Solana networking | AF_XDP kernel bypass (high-performance) |
| Dynamic port range | `8004-8029` (CLI flag) | `8004-8029` (TOML, passed to embedded Agave) |
| Privilege model | Runs entirely as `bcuser` | Starts as root (AF_XDP requires `CAP_SYS_ADMIN`), drops to `bcuser` via TOML `user` field |
| System initialization | None required | `fdctl configure init all` sets up hugetlbfs, sysctl, ethtool before each run |
| Build from source | `cargo-install-all.sh` (~30-60 min) | `deps.sh` + `make -j fdctl solana` (~20-40 min) |
| Maturity | Production-proven, canonical client | Newer, rapidly maturing, used by high-performance validators |

### When to Choose Frankendancer

Frankendancer is a good fit when you want:
- Lower networking latency via AF_XDP kernel bypass
- Potentially faster block data ingestion (Turbine shred processing)
- To run the same client used by many high-performance validators

Agave remains the safe default for most RPC use cases. Both clients produce identical RPC responses and sync from the same network.

### Port Security: Unified Dynamic Port Range

Both Agave and Frankendancer use the same dynamic port range: **8004-8029**. This is an intentional architectural decision — since both clients share a single `requiredPorts` definition in `package.json`, aligning the dynamic port range avoids opening unnecessary ports when either client is deployed.

Frankendancer's upstream default is `8900-9000`, but we override it to `8004-8029` to fit within the gossip security group rules (8001-8029). The range starts at 8004 to avoid Frankendancer's static ports: gossip (8001) and shred (8003). The Firedancer documentation explicitly states that the dynamic port range must not overlap with static Firedancer ports. The width of 25 (`8029 - 8004`) meets the Agave minimum (`MINIMUM_VALIDATOR_PORT_RANGE_WIDTH = 25` in `solana-net-utils`).

### Port Security: Why Ports 9001 and 9007 Are Not Exposed

Frankendancer introduces three ports beyond the standard Agave gossip range (8001-8027):

| Port | Protocol | Purpose | Exposed? | Rationale |
|------|----------|---------|----------|-----------|
| 8003 | UDP | Shred reception (Turbine block data) | Yes (public) | Required for real-time block data. Without it, the node falls back to the repair protocol and lags behind the cluster tip. |
| 9001 | UDP | Regular (non-QUIC) transaction ingestion | No | RPC-only nodes (`no_voting=true`) do not produce blocks. Clients submit transactions via the JSON RPC API on port 8899, and the Agave subprocess forwards them to the current leader. |
| 9007 | UDP | QUIC transaction ingestion | No | Same rationale as 9001 — QUIC transaction ingestion is a leader/validator function, not needed for RPC-only nodes. |

Only port 8003 is added to the security group. This minimizes the public attack surface while maintaining full RPC functionality and real-time sync performance.

## Infrastructure Requirements

### Hardware Requirements

Both Agave and Frankendancer share the same minimum hardware requirements:
- **CPU**: 24+ cores (48+ vCPUs recommended for mainnet-beta)
- **RAM**: 256 GB minimum (384 GB recommended for mainnet-beta)
- **Storage**: 2 TB NVMe SSD minimum (separate volumes for ledger and accounts)
- **Network**: 1 Gbps minimum

### Recommended Instance Types

**Mainnet-Beta (Production RPC)**

| Configuration | Instance Type | vCPUs | Memory | Instance Store |
|--------------|---------------|-------|--------|----------------|
| Base RPC (best performance) | i7ie.12xlarge | 48 | 384 GB | 4x 7,500 GB NVMe |
| Extended RPC (best performance) | i7ie.18xlarge | 72 | 576 GB | 6x 7,500 GB NVMe |
| Base RPC (cost-effective) | i7i.12xlarge | 48 | 384 GB | 3x 3,750 GB NVMe |
| Base RPC (ARM, budget) | i8g.8xlarge | 32 | 256 GB | 2x 3,750 GB NVMe |

**Testnet/Devnet (Development & Testing)**

| Network | Instance Type | vCPUs | Memory | Instance Store |
|---------|---------------|-------|--------|----------------|
| Testnet (x86) | i7i.4xlarge | 16 | 128 GB | 1x 3,750 GB NVMe |
| Testnet (ARM) | i8g.4xlarge | 16 | 128 GB | 1x 3,750 GB NVMe |
| Devnet (x86) | i7i.2xlarge | 8 | 64 GB | 1x 1,875 GB NVMe |
| Devnet (ARM) | i8g.2xlarge | 8 | 64 GB | 1x 1,875 GB NVMe |

*For cost estimates, use the [AWS Pricing Calculator](https://calculator.aws/) with your specific region and commitment level.

**Instance Family Recommendations:**
- **i7ie (x86)**: Best performance for mainnet-beta production RPC nodes, highest storage capacity (7.5 TB per NVMe)
- **i7i (x86)**: Cost-effective option for mainnet-beta, good performance with lower storage capacity (3.75 TB per NVMe)
- **i8g (ARM Graviton 4)**: Budget option for mainnet-beta base RPC, suitable for testnet/devnet. Note: Slower performance than x86 for Solana workloads.

**Storage Capacity:**
- i7ie instances: 4-6x NVMe drives (7.5 TB each) - optimal for mainnet-beta with extended retention
- i7i instances: 3-4x NVMe drives (3.75 TB each) - sufficient for mainnet-beta with standard retention
- i8g.8xlarge: 2x NVMe drives (3.75 TB each) - sufficient for mainnet-beta base RPC with separate /data and /accounts
- All recommended instances provide separate NVMe drives for /data (ledger) and /accounts volumes
- Instance store provides optimal I/O performance for Solana's demanding workload

**Network Costs:**
Traffic shaping reduces outbound data transfer by over 85%, significantly lowering network costs for mainnet-beta RPC nodes. See [Traffic Shaping Documentation](/docs/guides/traffic-shaping) for details.

### Storage Requirements

| Network | Volume | Current Size | Growth Rate | Recommended | Type |
|---------|--------|-------------|-------------|-------------|------|
| Mainnet-Beta | Ledger (/data) | ~1.5 TB | ~50 GB/month | 2-3 TB | instance-store (NVMe) |
| Mainnet-Beta | Accounts (/accounts) | ~400 GB | ~10 GB/month | 500-750 GB | instance-store (NVMe) |
| Testnet | Ledger (/data) | ~500 GB | ~20 GB/month | 1 TB | instance-store (NVMe) |
| Testnet | Accounts (/accounts) | ~150 GB | ~5 GB/month | 250 GB | instance-store (NVMe) |
| Devnet | Ledger (/data) | ~200 GB | ~10 GB/month | 500 GB | instance-store (NVMe) |
| Devnet | Accounts (/accounts) | ~50 GB | ~2 GB/month | 100 GB | instance-store (NVMe) |

**Storage Notes:**
- **Instance Store (NVMe)**: Provides optimal I/O performance for Solana (17,000+ IOPS)
- **i7ie instances**: 4-6x 7,500 GB NVMe drives (30-45 TB total) - best for mainnet-beta production
- **i7i instances**: 3-4x 3,750 GB NVMe drives (11-15 TB total) - cost-effective for mainnet-beta
- **i8g.8xlarge**: 2x 3,750 GB NVMe drives (7.5 TB total) - sufficient for mainnet-beta base RPC
- **i8g.4xlarge/2xlarge**: 1x NVMe drive - suitable for testnet/devnet (single volume for both /data and /accounts)
- All recommended instances have sufficient capacity for blockchain data
- Instance store data is ephemeral (lost on stop/terminate) - suitable for RPC nodes that can re-sync

### Network Traffic

Solana mainnet-beta generates significant outbound traffic due to its high-throughput architecture:
- **Without traffic shaping**: ~100-200 TiB/month
- **With traffic shaping (20-40 Mbit/s)**: ~0.2-0.4 TiB/month

**Traffic shaping reduces outbound data transfer by over 85%, significantly lowering network costs for mainnet-beta RPC nodes.**

See [Traffic Shaping Documentation](/docs/guides/traffic-shaping) for configuration details.

> Running multiple protocols? Each deployment creates an independent CloudFormation stack. Total costs are additive — use the tables above per protocol.

## Setup Instructions

There are two ways to deploy a Solana node.

### Option 1: AI-Driven Deployment (Recommended)

Deploy with a single prompt. In Kiro (or your AI assistant of choice), run:

```
@deploy a Solana mainnet RPC node in us-east-1
```

The AI assistant will guide you through infrastructure selection, configuration, deployment, and initial healthcheck. For full setup, see [Getting Started](/docs/getting-started/quickstart).

### Option 2: Manual Deployment

This section focuses on Solana-specific configuration and client selection.

**Quick Start (Agave):**

1. Copy sample configuration: `cp node_modules/aws-bnr-blueprint-solana/samples/.env-mainnet-beta-agave-rpc-base .env`
2. Edit `.env` with your AWS account details
3. Enable traffic shaping (recommended): `TRAFFIC_SHAPING_ENABLED="true"`
4. Deploy: `npx cdk deploy --json --outputs-file deploy-output-{stack-name}.json`

**Quick Start (Frankendancer):**

1. Copy sample configuration: `cp node_modules/aws-bnr-blueprint-solana/samples/.env-mainnet-beta-frankendancer-rpc-base .env`
2. Edit `.env` with your AWS account details
3. Enable traffic shaping (recommended): `TRAFFIC_SHAPING_ENABLED="true"`
4. Deploy: `npx cdk deploy --json --outputs-file deploy-output-{stack-name}.json`

For advanced options (HA mode, multiple stacks, maintenance), see the [Deployment Guide](/docs/guides/deployment-guide).

## Configuration Options

### Node Identity

By default, a new identity keypair is generated on first start. To use an existing identity, store your keypair in AWS Secrets Manager and set `SOLANA_NODE_IDENTITY_SECRET_ARN` in your .env file.

> **⚠️ HA mode and shared identities:** In HA mode each instance generates its
> own unique identity by default, which is correct for RPC nodes. If you set
> `SOLANA_NODE_IDENTITY_SECRET_ARN`, **every** node in the Auto Scaling Group
> loads the *same* identity. That is safe for these RPC (non-voting) nodes, but
> it would be dangerous if this pattern were copied to a **voting validator**:
> two validators running the same identity key sign conflicting votes and get
> **slashed**. These blueprints are RPC-only and must not be adapted into a
> voting validator that shares one identity across multiple running instances.

See [Configuration Reference](/docs/guides/configuration-reference) for all available options.

### Traffic Shaping

Traffic shaping reduces outbound data transfer by over 85%:

| Rate | Monthly Transfer | Transfer Reduction |
|------|-----------------|-------------------|
| No limit | ~150 TiB | - |
| 100 Mbit/s | ~1 TiB | 99% |
| 40 Mbit/s | ~0.4 TiB | 99.7% |
| 20 Mbit/s | ~0.2 TiB | 99.9% |

**Important**: Traffic shaping is for RPC nodes only. Do not use on consensus/validator nodes.

See [Traffic Shaping Documentation](/docs/guides/traffic-shaping) for configuration details.

## Troubleshooting

### Common Issues (Both Clients)

- **Node not starting**: Check CloudWatch logs (`/aws/ec2/blockchain-nodes/systemd-services`) and service status
- **Slow sync**: Verify disk I/O performance, gossip ports open, sufficient disk space
- **High memory usage**: Ensure instance has 256-384 GB RAM for mainnet-beta, consider base RPC vs extended
- **RPC not responding**: Verify node synced, security group allows VPC traffic on port 8899
- **Traffic shaping issues**: Check syncchecker timer and logs

### Frankendancer-Specific Issues

- **`fdctl configure init all` fails**: This step sets up hugetlbfs mounts, sysctl parameters, and ethtool settings. It requires root privileges. Check that the systemd service is running as root (no `User=` directive). Common causes:
  - Insufficient huge pages: The kernel may not have enough free memory for 2 MiB and 1 GiB huge pages. Verify with `cat /proc/meminfo | grep Huge`.
  - ethtool failures: Some instance types may not support all ethtool channel/offload settings. Check `journalctl -u node.service` for specific ethtool errors.

- **hugetlbfs mount issues**: Frankendancer requires hugetlbfs for both 2 MiB and 1 GiB huge pages. If `fdctl configure init all` reports hugetlbfs errors:
  - Verify mounts: `mount | grep hugetlbfs`
  - Check available huge pages: `cat /proc/meminfo | grep -i huge`
  - Ensure the instance has sufficient RAM (256 GB minimum for mainnet-beta)

- **AF_XDP permission errors**: Frankendancer uses AF_XDP for kernel-bypass networking, which requires `CAP_SYS_ADMIN` and `CAP_NET_RAW`. If you see permission errors:
  - Verify the systemd service runs as root (no `User=bcuser` line in `node.service`)
  - Check `LimitMEMLOCK=infinity` is set in the service unit
  - Verify the kernel supports AF_XDP: `ls /sys/fs/bpf/` should exist

- **Frankendancer crashes on startup**: Check `journalctl -u node.service -n 100` for the specific error. Common causes:
  - Invalid TOML configuration: Verify `/home/bcuser/config/frankendancer.toml` is valid TOML
  - Missing identity keypair: Ensure `/home/bcuser/config/validator-keypair.json` exists
  - Network mismatch: Verify `BC_NETWORK` matches the intended network

See [Troubleshooting Guide](/docs/guides/troubleshooting) for detailed diagnostics and solutions.

## Upgrades

To upgrade the validator client version:
1. Create new configuration script with updated version
2. Update `CLIENT_CONFIG` and `CLIENT_VERSION` in `.env`
3. Redeploy: `npx cdk deploy --json --outputs-file deploy-output-{stack-name}.json`

Note: Instance will be replaced and will need to re-sync from snapshots.

## Cost Optimization

- **i7ie instances**: Best performance for mainnet-beta production
- **i7i instances**: ~27% cost savings vs i7ie, good performance
- **i8g.8xlarge (ARM)**: ~40% cost savings vs i7i for base RPC, slower but sufficient
- **Instance store (NVMe)**: Recommended for best I/O performance
- **Traffic shaping**: Reduces outbound transfer by over 85% (most impactful)
- **Savings Plans**: 30-50% discount on long-term commitments

See [Deployment Guide](/docs/guides/deployment-guide) for detailed cost optimization strategies.

## Security Considerations

- RPC endpoints bind to internal IP only (VPC-only access)
- Gossip and P2P ports (8001-8029 TCP/UDP) open for network participation; both clients use dynamic port range 8004-8029 within this range (see [Unified Dynamic Port Range](#port-security-unified-dynamic-port-range))
- Frankendancer shred port (8003/UDP) open for Turbine block data; transaction ingestion ports (9001, 9007) are not exposed (see [Port Security](#port-security-why-ports-9001-and-9007-are-not-exposed))
- AWS Systems Manager Session Manager for secure access (no SSH)
- Encrypted storage volumes
- IAM roles with least privilege
- Optional: Node identity keypair in AWS Secrets Manager

See [Deployment Guide](/docs/guides/deployment-guide) for security best practices.

## FAQ

**Q: When should I choose Frankendancer over Agave?**
A: Frankendancer offers lower networking latency via AF_XDP kernel bypass and is used by many high-performance validators. Choose it if you want cutting-edge networking performance. Agave is the safer, more mature default. Both expose the same RPC API, so you can switch between them by changing `CLIENT_CONFIG` in your `.env` file and redeploying.

**Q: How long does initial sync take?**
A: 12-48 hours for mainnet-beta with automatic snapshot downloading. Sync time is similar for both Agave and Frankendancer.

**Q: Which configuration should I choose?**
A: Use a `rpc-base` configuration for most use cases. Use `rpc-extended` only if you need `getTokenAccountsByOwner` or `getProgramAccounts` queries. Choose between Agave and Frankendancer based on your performance and maturity preferences.

**Q: Why is my data transfer bill high?**
A: Solana mainnet-beta generates 100-200 TiB/month outbound. Enable traffic shaping to reduce by over 85%.

**Q: Should I use instance store or EBS?**
A: Instance store is **recommended** for optimal I/O performance. It's ephemeral but RPC nodes can re-sync.

**Q: Can I run a validator/consensus node?**
A: This configuration is for RPC nodes only. Validator nodes have different requirements not covered here.

**Q: How do I keep my node identity across redeployments?**
A: Store keypair in AWS Secrets Manager and set `SOLANA_NODE_IDENTITY_SECRET_ARN` in .env.

**Q: Does Frankendancer require different hardware than Agave?**
A: No. Both clients have the same minimum requirements: 24-core CPU, 256 GB RAM, 2 TB NVMe SSD. The same instance types work for both.

**Q: Why does Frankendancer run as root?**
A: Frankendancer uses AF_XDP kernel-bypass networking, which requires `CAP_SYS_ADMIN` at startup. It drops privileges to `bcuser` internally via the TOML `user` field after initialization. The Agave client does not need root and runs entirely as `bcuser`.

## Additional Resources

### Client Release Channels

| Client | Repo | Query method | Version line | Prereleases |
|--------|------|--------------|--------------|-------------|
| Agave | [anza-xyz/agave](https://github.com/anza-xyz/agave/releases) | tags (semver) | 3.1.x | exclude rc/beta |
| Frankendancer | [firedancer-io/firedancer](https://github.com/firedancer-io/firedancer/releases) | releases/latest | * | stable only |

> Column legend — **Repo**: canonical `owner/repo` (link goes to the releases page). **Query method**: `releases/latest` = newest non-prerelease via GitHub API (`https://api.github.com/repos/{repo}/releases/latest`); `tags` = list `/tags` and pick the highest matching semver; `releases` = list `/releases` and pick the newest matching the prerelease policy; `pinned-file` = read the named file at the given ref. **Version line**: constrains updates to a release line (`*` = any). **Prereleases**: whether beta/RC tags are eligible.
>
> Note: `Agave` maintains multiple concurrent release lines (e.g. `3.1.x` and `4.0.x`), so `releases/latest` can jump across major lines. The blueprint tracks the `3.1.x` line by default; moving to a newer major line (`4.x`) is an explicit opt-in decision, not a routine update.

- [Solana Documentation](https://docs.solana.com/)
- [Agave Validator GitHub](https://github.com/anza-xyz/agave)
- [Firedancer Documentation](https://docs.firedancer.io/)
- [Firedancer GitHub](https://github.com/firedancer-io/firedancer)
- [Solana RPC API Reference](https://docs.solana.com/api/http)
- [Solana Validator Requirements](https://docs.solana.com/running-validator/validator-reqs)
- [Traffic Shaping Documentation](/docs/guides/traffic-shaping)

## Support

For issues and questions:
- Check [Troubleshooting Guide](/docs/guides/troubleshooting)
- Review [Configuration Reference](/docs/guides/configuration-reference)
- Open a GitHub issue
