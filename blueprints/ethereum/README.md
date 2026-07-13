# Ethereum Protocol Node Runner

This protocol implementation provides support for running Ethereum RPC nodes on AWS using the Universal Blockchain Node Runner. It supports multiple execution and consensus client combinations with flexible deployment options.

## Overview of Deployment Architectures

The Ethereum protocol supports two deployment modes:

### Single Node Deployment

A single EC2 instance running both execution and consensus clients, suitable for development, testing, and small-scale production use.

```
┌─────────────────────────────────────────────────────────────┐
│                         VPC (Default)                        │
│  ┌─────────────────────────────────────────────────────────┐│
│  │                    Public Subnet                         ││
│  │  ┌─────────────────────────────────────────────────────┐││
│  │  │         EC2 Instance (Ethereum Node)                │││
│  │  │  ┌──────────────┐  ┌──────────────┐                │││
│  │  │  │  Execution   │  │  Consensus   │                │││
│  │  │  │   Client     │◄─┤   Client     │                │││
│  │  │  │  (Geth/Reth) │  │ (Lighthouse) │                │││
│  │  │  └──────────────┘  └──────────────┘                │││
│  │  │  ┌─────────────────────────────────────────────┐   │││
│  │  │  │    EBS Volume (/data) - 3+ TB gp3          │   │││
│  │  │  └─────────────────────────────────────────────┘   │││
│  │  └─────────────────────────────────────────────────────┘││
│  └─────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────┘
```

### High Availability (HA) Deployment

Multiple EC2 instances behind an Application Load Balancer with auto-scaling for production workloads.

