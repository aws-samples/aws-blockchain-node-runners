# Base Protocol Node Runner

This protocol implementation provides support for running Base RPC nodes on AWS using the Universal Blockchain Node Runner. Base is an Ethereum L2 built on the OP Stack, using base-reth-node (execution) paired with base-consensus (consensus layer).

> **Important: Base Azul Upgrade (May 21, 2026 mainnet)**
> The Azul upgrade requires all nodes to run `base-reth-node` (EL) and `base-consensus` (CL). Nodes running op-node, op-geth, op-reth, or nethermind alone will not support the network after activation. This blueprint enables `base-consensus` by default. See the [Azul migration guide](https://docs.base.org/base-chain/node-operators/base-v1-upgrade) for details.

## Overview of Deployment Architectures

### Single Node Deployment

A single EC2 instance running base-reth-node (execution) and base-consensus, suitable for development, testing, and production RPC access.

```
┌─────────────────────────────────────────────────────────────┐
│                         VPC (Default)                        │
│  ┌─────────────────────────────────────────────────────────┐│
│  │                    Public Subnet                         ││
│  │  ┌─────────────────────────────────────────────────────┐││
│  │  │           EC2 Instance (Base Node)                  │││
│  │  │  ┌──────────────┐  ┌──────────────┐                │││
│  │  │  │ base-reth-   │  │    base-     │                │││
│  │  │  │   node       │◄─┤  consensus   │                │││
│  │  │  │  (execution) │  │  (consensus) │                │││
│  │  │  │  Port 8545   │  │  Port 7545   │                │││
│  │  │  └──────────────┘  └──────────────┘                │││
│  │  │  ┌─────────────────────────────────────────────┐   │││
│  │  │  │    EBS Volume (/data) - 4 TB io2            │   │││
│  │  │  └─────────────────────────────────────────────┘   │││
│  │  └─────────────────────────────────────────────────────┘││
│  └─────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────┘
```

### High Availability (HA) Deployment

Multiple EC2 instances behind an Application Load Balancer for production RPC workloads.

```
┌─────────────────────────────────────────────────────────────┐
│                         VPC (Default)                        │
│  ┌─────────────────────────────────────────────────────────┐│
│  │           Application Load Balancer (Port 8545)          ││
│  └─────────────────────────────────────────────────────────┘│
│                              │                               │
│  ┌───────────────────────────┼───────────────────────────┐  │
│  │                Auto Scaling Group                      │  │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐    │  │
│  │  │   Node 1    │  │   Node 2    │  │   Node N    │    │  │
│  │  │ op-geth +   │  │ op-geth +   │  │ op-geth +   │    │  │
│  │  │ op-node     │  │ op-node     │  │ op-node     │    │  │
│  │  └─────────────┘  └─────────────┘  └─────────────┘    │  │
│  └───────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

## Supported Configurations

| Configuration | Execution | Consensus | Snapshot Support | Best For |
|--------------|-----------|-----------|------------------|----------|
| base-reth-v1.2.0-full.yml | base-reth-node | base-consensus | Yes | Production RPC (recommended) |

**Note:** As of the Base Azul upgrade (May 21, 2026 mainnet), only `base-reth-node` + `base-consensus` is supported. op-geth, nethermind, and op-node are no longer compatible with Base mainnet. This blueprint uses snapshot restoration for fast initial sync (hours instead of days).

## Infrastructure Requirements

### Recommended Instance Types

| Network | Deployment | Instance Type | vCPUs | Memory | Storage |
|---------|-----------|---------------|-------|--------|---------|
| Mainnet | Single Node | i8ge.6xlarge | 24 | 192 GB | 15 TB Instance Store (RAID 0 array) |
| Mainnet | HA (2 nodes) | i8ge.6xlarge | 24 | 192 GB | 15 TB Instance Store (RAID 0 array) |
| Sepolia | Single Node | r7i.xlarge | 4 | 32 GB | 500 GB io2 |

### Storage Requirements

| Network | Current Size | Growth Rate | Recommended | Type | IOPS |
|---------|-------------|-------------|-------------|------|------|
| Mainnet | ~1.83 - 6.95 TB | ~100 GB/month | 14 TB | Instance Store | 30,000 |
| Sepolia | ~440.54GB - 1.43 TB | ~10 GB/month | 2 TB | gp3 | 7,000 |


### Network Traffic

- **P2P Traffic**: ~5-15 TB/month outbound (mainnet, without traffic shaping)
- **With traffic shaping (40 Mbit/s)**: ~0.4 TB/month (~97% reduction)
- **L1 RPC Traffic**: Depends on L1 endpoint (your Ethereum mainnet RPC)

Traffic shaping is strongly recommended for mainnet deployments.

> Running multiple protocols? Each deployment creates an independent CloudFormation stack. Total costs are additive — use the tables above per protocol.

## Setup Instructions

There are two ways to deploy a Base node.

### Option 1: AI-Driven Deployment (Recommended)

Deploy with a single prompt. In Kiro (or your AI assistant of choice), run:

```
@deploy a Base mainnet RPC node in us-east-1
```

The AI assistant will guide you through infrastructure selection, configuration, deployment, and initial healthcheck. For full setup, see [Getting Started](/docs/getting-started/quickstart).

### Option 2: Manual Deployment

This section focuses on Base-specific configuration.

#### Prerequisites

In addition to the [general prerequisites](/docs/getting-started/quickstart) (AWS CLI, Node.js, CDK bootstrap), Base requires:

1. **An Ethereum mainnet RPC endpoint** (required — Base derives blocks from L1)
2. **An Ethereum Beacon API endpoint** (required — for op-node)

#### Step 1: Configure Environment

Copy the sample environment file:

```bash
cp node_modules/aws-bnr-blueprint-base/samples/.env-mainnet-base-reth-full .env
```

Edit `.env` with your details:

```bash
AWS_ACCOUNT_ID="your-account-id"
AWS_REGION="us-east-1"
BASE_L1_RPC_URL="https://your-ethereum-l1-rpc"
BASE_L1_BEACON_URL="https://your-ethereum-beacon-api"
```

#### Step 2: Choose Network

```bash
# Mainnet
BC_NETWORK="base-mainnet"

# Sepolia testnet
BC_NETWORK="base-sepolia"
```

#### Step 3: Deploy

> CDK bootstrap is a one-time setup step — see [Getting Started](/docs/getting-started/quickstart).

```bash
npx cdk deploy --json --outputs-file deploy-output-base-mainnet.json
```

For advanced options (HA mode, multiple stacks, maintenance), see the [Deployment Guide](/docs/guides/deployment-guide).

#### Step 4: Monitor Synchronization

Initial sync takes 12-48 hours depending on network conditions. With reth and snapshot restoration enabled, sync can complete in 2-6 hours.

```bash
DASHBOARD=$(cat deploy-output-base-mainnet.json | jq -r '..|.DashboardName? | select(. != null)')
echo "Dashboard: https://console.aws.amazon.com/cloudwatch/home#dashboards:name=$DASHBOARD"
```

Key metrics:
- **c1_blocks_behind**: Execution client (op-geth or reth) sync distance (target: 0)
- **c2_blocks_behind**: op-node safe/unsafe lag (target: low)

#### Step 5: Verify Node Operation

```bash
INSTANCE_ID=$(cat deploy-output-base-mainnet.json | jq -r '..|.InstanceId? | select(. != null)')
aws ssm start-session --target $INSTANCE_ID --region $AWS_REGION

# Check service
sudo systemctl status node

# Test RPC (note: execution client binds to the EC2 internal IP, not localhost)
EC2_IP=$(curl -s http://169.254.169.254/latest/meta-data/local-ipv4)
curl -s -X POST -H "Content-Type: application/json" \
    --data '{"jsonrpc":"2.0","method":"eth_blockNumber","params":[],"id":1}' \
    http://$EC2_IP:8545
```

## Configuration Options

### L1 RPC Requirements

Base requires a connection to Ethereum L1. You need two endpoints:

```bash
# Ethereum execution RPC (eth_* methods)
BASE_L1_RPC_URL="https://eth-mainnet.g.alchemy.com/v2/your-key"

# Ethereum beacon API (for op-node blob fetching)
BASE_L1_BEACON_URL="https://eth-beacon.g.alchemy.com/v2/your-key"
```

Free public options: Alchemy, Infura, QuickNode (rate-limited). For production, use a dedicated Ethereum node or paid tier.

### Traffic Shaping

Base generates significant P2P traffic due to its 2-second block time. Traffic shaping is enabled by default at 40 Mbit/s:

```bash
TRAFFIC_SHAPING_ENABLED="true"
TRAFFIC_SHAPING_RATE_MBIT="40"      # ~0.4 TiB/month
TRAFFIC_SHAPING_MAX_BLOCKS_BEHIND="10"
```

See [Traffic Shaping Documentation](/docs/guides/traffic-shaping) for details.

### Snapshot Restoration

Snapshots significantly reduce initial sync time by restoring chain data from a pre-synced archive. This is supported for reth configurations and follows the process documented at [docs.base.org](https://docs.base.org/base-chain/node-operators/snapshots).

To enable snapshot restoration, set the following in your `.env` file:

```bash
SNAPSHOT_ENABLED="true"
SNAPSHOT_DOWNLOAD_URL="https://mainnet-reth-archive-snapshots.base.org"
```

Available snapshot URLs:

| Network | Type | URL |
|---------|------|-----|
| Mainnet | Archive (recommended) | `https://mainnet-reth-archive-snapshots.base.org` |
| Mainnet | Pruned | `https://mainnet-reth-pruned-snapshots.base.org` |
| Sepolia | Archive (recommended) | `https://sepolia-reth-archive-snapshots.base.org` |
| Sepolia | Pruned | `https://sepolia-reth-pruned-snapshots.base.org` |

**How it works**: During first boot, the node.sh script automatically:
1. Resolves the latest snapshot filename from the `SNAPSHOT_DOWNLOAD_URL/latest` endpoint
2. Downloads the snapshot archive using `wget`
3. Extracts the archive (supports `.tar.zst` and `.tar.gz` formats)
4. Moves the chain data into the execution client's data directory
5. Starts the node, which syncs from the snapshot's block height

**Notes**:
- Snapshot restoration only runs on first boot when the data directory is empty
- Archive snapshots are recommended for most use cases
- Pruned snapshots are smaller but have limited historical data
- Download time depends on network speed; mainnet archives are ~1-2 TB

> **Large snapshots**: Base mainnet archives can exceed available `/data` space during download and extraction (peak usage = compressed archive + extracted data). Configure a temporary staging volume with `SNAPSHOT_STAGING_VOL_SIZE` (in GiB) to avoid disk overflow. See the [Snapshot Staging Guide](/docs/guides/snapshot-staging) for volume sizing guidance and cost analysis.

## Troubleshooting

### Node Not Starting

Check CloudWatch logs:
```bash
export INSTANCE_ID=$(cat deploy-output-base-mainnet.json | jq -r '..|.InstanceId? | select(. != null)')
aws logs tail /aws/ec2/blockchain-nodes/systemd-services \
    --log-stream-names $INSTANCE_ID --since 1h
```

Common causes:
- Missing or invalid `BASE_L1_RPC_URL` / `BASE_L1_BEACON_URL`
- Docker pull failures (GCP Artifact Registry rate limits — retry)
- Insufficient disk space

### op-geth Not Syncing

```bash
sudo docker logs execution --tail 100 -f
```

- Verify L1 RPC is reachable and not rate-limited
- Check P2P port 30303 is open in security group
- Confirm enough disk IOPS (check CloudWatch disk metrics)

### Reth Not Syncing

```bash
sudo docker logs execution --tail 100 -f
```

- Verify L1 RPC is reachable and not rate-limited
- Check P2P port 30303 is open in security group
- If snapshot was used, verify data was extracted correctly: `ls -la /data/execution/`
- Confirm enough disk IOPS (check CloudWatch disk metrics)
- Reth does not suffer from the snap sync stall issue that affects op-geth

### Snapshot Download Failed

If snapshot download fails during initial setup, the node will fall back to syncing from genesis. To retry:

1. Connect to the instance: `aws ssm start-session --target $INSTANCE_ID`
2. Stop the node: `sudo systemctl stop node`
3. Clear the data directory: `sudo rm -rf /data/execution/*`
4. Re-run the snapshot download manually following the steps in [Base snapshot docs](https://docs.base.org/base-chain/node-operators/snapshots)
5. Set ownership: `sudo chown -R bcuser:bcuser /data/execution`
6. Start the node: `sudo systemctl start node`

### op-node Not Syncing

```bash
sudo docker logs rollup --tail 100 -f
```

- Verify L1 Beacon API is reachable (`BASE_L1_BEACON_URL`)
- Confirm op-geth is healthy first (op-node depends on it)
- Check port 9222 is open for P2P

### RPC Not Responding

1. Confirm both containers are running: `sudo docker ps`
2. Verify node is synced (`c1_blocks_behind = 0`)
3. Check security group allows traffic on port 8545 from VPC

See [Troubleshooting Guide](/docs/guides/troubleshooting) for detailed diagnostics.

## Upgrades

### Upgrading Client Versions

1. Update image tags in the configuration `.yml` file
2. Update `CLIENT_CONFIG` in `.env` to the new filename
3. Redeploy: `npx cdk deploy --json --outputs-file deploy-output-base-mainnet.json`

The instance will be replaced — the execution client will resync from the new image (or from snapshot if enabled).

### Rolling Updates (HA Only)

HA deployments perform rolling updates automatically, ensuring no RPC downtime during upgrades.

## Cost Optimization

### Storage
- io2 is required for mainnet (2s block time); gp3 is sufficient for Sepolia
- Right-size: mainnet needs ~2TB today, growing ~100GB/month

### Compute
- ARM instances (`r8g.2xlarge`) save ~10% vs x86 (`r7i.2xlarge`)
- Savings Plans: 30-50% discount for long-term commitments

### Network
- Enable traffic shaping to reduce outbound from ~15TB to ~0.4TB/month
- Use a self-hosted Ethereum L1 node to eliminate L1 RPC costs

See the [Deployment Guide](/docs/guides/deployment-guide) for detailed cost optimization strategies.

## Security Considerations

- RPC endpoints bind to internal IP only (`$EC2_INTERNAL_IP`)
- P2P ports (30303, 9222) open for network participation
- JWT secret generated locally for execution-rollup communication
- No SSH access — use AWS Systems Manager Session Manager
- Encrypted EBS volumes
- IAM roles with least privilege

## FAQ

**Q: Do I need my own Ethereum node?**

A: No, but it's recommended for production. A third-party RPC (Alchemy, Infura) works fine but introduces a dependency and may have rate limits. Base's L1 RPC calls are moderate volume.

**Q: How long does initial sync take?**

A: With reth and snapshot restoration enabled, sync completes in 2-6 hours. Without snapshots (op-geth snap sync), expect 12-48 hours depending on network speed and L1 RPC performance.

**Q: Should I use reth or op-geth?**

A: Reth is recommended. It's the default client in the official Base node repository, supports snapshot restoration for fast initial sync, and does not suffer from the snap sync stall issues that affect op-geth. Use op-geth only if you have a specific reason to prefer it.

**Q: Why is my data transfer bill high?**

A: Base's 2-second block time generates ~5-15 TB/month outbound without traffic shaping. Enable `TRAFFIC_SHAPING_ENABLED=true` to reduce by ~97%.

**Q: Can I run a Base validator?**

A: Base is a sequencer-based L2 — there are no independent validators in the traditional sense. This blueprint runs an RPC node that derives blocks from the sequencer and L1.

**Q: What's the difference between mainnet and base-mainnet in BC_NETWORK?**

A: `BC_NETWORK=base-mainnet` is the correct value for Base. The `base-` prefix is required by op-geth's `--op-network` flag and op-node's `--network` flag to distinguish Base from other OP Stack chains. Note: reth uses `--chain=base` for mainnet internally, but the `BC_NETWORK` value in your `.env` should always be `base-mainnet` — the node.sh script handles the translation.

**Q: My op-geth snap sync stalled near the end of chain download (~95-97%). What happened?**

A: This is a known issue with geth's snap sync scheduler. When the snap sync pivot moves (you'll see `Pivot seemingly stale, moving` warnings in `docker logs execution`), all in-flight storage range requests are invalidated. If two pivot moves happen in quick succession — especially while state healing is completing — the download scheduler can enter a dead state where it has an empty request queue and no trigger to refill it. Symptoms include:
- `eth_syncing` returns a sync object with a frozen `currentBlock` that never advances
- `eth_blockNumber` returns `0x0`
- Only `Expired request does not exist` errors appear in logs
- CPU and disk I/O drop to near zero

The syncchecker includes automatic stall detection: if op-geth reports an active sync but `currentBlock` hasn't advanced for 10 consecutive checks (~10 minutes), the `execution` container is automatically restarted. The node recovers from the same point with no data loss. The watchdog is smart enough to distinguish a real stall from **state healing** — during state healing, `currentBlock` is frozen at the snap pivot by design while trie nodes are downloaded, and the watchdog skips restart in this phase. You can also restart manually:
```bash
sudo docker restart execution
```
This is an upstream geth issue (see [go-ethereum#26429](https://github.com/ethereum/go-ethereum/issues/26429)). It may be resolved in future op-geth releases.

## Additional Resources

### Client Release Channels

The Base node is built from source by cloning the [base/node](https://github.com/base/node) repository at a **pinned release tag** and running `docker compose build`. The deployed version is therefore governed by `base_node_tag` in [`configurations/base-reth-v1.2.0-full.yml`](configurations/base-reth-v1.2.0-full.yml) — `node.sh` clones exactly that ref and refuses a moving branch (`main`/`master`/`HEAD`). The individual client binaries (base-reth-node, base-consensus) are pinned inside that tagged release's `versions.env`, so reading `versions.env` is informational only.

To upgrade Base, set `base_node_tag` to a newer [base/node release tag](https://github.com/base/node/tags) and rename the configuration file to match (e.g. `base-reth-v1.2.0-full.yml`), updating `package.json` and the sample `.env` files' `CLIENT_CONFIG`. The `@version-update` workflow handles this.

| Client | Repo | Query method | Version line | Prereleases |
|--------|------|--------------|--------------|-------------|
| base/node (repo ref) | [base/node](https://github.com/base/node/releases) | tags → set `base_node_tag` | * | stable only |

> Column legend — **Repo**: canonical `owner/repo` (link goes to the releases page). **Query method**: `releases/latest` = newest non-prerelease via GitHub API (`https://api.github.com/repos/{repo}/releases/latest`); `tags` = list `/tags` and pick the highest matching semver; `releases` = list `/releases` and pick the newest matching the prerelease policy; `pinned-file` = read the named file at the given ref. **Version line**: constrains updates to a release line (`*` = any). **Prereleases**: whether beta/RC tags are eligible.

- [Base Documentation](https://docs.base.org)
- [Base Node GitHub](https://github.com/base/node)
- [Base Snapshots](https://docs.base.org/base-chain/node-operators/snapshots)
- [OP Stack Documentation](https://docs.optimism.io)
- [Base RPC API Reference](https://docs.base.org/docs/tools/node-providers)

## Support

For issues and questions:
- Check [Troubleshooting Guide](/docs/guides/troubleshooting)
- Review [Configuration Reference](/docs/guides/configuration-reference)
- Open a GitHub issue
