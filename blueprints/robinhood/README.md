# Sample AWS Blockchain Node Runner app for Robinhood Chain

| Contributed by |
|:--------------------:|
| [@karimakacem](https://github.com/karimakacem) |

Robinhood Chain is an [Arbitrum](https://arbitrum.io/) chain (Orbit L2) running
[Arbitrum Nitro](https://github.com/OffchainLabs/nitro). This blueprint deploys
a Robinhood Chain full node on AWS, on either **mainnet** (chain ID `4663`,
settling to Ethereum mainnet) or **testnet** (chain ID `46630`, settling to
Ethereum Sepolia).

> This blueprint deploys an RPC full node. It does **not** configure a validator
> (Robinhood Chain validators use BoLD and a permissioned allowlist).

## Overview of Deployment Architectures

### Single Node

A single EC2 instance runs the `offchainlabs/nitro-node` container (host
networking) with an EBS `gp3` data volume mounted at `/data`. RPC/WS/metrics
bind to the instance's internal IP; the node reaches its parent chain through
the L1 execution + beacon endpoints you provide. Good for development and
testing.

### Highly Available (HA) Nodes

Multiple nodes run behind an internal Application Load Balancer in an Auto
Scaling Group. The ALB health-checks each node's RPC port and routes only to
healthy, synced nodes. Suitable for production RPC serving.

## Supported Configurations

| Option | Value |
|---|---|
| Client | Arbitrum Nitro (`offchainlabs/nitro-node:v3.11.5-7d41882`) |
| Networks | `mainnet` (4663), `testnet` (46630) |
| Deployment modes | `single-node`, `ha-nodes` |
| Default configuration | `nitro-v3.11.5-full.yml` |

## Infrastructure Requirements

| Resource | Recommendation |
|---|---|
| Instance (x86_64) | `m6i.2xlarge` (8 vCPU, 32 GB) — step up to `m6i.4xlarge` for heavier mainnet load (Robinhood docs recommend 64 GB+ RAM for mainnet) |
| Instance (ARM_64) | `m7g.2xlarge` |
| Storage | `gp3`; testnet 1000 GiB, mainnet 2200 GiB (snapshot restore needs ~2x the snapshot size) |
| Ports | 8547 (RPC), 8548 (WS), 6070 (metrics) — all VPC-internal |

### Prerequisites

- An Ethereum L1 **execution RPC** endpoint and an L1 **beacon** endpoint for
  the matching network (Ethereum mainnet for `mainnet`, Sepolia for `testnet`).
  Public endpoints are rate-limited; use a paid provider for production.
- The L1 execution RPC must serve `eth_getLogs` for blocks back to the
  snapshot's date: after a restore, Nitro replays the inbox from there.
  publicnode's free RPCs refuse older ranges, so the samples default to
  Tenderly's keyless public gateway.
- **Testnet only:** the node starts a local *blob proxy* in front of the
  Sepolia beacon. It asks the beacon first and falls back to Blockscout, which
  keeps some, but not all, pruned blob data. Mainnet talks to its
  Ethereum-mainnet beacon directly and runs no proxy.

> **Tip:** run the deployment commands from AWS CloudShell, which already has
> AWS credentials and the required tooling.

## Setup Instructions

> For general setup (clone, install, bootstrap), follow the main repository
> [README](../../README.md).

### Step 1: Configure Environment

```bash
cp blueprints/robinhood/samples/.env-testnet-nitro-full .env
# Edit AWS_ACCOUNT_ID, AWS_REGION, and the ROBINHOOD_L1_* endpoints
```

### Step 2: Choose Configuration

| Sample | Network | Mode |
|---|---|---|
| `.env-testnet-nitro-full` | testnet | single-node |
| `.env-mainnet-nitro-full` | mainnet | single-node |
| `.env-mainnet-nitro-full-ha` | mainnet | ha-nodes |

### Step 3: Deploy

```bash
npx cdk deploy --json --outputs-file deploy-output.json
```

> **AI Alternative:** you can also deploy with the `@deploy` AI prompt, which
> reads your `.env` and runs the deployment workflow for you.

### Step 4: Monitor Deployment

```bash
export INSTANCE_ID=$(jq -r '..|.InstanceId? | select(. != null)' deploy-output.json)
aws ssm start-session --target "$INSTANCE_ID" --region "$AWS_REGION"
sudo systemctl status node
sudo journalctl -u node -f
```

### Step 5: Verify Node Operation

```bash
# From the instance (RPC binds to the internal IP):
IP=$(curl -s http://169.254.169.254/latest/meta-data/local-ipv4)
curl -s -X POST -H "Content-Type: application/json" \
  --data '{"jsonrpc":"2.0","method":"eth_syncing","params":[],"id":1}' \
  "http://$IP:8547"
# A fully synced node returns {"result":false}.
```

## Configuration Options

| Variable | Description | Default |
|---|---|---|
| `BC_NETWORK` | `mainnet` or `testnet` | — |
| `ROBINHOOD_L1_RPC_URL` | Ethereum L1 execution RPC (required) | — |
| `ROBINHOOD_L1_BEACON_URL` | Ethereum L1 beacon API (required) | — |
| `ROBINHOOD_RPC_PORT` | JSON-RPC port | `8547` |
| `ROBINHOOD_WS_PORT` | WebSocket port | `8548` |
| `ROBINHOOD_METRICS_PORT` | Metrics port | `6070` |

On `mainnet` the node subscribes to both the primary feed and the delayed
backup feed (`wss://feed.mainnet…` + `wss://delayed-feed.mainnet…`) for
resilience; on `testnet` it uses the single testnet feed.

## Database Snapshots

Offchain Labs publishes pruned Nitro database snapshots for both networks. A
fresh node restores from one on first start instead of syncing from genesis,
which also avoids the need for an archive-grade L1 endpoint. Find the latest at
[snapshot-explorer.arbitrum.io](https://snapshot-explorer.arbitrum.io/?chain=Robinhood+Chain)
(mainnet) or
[Robinhood Chain Sepolia](https://snapshot-explorer.arbitrum.io/?chain=Robinhood+Chain+Sepolia)
(testnet), and set `ROBINHOOD_SNAPSHOT_URL` in your `.env`.

- **Use the snapshot directory URL with a trailing slash**, for example
  `https://robinhood-snapshots.offchainlabs.com/robinhood%20chain/2026-10-09-3d32b936/`.
  Nitro reads the directory's `.manifest.txt`, downloads every part, verifies
  each checksum, then joins and extracts them
  ([Nitro database snapshots](https://docs.arbitrum.io/run-arbitrum-node/nitro/nitro-database-snapshots)).
  Do not point it at a `pruned.tar.partNNNN` file: mainnet snapshots are split
  into ~500 GB parts, and a single part passes its own checksum but fails
  extraction with `unexpected EOF`. `node.sh` rewrites a part URL to its
  directory for you.
- **Size the data volume for ~2x the snapshot.** The restore holds the parts
  and the joined archive at the same time. The 2026-10-09 mainnet snapshot is
  925 GiB, so the mainnet samples use `DATA_VOL_1_SIZE="2200"`; testnet
  snapshots are ~250 GiB and fit the default 1000 GiB.

`SNAPSHOT_ENABLED` (the framework's own S3 snapshot restore) stays `"false"`
for this blueprint.

## Troubleshooting

Primary diagnostics are in CloudWatch Logs and `journalctl`.

- **Node not starting:** `sudo journalctl -u node -n 200`. Check the L1
  endpoints are reachable and not placeholders.
- **Testnet blob errors / stuck sync:** check the proxy —
  `sudo journalctl -u blob-proxy -n 100`.
- **Metrics not appearing:** confirm the node is up and `ROBINHOOD_METRICS_PORT`
  (6070) is being scraped.
- **Health check failures (HA):** the ALB checks RPC port 8547 and accepts
  `200,400` (Nitro answers a plain `GET /` with 400). The port only opens once
  the snapshot is restored, and a mainnet restore takes far longer than the
  health-check grace period (`HA_ALB_HEALTHCHECK_GRACE_PERIOD_MIN`, at most 300
  minutes; a restore took about 10 hours in testing). Suspend replacement
  right after deploy so the ASG does not replace nodes that are still
  restoring, then resume it once they serve:

  ```bash
  aws autoscaling suspend-processes --auto-scaling-group-name <asg> --scaling-processes ReplaceUnhealthy
  # ...after every node answers on 8547 and the ALB shows every target healthy.
  # A node the ASG marked Unhealthy during the restore keeps that flag even
  # after it starts serving; clear it first, or resuming terminates it:
  aws autoscaling set-instance-health --instance-id <id> --health-status Healthy
  aws autoscaling resume-processes --auto-scaling-group-name <asg> --scaling-processes ReplaceUnhealthy
  ```

See the main [Troubleshooting Guide](../../docs/troubleshooting.md) for more.

## Upgrades

- **Upgrade the Nitro client:** bump `nitro_image` in
  `configurations/nitro-v3.11.5-full.yml` (rename the file to the new version)
  via the `@version-update` workflow, then redeploy.
- **Rolling updates (HA):** replace instances one at a time through the Auto
  Scaling Group so RPC capacity is preserved.

## Cost Optimization

- **Storage:** testnet fits in 1000 GiB `gp3`. Mainnet needs 2200 GiB for
  the snapshot restore; after the restore the database is about 900 GiB, so
  the extra space is headroom for growth rather than waste.
- **Compute:** use the ARM_64 option (`m7g.2xlarge`) for a lower price/perf
  point; right-size after observing real load.
- **Network:** keep the ALB internal unless you must expose RPC publicly.

## Security Considerations

- RPC, WS, and metrics bind to the instance's internal IP (never `0.0.0.0`); the
  blob proxy binds to `127.0.0.1`.
- The node runs as the non-root `bcuser` (UID/GID 1002).
- The default ALB is internal and restricted to the VPC CIDR; exposing it to the
  internet requires explicitly setting `HA_ALB_INTERNET_FACING` **and**
  `HA_ALB_ALLOWED_CIDR`.
- The Nitro image is pinned to an immutable tag; `node.sh` refuses `latest`.

## FAQ

**Can I run a validator?** No — this blueprint deploys an RPC full node.
Robinhood Chain validators use BoLD and a permissioned allowlist.

**Do I need an archive beacon node for testnet?** Not if the snapshot is
recent. Beacons keep blobs for about 18 days, and the node only needs blobs
from the snapshot's date onward. For older blobs the proxy falls back to
Blockscout, which does not have every blob's data.

**Does mainnet need the blob proxy?** No. It is testnet-only and `node.sh`
starts it only when `BC_NETWORK=testnet`.

## Additional Resources

- [Robinhood Chain — Run a full node](https://docs.robinhood.com/chain/run-a-full-node)
- [Robinhood Chain docs](https://docs.robinhood.com/chain)
- [Arbitrum Nitro](https://github.com/OffchainLabs/nitro)

## Support

Open an issue in the [aws-blockchain-node-runners](https://github.com/aws-samples/aws-blockchain-node-runners) repository.