```
┌─────────────────────────────────────────────────────────────┐
│                         VPC (Default)                        │
│  ┌─────────────────────────────────────────────────────────┐│
│  │                Application Load Balancer                 ││
│  │                    (Port 8545 RPC)                       ││
│  └─────────────────────────────────────────────────────────┘│
│                              │                               │
│  ┌───────────────────────────┼───────────────────────────┐  │
│  │                Auto Scaling Group                      │  │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐    │  │
│  │  │   Node 1    │  │   Node 2    │  │   Node N    │    │  │
│  │  │ Exec + Cons │  │ Exec + Cons │  │ Exec + Cons │    │  │
│  │  └─────────────┘  └─────────────┘  └─────────────┘    │  │
│  └───────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

## Supported Configurations

The Ethereum protocol supports multiple execution and consensus client combinations for client diversity:

### Execution Clients
- **Geth** - Go Ethereum, most popular execution client
- **Reth** - Rust-based execution client, high performance
- **Erigon** - Efficient execution client with lower storage requirements
- **Besu** - Java-based execution client by Hyperledger
- **Nethermind** - .NET-based execution client

### Consensus Clients
- **Lighthouse** - Rust-based consensus client
- **Prysm** - Go-based consensus client
- **Teku** - Java-based consensus client
- **Caplin** - Erigon's integrated consensus client

### Available Configurations

| Configuration | Execution | Consensus | Best For |
|--------------|-----------|-----------|----------|
| geth-&lt;version&gt;-lighthouse-&lt;version&gt;-full.yml | Geth | Lighthouse | General purpose, most tested |
| reth-&lt;version&gt;-lighthouse-&lt;version&gt;-archive.yml | Reth | Lighthouse | High performance, fast sync |
| erigon-&lt;version&gt;-caplin-archive.yml | Erigon | Caplin (built-in) | Lower storage, integrated consensus |
| erigon-&lt;version&gt;-prysm-&lt;version&gt;-archive.yml | Erigon | Prysm | Client diversity with external CL |
| besu-&lt;version&gt;-teku-&lt;version&gt;-full.yml | Besu | Teku | Enterprise deployments |
| nethermind-&lt;version&gt;-teku-&lt;version&gt;-full.yml | Nethermind | Teku | .NET ecosystem |

> **Note:** Configuration file names include the pinned client versions (shown as `<version>` above). For the exact current filenames, run `ls node_modules/aws-bnr-blueprint-ethereum/configurations/`, or simply copy the matching sample from `samples/` — it already sets `CLIENT_CONFIG` for you.

## Infrastructure Requirements

### Recommended Instance Types

| Network | Deployment | Instance Type | vCPUs | Memory | Storage |
|---------|-----------|---------------|-------|--------|---------|
| Mainnet (Full) | Single Node | r7g.2xlarge | 8 | 64 GB | 2.5 TB gp3 |
| Mainnet (Archive) | Single Node | i8g.4xlarge | 16 | 128 GB | 3.75 TB NVMe |
| Mainnet (Full HA) | HA (2 nodes) | r7g.2xlarge | 8 each | 64 GB each | 2.5 TB gp3 each |
| Sepolia | Single Node | r7g.xlarge | 4 | 32 GB | 256 GB gp3 |

*For cost estimates, use the [AWS Pricing Calculator](https://calculator.aws/) with your specific region and commitment level.

**Note**: Archive nodes use i8g.4xlarge with NVMe instance store for maximum I/O performance (<1ms latency, 250K+ IOPS). Full nodes use r7g.2xlarge with gp3 EBS for cost-effective persistent storage.

### Storage Requirements

| Network | Node Type | Current Size | Growth Rate | Recommended | Type | IOPS | Throughput |
|---------|-----------|-------------|-------------|-------------|------|------|------------|
| Mainnet | Full | ~2 TB | ~50 GB/month | 2.5 TB | gp3 | 8,000 | 700 MB/s |
| Mainnet | Archive | ~3 TB | ~100 GB/month | 3.75 TB | Instance Store (NVMe) | 250K+ | 10+ GB/s |
| Sepolia | Full | ~100 GB | ~5 GB/month | 256 GB | gp3 | 3,000 | 250 MB/s |

**Storage Type Selection**:
- **Full Nodes**: Use gp3 EBS volumes for cost-effective persistent storage
- **Archive Nodes**: Use instance store (NVMe) for maximum I/O performance with ephemeral storage
  - Reth, Erigon archive configurations use i8g.4xlarge with 3.75TB NVMe
  - <1ms latency vs 5-10ms for EBS
  - 250K+ IOPS vs 16K max for gp3
  - Note: Data is lost on instance stop/termination

### Network Traffic

- **P2P Traffic**: ~3 TB/month outbound (mainnet, supernode mode — includes blob column serving)
- **RPC Traffic**: Varies based on usage
- **Checkpoint Sync**: Significantly reduces initial sync time

> **Note**: Supernode mode (default) increases P2P bandwidth by ~30x for blob data compared to a regular node. This is well within the capacity of recommended instance types but may increase data transfer costs by ~$50-150/month depending on peer demand.

> Running multiple protocols? Each deployment creates an independent CloudFormation stack. Total costs are additive — use the tables above per protocol.

## Setup Instructions

There are two ways to deploy an Ethereum node.

### Option 1: AI-Driven Deployment (Recommended)

Deploy with a single prompt. In Kiro (or your AI assistant of choice), run:

```
@deploy an Ethereum mainnet RPC node in us-east-1
```

The AI assistant will guide you through infrastructure selection, configuration, deployment, and initial healthcheck. For full setup, see [Getting Started](/docs/getting-started/quickstart).

### Option 2: Manual Deployment

This section focuses on Ethereum-specific configuration options and client selection.

#### Step 1: Configure Environment

Copy the appropriate sample configuration:

```bash
# For mainnet single Geth node
cp node_modules/aws-bnr-blueprint-ethereum/samples/.env-mainnet-geth-lighthouse-full .env

# For mainnet Reth archive node
cp node_modules/aws-bnr-blueprint-ethereum/samples/.env-mainnet-reth-lighthouse-archive .env

# For HA deployment
cp node_modules/aws-bnr-blueprint-ethereum/samples/.env-mainnet-geth-lighthouse-full-ha .env
```

Edit `.env` with your AWS account details:

```bash
AWS_ACCOUNT_ID="your-account-id"
AWS_REGION="us-east-1"
```

#### Step 2: Choose Client Combination

Select your preferred client combination by setting `CLIENT_CONFIG` to one of the file names in `configurations/` (replace `<version>` with the pinned version — the matching sample already sets this for you):

```bash
# Most popular combination
CLIENT_CONFIG="geth-<version>-lighthouse-<version>-full.yml"

