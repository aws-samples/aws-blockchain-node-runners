# BNB Smart Chain Node Runner

This protocol implementation provides support for running BNB Smart Chain (BSC) RPC nodes on AWS using the Universal Blockchain Node Runner. BSC uses a single client (BSC Geth) with Parlia consensus built in — no separate consensus client needed.

## Overview of Deployment Architectures

### Single Node Deployment

```
┌─────────────────────────────────────────────────────────────┐
│                         VPC (Default)                        │
│  ┌─────────────────────────────────────────────────────────┐│
│  │                    Public Subnet                         ││
│  │  ┌─────────────────────────────────────────────────────┐││
│  │  │           EC2 Instance (BSC Node)                   │││
│  │  │  ┌──────────────────────────────────────────────┐   │││
│  │  │  │              BSC Geth                        │   │││
│  │  │  │   (execution + consensus via Parlia)         │   │││
│  │  │  │   RPC: Port 8545 | P2P: Port 30303          │   │││
│  │  │  └──────────────────────────────────────────────┘   │││
│  │  │  ┌──────────────────────────────────────────────┐   │││
│  │  │  │    EBS Volume (/data) - 4 TB gp3             │   │││
│  │  │  └──────────────────────────────────────────────┘   │││
│  │  └─────────────────────────────────────────────────────┘││
│  └─────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────┘
```

### High Availability (HA) Deployment

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
│  │  │  BSC Geth   │  │  BSC Geth   │  │  BSC Geth   │    │  │
│  │  └─────────────┘  └─────────────┘  └─────────────┘    │  │
│  └───────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

## Supported Configurations

| Configuration | Client | Sync Mode | Best For |
|--------------|--------|-----------|----------|
| bsc-geth-&lt;version&gt;-full.sh | BSC Geth | Full | General purpose RPC |
| bsc-reth-&lt;version&gt;-full.sh | BSC Reth | Full | High-performance RPC, trace/debug APIs |

> **Note:** Configuration file names include the pinned client version (shown as `<version>` above). For the exact current filename, run `ls node_modules/aws-bnr-blueprint-bnb/configurations/`, or simply copy the matching sample from `samples/` — it already sets `CLIENT_CONFIG` for you.

## Infrastructure Requirements

### Recommended Instance Types

| Network | Deployment | Instance Type | vCPUs | Memory | Storage |
|---------|-----------|---------------|-------|--------|------------|
| Mainnet | Single Node | r7i.4xlarge | 16 | 128 GB | 4 TB gp3 |
| Mainnet | HA (2 nodes) | r7i.4xlarge | 16 each | 128 GB each | 4 TB gp3 each |
| Chapel | Single Node | r7i.2xlarge | 8 | 64 GB | 500 GB gp3 |

**ARM Alternative**: Use `r8g.4xlarge` for ~10% cost savings on mainnet.

### Storage Requirements

| Network | Current Size | Growth Rate | Recommended | Type | IOPS |
|---------|-------------|-------------|-------------|------|------|
| Mainnet | ~3 TB | ~150 GB/month | 4 TB | gp3 | 10,000 |
| Chapel | ~100 GB | ~10 GB/month | 500 GB | gp3 | 4,000 |

### Snapshot Download

