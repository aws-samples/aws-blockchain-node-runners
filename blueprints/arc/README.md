# Sample AWS Blockchain Node Runner app for Arc

| Contributed by |
|:--------------------:|
| [@karimakacem](https://github.com/karimakacem) |

[Arc](https://docs.arc.io) is Circle's EVM-compatible Layer 1 with USDC as the
native gas token and deterministic sub-second finality. This blueprint deploys
an Arc full (pruned) node on AWS, on either **mainnet** (chain ID `5042`) or
**testnet** (chain ID `5042002`).

An Arc node runs two processes from the same Arc release:

- **arc-execution**: the Execution Layer (EL), based on Reth. It executes
  transactions, keeps state and serves JSON-RPC.
- **arc-consensus**: the Consensus Layer (CL), based on Malachite. In follow
  mode it fetches finalized blocks from Circle-run relay endpoints, verifies
  their signatures and drives the EL over local IPC sockets.

The node does not join a P2P network and needs no L1 or external RPC
credentials. It does not validate or produce blocks.

## Overview of Deployment Architectures

### Single Node

One EC2 instance runs both containers (host networking) with an EBS `gp3`
data volume at `/data`. JSON-RPC and WebSocket bind to the instance's internal
IP; metrics and the CL RPC bind to `127.0.0.1`. Good for development and
testing.

### Highly Available (HA) Nodes

Multiple nodes run behind an internal Application Load Balancer in an Auto
Scaling Group. The ALB health-checks each node's RPC port and routes only to
healthy nodes. Suitable for production RPC serving.

## Supported Configurations

| Option | Value |
|---|---|
| Clients | `arc-execution` + `arc-consensus` `0.8.1` (`docker.cloudsmith.io/circle/arc-network/*`) |
| Networks | `mainnet` (5042), `testnet` (5042002) |
| Deployment modes | `single-node`, `ha-nodes` |
| Default configuration | `arc-execution-0.8.1-arc-consensus-0.8.1-full.yml` |

## Infrastructure Requirements

| Resource | Recommendation |
|---|---|
| Instance (x86_64) | `r7i.2xlarge` (8 vCPU, 64 GB). Arc requires 64 GB+ RAM and favours clock speed over core count |
| Instance (ARM_64) | `r7g.2xlarge` (the Arc images are multi-arch) |
| Storage | `gp3`, 1000 GiB (Arc's documented minimum is a 1 TB SSD) |
| Network | Outbound HTTPS/WSS to the Arc relay endpoints and `snapshots.arc.network` |
| Ports | 8545 (RPC), 8546 (WS): VPC-internal only. No inbound P2P ports |

> **Tip:** run the deployment commands from AWS CloudShell, which already has
> AWS credentials and the required tooling.

## Setup Instructions

> For general setup (clone, install, bootstrap), follow the main repository
> [README](../../README.md).

### Step 1: Configure Environment

```bash
cp blueprints/arc/samples/.env-testnet-arc-execution-arc-consensus-full .env
# Edit AWS_ACCOUNT_ID and AWS_REGION
```

### Step 2: Choose Configuration

| Sample | Network | Mode |
|---|---|---|
| `.env-testnet-arc-execution-arc-consensus-full` | testnet | single-node |
| `.env-mainnet-arc-execution-arc-consensus-full` | mainnet | single-node |
| `.env-mainnet-arc-execution-arc-consensus-full-ha` | mainnet | ha-nodes |

### Step 3: Deploy

```bash
npx cdk deploy --json --outputs-file deploy-output.json
```

> **AI Alternative:** you can also deploy with the `@deploy` AI prompt, which
> reads your `.env` and runs the deployment workflow for you.

### Step 4: Monitor Deployment

The first start of the `node` service restores the snapshot (see below)
before the containers come up, so expect it to sit in `activating` for a
while.

```bash
export INSTANCE_ID=$(jq -r '..|.InstanceId? | select(. != null)' deploy-output.json)
aws ssm start-session --target "$INSTANCE_ID" --region "$AWS_REGION"
sudo systemctl status node
sudo journalctl -u node -f                       # snapshot restore + compose
sudo docker logs -f execution                    # EL
sudo docker logs -f consensus                    # CL
```

### Step 5: Verify Node Operation

```bash
# From the instance (RPC binds to the internal IP):
IP=$(hostname -I | awk '{print $1}')
curl -s -X POST -H "Content-Type: application/json" \
  --data '{"jsonrpc":"2.0","method":"eth_blockNumber","params":[],"id":1}' \
  "http://$IP:8545"
# Repeat a few seconds apart: the block number should increase, and match
# https://rpc.mainnet.arc.io (or rpc.testnet.arc.io) once caught up.
```

## Configuration Options

All are optional; defaults come from Arc's
[node requirements](https://docs.arc.io/arc/references/node-requirements).

| Variable | Description | Default |
|---|---|---|
| `BC_NETWORK` | `mainnet` or `testnet` | — |
| `ARC_FOLLOW_ENDPOINTS` | Space-separated relay endpoints, each `https://host,wss=host` | Circle's public relays for the network |
| `ARC_RPC_FORWARDER` | Where submitted transactions are forwarded for broadcast | `https://rpc.<network>.arc.io/` |
| `ARC_RPC_PORT` | JSON-RPC port | `8545` |
| `ARC_WS_PORT` | WebSocket port | `8546` |

The EL exposes `eth,net,web3,rpc` with `--public-api`, which hides
pending-transaction RPCs. Change the namespaces in the configuration file if
you need `txpool`, `debug` or `trace` on a private node.

## Snapshots

Arc cannot sync from genesis. Circle publishes a matched EL + CL snapshot pair
for each network about every four hours at
[snapshots.arc.network](https://snapshots.arc.network). On the first start,
`user-data/common/prepare-arc.sh` runs `arc-snapshots download
--el-profile=full` from the execution image, which picks the newest complete
pair, downloads it and extracts it into `/data/arc`. It then writes
`/data/.arc-snapshot-restored` and never downloads again on that volume.

Upstream's Docker Compose file re-runs the download on every start, which
re-downloads the whole execution layer whenever a newer snapshot has been
published. The sentinel avoids that. To force a fresh restore, stop the node
and remove the sentinel.

A failed download is retried twice with `--force`, which rebuilds both layers
from scratch.

`SNAPSHOT_ENABLED` (the framework's own S3 snapshot restore) stays `"false"`.

## Troubleshooting

- **`node` stuck in `activating`:** the snapshot restore is still running.
  Follow `sudo journalctl -u node -f`.
- **Snapshot restore failed:** `sudo journalctl -u node -n 200`. Check outbound
  access to `snapshots.arc.network` and free space on `/data`, then
  `sudo systemctl restart node` (the retry uses `--force`).
- **Block number stays at `0x0`:** check `sudo docker logs consensus` for relay
  connection errors, and that the IPC sockets exist in `/data/arc/run`.
- **High EL memory during catch-up:** lower
  `--execution-persistence-backpressure-threshold` in the configuration file.
- **Health check failures (HA):** the ALB checks RPC port 8545. A node still
  restoring its snapshot is unhealthy until the EL starts.

See the main [Troubleshooting Guide](../../docs/troubleshooting.md) for more.

## Upgrades

Arc releases can include hard-fork activations with a deadline, after which
older versions stop following the chain. Watch the
[arc-node releases](https://github.com/circlefin/arc-node/releases) and the
[run-a-node guide](https://docs.arc.io/arc/tutorials/run-an-arc-node).

- **Upgrade the clients:** bump both image tags in the configuration file
  (rename it to the new version) via the `@version-update` workflow, then
  redeploy. EL and CL must always run the same release.
- **Breaking storage changes:** read the release's `BREAKING_CHANGES.md`. When
  a release needs a data migration, the simplest path is a fresh volume, which
  restores the newest snapshot.
- **Rolling updates (HA):** replace instances one at a time through the Auto
  Scaling Group so RPC capacity is preserved.

## Cost Optimization

- **Compute:** the ARM_64 option (`r7g.2xlarge`) is cheaper than `r7i`.
- **Storage:** mainnet's snapshot is small today (~35 GB); if you only run
  mainnet you can start below 1000 GiB and grow the volume as the chain does.
- **Network:** keep the ALB internal unless you must expose RPC publicly.

## Security Considerations

- RPC and WS bind to the instance's internal IP (never `0.0.0.0`); metrics and
  the CL RPC bind to `127.0.0.1`.
- Both containers run as the non-root `bcuser` (UID 1002) with
  `no-new-privileges`, as does the systemd service. The images' built-in
  `arc` user (UID 999) is not used because UID 999 belongs to the CloudWatch
  agent's `cwagent` user on Ubuntu hosts.
- The CL private key in `/data/arc/consensus` is only the node's network
  identity, not a validator key. It is generated once and never overwritten.
- The default ALB is internal and restricted to the VPC CIDR; exposing it to
  the internet requires setting `HA_ALB_INTERNET_FACING` **and**
  `HA_ALB_ALLOWED_CIDR`.
- Image tags are pinned; `node.sh` refuses `latest` or untagged images.

## FAQ

**Can I run a validator?** No. This blueprint runs a follow-mode full node.

**Does the node need an API key?** No. The relay endpoints and the snapshot
service are public.

**Why no P2P ports?** The CL follows Circle's relay endpoints and the EL runs
with `--disable-discovery`, as Arc's docs require.

## Additional Resources

- [Run an Arc node](https://docs.arc.io/arc/tutorials/run-an-arc-node)
- [Node requirements](https://docs.arc.io/arc/references/node-requirements)
- [arc-node on GitHub](https://github.com/circlefin/arc-node)

## Support

Open an issue in the [aws-blockchain-node-runners](https://github.com/aws-samples/aws-blockchain-node-runners) repository.