# High performance option
CLIENT_CONFIG="reth-<version>-lighthouse-<version>-archive.yml"

# Erigon with built-in Caplin consensus
CLIENT_CONFIG="erigon-<version>-caplin-archive.yml"

# Erigon with external Prysm consensus
CLIENT_CONFIG="erigon-<version>-prysm-<version>-archive.yml"
```

#### Step 3: Deploy

> CDK bootstrap is a one-time setup step — see [Getting Started](/docs/getting-started/quickstart).

```bash
# Deploy the stack
npx cdk deploy --json --outputs-file deploy-output.json
```

For advanced options (HA mode, multiple stacks, maintenance), see the [Deployment Guide](/docs/guides/deployment-guide).

#### Step 4: Monitor Synchronization

Initial synchronization can take 6-48 hours depending on:
- Client combination chosen
- Network conditions
- Whether checkpoint sync is used

Monitor progress via CloudWatch dashboard:

```bash
# Get dashboard name from deployment output
DASHBOARD_NAME=$(cat deploy-output.json | jq -r '..|.DashboardName? | select(. != null)')
echo "Dashboard: https://console.aws.amazon.com/cloudwatch/home?region=$AWS_REGION#dashboards:name=$DASHBOARD_NAME"
```

Key metrics to watch:
- **c1_blocks_behind**: Execution client sync status (should reach 0)
- **c2_blocks_behind**: Consensus client sync distance (should reach 0)
- **c1_block_height**: Current execution block
- **c2_block_height**: Current consensus slot

#### Step 5: Verify Node Operation

Once synchronized, test the RPC endpoint:

```bash
# Get instance ID
INSTANCE_ID=$(cat deploy-output.json | jq -r '..|.InstanceId? | select(. != null)')

# Connect via SSM
aws ssm start-session --target $INSTANCE_ID --region $AWS_REGION

# Check service status
sudo systemctl status node

# View logs
sudo docker logs execution -f
sudo docker logs consensus -f
```

Test RPC API (from within VPC):

```bash
# Get internal IP
NODE_INTERNAL_IP=$(aws ec2 describe-instances --instance-ids $INSTANCE_ID \
    --query 'Reservations[*].Instances[*].PrivateIpAddress' --output text)

# Query latest block
curl -X POST -H "Content-Type: application/json" \
    --data '{"jsonrpc":"2.0","method":"eth_blockNumber","params":[],"id":1}' \
    http://$NODE_INTERNAL_IP:8545
```

## Configuration Options

### Checkpoint Sync

Checkpoint sync dramatically reduces initial sync time (from days to hours):

```bash
# Mainnet
ETH_CONSENSUS_CHECKPOINT_SYNC_URL="https://beaconstate.ethstaker.cc"

# Sepolia
ETH_CONSENSUS_CHECKPOINT_SYNC_URL="https://checkpoint-sync.sepolia.ethpandaops.io"

# Holesky
ETH_CONSENSUS_CHECKPOINT_SYNC_URL="https://checkpoint-sync.holesky.ethpandaops.io"
```

Pick any provider from the maintained list — https://eth-clients.github.io/checkpoint-sync-endpoints/ — if one is unreachable. Endpoints do come and go (the previously used `beaconstate.info` domain stopped resolving).

### Supernode Mode (Lighthouse — PeerDAS)

After the Ethereum Pectra upgrade (May 2025), PeerDAS (EIP-7594) replaced full blob distribution with Data Availability Sampling. Under PeerDAS, regular beacon nodes only store a small subset of data columns (typically 4 out of 128) and **cannot** serve full blobs via the `/eth/v1/beacon/blob_sidecars` API.

This blueprint enables `--supernode` by default on all Lighthouse configurations, which stores all 128 data columns. This is required if:

- The node serves as an L1 data source for L2 rollup nodes (Base, OP Stack, etc.)
- You need the blob sidecars API to return complete blob data
- You want to contribute to network-wide data availability

```bash
# Default: full supernode (128 columns) — recommended
ETH_CONSENSUS_SUPERNODE="true"