BSC mainnet sync from genesis is extremely slow. Snapshot download is strongly recommended and enabled by default (`BNB_DOWNLOAD_SNAPSHOT=true`). Snapshots are sourced from the [48Club BSC Snapshots](https://github.com/48Club/bsc-snapshots).

**Note**: Snapshot download and extraction takes approximately 45 minutes. The fast snapshot archive is ~376 GB compressed (~440 GB extracted).

> Running multiple protocols? Each deployment creates an independent CloudFormation stack. Total costs are additive — use the tables above per protocol.

## Setup Instructions

There are two ways to deploy a BNB Smart Chain node.

### Option 1: AI-Driven Deployment (Recommended)

Deploy with a single prompt. In Kiro (or your AI assistant of choice), run:

```
@deploy a BNB Smart Chain mainnet RPC node in us-east-1
```

The AI assistant will guide you through infrastructure selection, configuration, deployment, and initial healthcheck. For full setup, see [Getting Started](/docs/getting-started/quickstart).

### Option 2: Manual Deployment

This section focuses on BNB-specific configuration.

#### Step 1: Configure Environment

```bash
cp node_modules/aws-bnr-blueprint-bnb/samples/.env-mainnet-bsc-geth-full .env
```

Edit `.env` with your details:

```bash
AWS_ACCOUNT_ID="your-account-id"
AWS_REGION="us-east-1"
```

#### Step 2: Deploy

> CDK bootstrap is a one-time setup step — see [Getting Started](/docs/getting-started/quickstart).

```bash
npx cdk deploy --json --outputs-file deploy-output-bnb-mainnet.json
```

For advanced options (HA mode, multiple stacks, maintenance), see the [Deployment Guide](/docs/guides/deployment-guide).

#### Step 3: Monitor Synchronization

Initial sync with snapshot takes ~1 hour (download + extraction). Without snapshot, sync can take days.

```bash
DASHBOARD=$(cat deploy-output-bnb-mainnet.json | jq -r '..|.DashboardName? | select(. != null)')
echo "Dashboard: https://console.aws.amazon.com/cloudwatch/home#dashboards:name=$DASHBOARD"
```

Key metrics:
- **c1_block_height**: Current block number
- **c1_blocks_behind**: Sync distance (target: 0)

#### Step 4: Verify Node Operation

```bash
INSTANCE_ID=$(cat deploy-output-bnb-mainnet.json | jq -r '..|.InstanceId? | select(. != null)')
aws ssm start-session --target $INSTANCE_ID --region $AWS_REGION

# Check service
sudo systemctl status node

# Test RPC (note: geth binds to the EC2 internal IP, not localhost)
EC2_IP=$(curl -s http://169.254.169.254/latest/meta-data/local-ipv4)
curl -s -X POST -H "Content-Type: application/json" \
    --data '{"jsonrpc":"2.0","method":"eth_blockNumber","params":[],"id":1}' \
    http://$EC2_IP:8545
```

## Configuration Options

### Snapshot Download

BSC mainnet sync from genesis is impractically slow, so snapshot download is enabled by default. Control it with the following `.env` variable:

```bash
# Download a pre-synced snapshot on first boot (default: true)
BNB_DOWNLOAD_SNAPSHOT="true"
```

Snapshots are sourced from the [48Club BSC Snapshots](https://github.com/48Club/bsc-snapshots). Download and extraction take approximately 45 minutes (the fast snapshot archive is ~376 GB compressed, ~440 GB extracted). Set `BNB_DOWNLOAD_SNAPSHOT="false"` only if you intend to sync from genesis.

> **Large snapshots**: For larger BSC archives (e.g., bsc-reth archives in the multi-TB range), the compressed archive plus extracted data can exceed available `/data` space. Configure a temporary staging volume with `SNAPSHOT_STAGING_VOL_SIZE` (in GiB) to avoid disk overflow. See the [Snapshot Staging Guide](/docs/guides/snapshot-staging) for volume sizing guidance and cost analysis.

## Troubleshooting

### Node Not Starting

```bash
export INSTANCE_ID=$(cat deploy-output-bnb-mainnet.json | jq -r '..|.InstanceId? | select(. != null)')
aws logs tail /aws/ec2/blockchain-nodes/systemd-services \
    --log-stream-names $INSTANCE_ID --since 1h
```

Common causes:
- Insufficient disk space (especially during snapshot extraction)
- Failed genesis initialization
- Binary download failure (GitHub rate limits — retry)

### Not Syncing

> **Note**: BSC geth logs to files in `/data/bsc.log*` (hourly rotated), not to journald. Use `tail` to view logs:

```bash
sudo tail -50 /data/bsc.log
```

- Check P2P port 30303 is open in security group
- Verify snapshot downloaded correctly if enabled
- Confirm enough disk IOPS (check CloudWatch disk metrics)

### RPC Not Responding

1. Confirm service is running: `sudo systemctl status node`
2. Verify node is synced (`c1_blocks_behind = 0`)
3. RPC binds to EC2 internal IP, not localhost — use `curl http://<internal-ip>:8545`
4. Check security group allows traffic on port 8545 from VPC

See [Troubleshooting Guide](/docs/guides/troubleshooting) for detailed diagnostics.

## Upgrades

### Upgrading Client Versions

The client version is taken from the configuration file name (the single source of truth), so an upgrade is just a rename plus a config switch:

1. Rename the configuration script to the new version, e.g. `bsc-geth-<old-version>-full.sh` → `bsc-geth-<new-version>-full.sh` (for BSC Reth, include the `-beta` suffix, e.g. `bsc-reth-<new-version>-beta-full.sh`)
2. Update `CLIENT_CONFIG` in `.env` to the new filename
3. Redeploy: `npx cdk deploy --json --outputs-file deploy-output-bnb-mainnet.json`

Note: The instance will be replaced. If snapshot download is enabled, the new instance restores chain data from a recent snapshot rather than syncing from genesis.

### Rolling Updates (HA Only)

HA deployments perform rolling updates automatically, ensuring no RPC downtime during client upgrades. See the [Deployment Guide](/docs/guides/deployment-guide) for details.

## Cost Optimization

### Storage
- gp3 is sufficient for BSC (3s block time is less demanding than Base's 2s)
- Right-size: mainnet needs ~4TB today, growing ~150GB/month

### Compute
- ARM instances (`r8g.4xlarge`) save ~10% vs x86 (`r7i.4xlarge`)
- Savings Plans: 30-50% discount for long-term commitments

### Snapshot
- Downloading a snapshot saves days of sync time and reduces IOPS cost during initial sync

See the [Deployment Guide](/docs/guides/deployment-guide) for detailed cost optimization strategies.

## Security Considerations

- RPC endpoints bind to internal IP only (`$EC2_INTERNAL_IP`)
- P2P port 30303 open for network participation
- No SSH access — use AWS Systems Manager Session Manager
- Encrypted EBS volumes
- IAM roles with least privilege

## FAQ

**Q: Why is snapshot download recommended?**

A: BSC mainnet sync from genesis can take days. Downloading a recent snapshot (enabled by default via `BNB_DOWNLOAD_SNAPSHOT="true"`) reduces initial sync to roughly one hour and lowers IOPS cost during sync.

**Q: How long does initial sync take?**

A: With a snapshot, ~1 hour (download plus extraction). Without a snapshot, sync can take several days.

**Q: Does BSC need a separate consensus client?**

A: No. BSC Geth uses Parlia consensus built into a single client, so there is no separate execution/consensus split as on Ethereum.

**Q: Where are the node logs?**

A: BSC geth logs to hourly-rotated files in `/data/bsc.log*` rather than journald. Use `sudo tail -50 /data/bsc.log` to view recent logs.

## Additional Resources

### Client Release Channels

| Client | Repo | Query method | Version line | Prereleases |
|--------|------|--------------|--------------|-------------|
| BSC Geth | [bnb-chain/bsc](https://github.com/bnb-chain/bsc/releases) | releases/latest | * | stable only |
| BSC Reth | [bnb-chain/reth-bsc](https://github.com/bnb-chain/reth-bsc/releases) | releases (newest) | * | beta allowed (no stable line) |

> Column legend — **Repo**: canonical `owner/repo` (link goes to the releases page). **Query method**: `releases/latest` = newest non-prerelease via GitHub API (`https://api.github.com/repos/{repo}/releases/latest`); `tags` = list `/tags` and pick the highest matching semver; `releases` = list `/releases` and pick the newest matching the prerelease policy; `pinned-file` = read the named file at the given ref. **Version line**: constrains updates to a release line (`*` = any). **Prereleases**: whether beta/RC tags are eligible.
>
> Note: `BSC Reth` is built from `bnb-chain/reth-bsc` (the repo the configuration script clones), and it only publishes `-beta` tags — so the newest beta is its effective stable channel.

- [BNB Chain Documentation](https://docs.bnbchain.org)
- [BSC GitHub](https://github.com/bnb-chain/bsc)
- [48Club BSC Snapshots](https://github.com/48Club/bsc-snapshots)
- [BSC RPC API Reference](https://docs.bnbchain.org/bnb-smart-chain/developers/json-rpc/)

## Support

For issues and questions:
- Check [Troubleshooting Guide](/docs/guides/troubleshooting)
- Review [Configuration Reference](/docs/guides/configuration-reference)
- Open a GitHub issue