# Alternative: semi-supernode (64 columns) — enough to reconstruct blobs, lower bandwidth
ETH_CONSENSUS_SUPERNODE="semi"

# Disable: regular node (4 columns) — blob API will NOT work
ETH_CONSENSUS_SUPERNODE="false"
```

**Resource impact of supernode mode:**
- Bandwidth: ~30x more blob-related P2P traffic (~5-15 MB/s additional sustained)
- Storage: ~50-100 GB extra for the full column set over the ~18-day retention window
- CPU/Memory: negligible impact

**Note**: This setting only applies to Lighthouse-based configurations. Prysm, Teku, and Caplin (Erigon) handle PeerDAS differently and are not affected.

**Important**: If you change this setting on an existing deployment from `false` to `true`, you must delete the beacon database and re-sync via checkpoint sync. Adding `--supernode` does not backfill historical data columns.

### Snapshot Support

For Ethereum, **checkpoint sync** (above) is the recommended fast-sync method. Block snapshot download is also supported through the generic `SNAPSHOT_ENABLED` / `SNAPSHOT_DOWNLOAD_URL` settings — see the [Configuration Reference](/docs/guides/configuration-reference) for these variables.

## Troubleshooting

### Node Not Syncing

1. Check if containers are running:
```bash
sudo docker ps
```

2. View execution client logs:
```bash
sudo docker logs execution --tail 100 -f
```

3. View consensus client logs:
```bash
sudo docker logs consensus --tail 100 -f
```

### High Memory Usage

Ethereum nodes require significant memory. If experiencing OOM issues:
- Increase instance size (e.g., r7g.2xlarge → r7g.4xlarge)
- Reduce cache size in client configuration
- Consider using Erigon for lower memory footprint

### Slow Sync

- Verify checkpoint sync URL is working
- Check network connectivity and peer count
- Consider using Reth for faster sync times
- Ensure sufficient IOPS on storage volume

### RPC Not Responding

1. Verify node is fully synced (blocks_behind = 0)
2. Check security group allows traffic on port 8545
3. Verify RPC is bound to internal IP correctly
4. Test from within VPC using CloudShell

### Blob Sidecars API Returns Error (Lighthouse)

If you see `BAD_REQUEST: Insufficient data columns to reconstruct blobs` when calling `/eth/v1/beacon/blob_sidecars/{slot}`:

1. Verify `ETH_CONSENSUS_SUPERNODE` is set to `"true"` in your `.env` file
2. If you changed this setting on an existing deployment, you must re-sync the beacon:
```bash
# Stop the node
sudo systemctl stop node

# Delete beacon database
sudo rm -rf /data/consensus/beacon

# Start the node (will checkpoint sync)
sudo systemctl start node
```
3. Wait for checkpoint sync to complete (~2-5 minutes) and backfill to reach needed slots

This is required post-Pectra (May 2025) due to PeerDAS (EIP-7594). Without supernode mode, Lighthouse only stores 4 out of 128 data columns and cannot reconstruct full blobs.

See the [Troubleshooting Guide](/docs/guides/troubleshooting) for detailed diagnostics.

## Upgrades

### Upgrading Client Versions

To upgrade to newer client versions:

1. Update `CLIENT_CONFIG` in `.env` to new configuration file
2. Create new docker-compose file with updated versions
3. Redeploy: `npx cdk deploy --json --outputs-file deploy-output.json`

Note: The instance will be replaced with the new configuration.

### Rolling Updates (HA Only)

HA deployments perform rolling updates automatically, ensuring no RPC downtime during client upgrades. See the [Deployment Guide](/docs/guides/deployment-guide) for details.

## Cost Optimization

### Storage Optimization

- Use gp3 instead of io2 for most workloads (3x cheaper)
- Right-size storage based on network (mainnet needs 3+ TB)
- Consider Instance Store for temporary high-performance needs

### Compute Optimization

- Use ARM-based instances (r7g) for 20% cost savings vs x86
- Use Savings Plans for 30-50% discount on long-term deployments
- Scale down testnet nodes to smaller instance types

### Network Optimization

- Limit peer connections to reduce outbound traffic
- Use VPC endpoints for AWS service communication
- Consider traffic shaping for high-traffic RPC nodes

See the [Deployment Guide](/docs/guides/deployment-guide) for detailed cost optimization strategies.

## Security Considerations

- RPC endpoints bind to internal IP only (not 0.0.0.0)
- P2P ports allow external connectivity for network participation
- Access control via Security Groups
- No SSH access - use AWS Systems Manager Session Manager
- Encrypted EBS volumes
- IAM roles with least privilege

## FAQ

**Q: Which client combination should I choose?**

A: For most users, Geth + Lighthouse is recommended as it's the most tested and widely used. For faster sync, try Reth + Lighthouse. For lower storage, use Erigon + Lighthouse.

**Q: How long does initial sync take?**

A: With checkpoint sync: 6-24 hours. Without checkpoint sync: 2-7 days depending on client and network conditions.

**Q: Can I switch client combinations?**

A: Yes, but you'll need to resync from scratch. Update CLIENT_CONFIG and redeploy. You can deploy multiple clients in paralell on their own nodes.

**Q: Do I need to run both execution and consensus clients?**

A: Yes, Ethereum requires both clients after The Merge. They communicate via the Engine API.

**Q: Can I use this for validator nodes?**

A: This configuration is optimized for RPC nodes. Validator nodes have different requirements and are not covered by this implementation.

## Additional Resources

### Client Release Channels

| Client | Type | Repo | Query method | Version line | Prereleases |
|--------|------|------|--------------|--------------|-------------|
| Geth | EL | [ethereum/go-ethereum](https://github.com/ethereum/go-ethereum/releases) | releases/latest | * | stable only |
| Reth | EL | [paradigmxyz/reth](https://github.com/paradigmxyz/reth/releases) | releases/latest | * | stable only |
| Erigon | EL+CL | [erigontech/erigon](https://github.com/erigontech/erigon/releases) | releases/latest | * | stable only |
| Besu | EL | [hyperledger/besu](https://github.com/hyperledger/besu/releases) | tags (semver) | * | exclude `*-RC*` |
| Nethermind | EL | [NethermindEth/nethermind](https://github.com/NethermindEth/nethermind/releases) | releases/latest | * | stable only |
| Lighthouse | CL | [sigp/lighthouse](https://github.com/sigp/lighthouse/releases) | releases/latest | * | stable only |
| Prysm | CL | [OffchainLabs/prysm](https://github.com/OffchainLabs/prysm/releases) | releases/latest | * | stable only |
| Teku | CL | [Consensys/teku](https://github.com/Consensys/teku/releases) | releases/latest | * | stable only |

> Column legend — **Repo**: canonical `owner/repo` (link goes to the releases page). **Query method**: `releases/latest` = newest non-prerelease via GitHub API (`https://api.github.com/repos/{repo}/releases/latest`); `tags` = list `/tags` and pick the highest matching semver; `releases` = list `/releases` and pick the newest matching the prerelease policy; `pinned-file` = read the named file at the given ref. **Version line**: constrains updates to a release line (`*` = any). **Prereleases**: whether beta/RC tags are eligible.
>
> Notes: `Besu` does not return a usable `releases/latest` (its newest GitHub release object is not a stable release), so resolve it from semver `tags` and skip `*-RC*` and non-semver tags (`develop`, `dev`, `canary`). `Prysm` is queried from `OffchainLabs/prysm` (the repo `prysmaticlabs/prysm` now redirects there).

- [Ethereum Documentation](https://ethereum.org/en/developers/docs/)
- [Client Diversity](https://clientdiversity.org/)
- [Checkpoint Sync Endpoints](https://eth-clients.github.io/checkpoint-sync-endpoints/)
- [Ethereum Node Requirements](https://ethereum.org/en/developers/docs/nodes-and-clients/run-a-node/)

## Support

For issues and questions:
- Check [Troubleshooting Guide](/docs/guides/troubleshooting)
- Review [Configuration Reference](/docs/guides/configuration-reference)
- Open a GitHub issue
