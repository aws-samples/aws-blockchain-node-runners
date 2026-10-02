# Bitcoin Core Node Runner

This protocol implementation provides support for running Bitcoin Core nodes on AWS using the Universal Blockchain Node Runner. Bitcoin Core is the reference implementation of the Bitcoin protocol, providing a full node with RPC access for querying blockchain data, managing wallets, and broadcasting transactions.

## Overview of Deployment Architectures

### Single Node Deployment

```
+-------------------------------------------------------------+
|                         VPC (Default)                        |
|  +----------------------------------------------------------+
|  |                    Public Subnet                          |
|  |  +------------------------------------------------------+ |
|  |  |           EC2 Instance (Bitcoin Node)                 | |
|  |  |  +--------------------------------------------------+ | |
|  |  |  |            Bitcoin Core (bitcoind)                | | |
|  |  |  |   RPC: Port 8332 | P2P: Port 8333               | | |
|  |  |  +--------------------------------------------------+ | |
|  |  |  +--------------------------------------------------+ | |
|  |  |  |    EBS Volume (/data) - 1.5 TB gp3               | | |
|  |  |  +--------------------------------------------------+ | |
|  |  +------------------------------------------------------+ |
|  +----------------------------------------------------------+
|                                                               |
|  +----------------------------------------------------------+
|  |  AWS Secrets Manager                                      |
|  |  +- bitcoin_rpc_credentials (username:password)           |
|  +----------------------------------------------------------+
+-------------------------------------------------------------+
```

### High Availability (HA) Deployment

```
+-------------------------------------------------------------+
|                         VPC (Default)                        |
|  +----------------------------------------------------------+
|  |           Application Load Balancer (Port 8332)           |
|  +----------------------------------------------------------+
|                              |                                |
|  +---------------------------+----------------------------+   |
|  |                Auto Scaling Group                       |   |
|  |  +--------------+  +--------------+  +--------------+   |   |
|  |  |   Node 1     |  |   Node 2     |  |   Node N     |   |   |
|  |  |  bitcoind    |  |  bitcoind    |  |  bitcoind    |   |   |
|  |  +--------------+  +--------------+  +--------------+   |   |
|  +---------------------------------------------------------+   |
+-------------------------------------------------------------+
```

Note: HA nodes do not share state (wallet, mempool). The ALB uses session stickiness to route requests from the same client to the same node.

## Supported Configurations

| Configuration | Client | Sync Mode | Best For |
|--------------|--------|-----------|----------|
| bitcoin-core-&lt;version&gt;-full.yml | Bitcoin Core | Full (txindex) | General purpose RPC, wallet, explorer backends |

> **Note:** Configuration file names include the pinned client version (shown as `<version>` above). For the exact current filename, run `ls node_modules/aws-bnr-blueprint-bitcoin/configurations/`, or simply copy the matching sample from `samples/` — it already sets `CLIENT_CONFIG` for you.

## Infrastructure Requirements

### Recommended Instance Types

| Network | Deployment | Instance Type | vCPUs | Memory | Storage |
|---------|-----------|---------------|-------|--------|---------|
| Mainnet | Single Node | r8g.2xlarge (ARM) | 8 | 64 GB | 1.5 TB gp3 |
| Mainnet | HA (2 nodes) | r8g.2xlarge (ARM) | 8 each | 64 GB each | 1.5 TB gp3 each |
| Testnet | Single Node | r8g.xlarge (ARM) | 4 | 32 GB | 200 GB gp3 |

The samples use Graviton (`CPU_TYPE="ARM_64"`). Blueprint `node.sh` detects the architecture and installs the matching official Bitcoin Core build, so switching between ARM and x86 only changes `INSTANCE_TYPE` and `CPU_TYPE` in `.env`.

#### Choosing an instance type

These results come from side-by-side mainnet tests in 2026-09/10:
- Bitcoin Core v31.1, `txindex=1`, 1.5 TB gp3 at 6,000 IOPS, us-east-1 on-demand pricing.
- Sync time is from block 400,000 to tip. Ranges are two separate syncs; r7g was synced once.
- Single-client RPC is one sequential client on the node.
- "Under load" is the peak throughput from a separate load-generator instance with 1–64 concurrent clients; see [Under concurrent load](#under-concurrent-load).

| | **r8g.2xlarge** (primary) | **r7g.2xlarge** (secondary) | **r7i.2xlarge** (x86) |
|---|---|---|---|
| Processor | Graviton4, 8 cores | Graviton3, 8 cores | Sapphire Rapids, 4 cores / 8 threads |
| Hourly price vs r7i | -11% | -19% | — |
| Initial sync time | **7.8–8.5 h** | 8.5 h | 8.9–9.1 h |
| Initial sync compute cost | $3.68–3.99 | **$3.62** | $4.68–4.80 |
| Full-block RPC (`getblock` verbosity 2), single client | **7.7/s** | 6.3/s | 7.4/s |
| Full-block RPC, under load | **81/s** | not tested | 50/s |
| Transaction lookup (`getrawtransaction` verbose), single client | **2,806/s** | 1,812/s | 1,003/s (2,261/s with C6 disabled) |
| Transaction lookup, under load | **25,000/s** | not tested | 17,000/s |

- **r8g.2xlarge (primary):** the best choice for most nodes.
  - Fastest initial sync and catch-up after downtime: 4–14% faster than r7i across two syncs, and about 30% faster on the multithreaded final stretch.
  - Fastest RPC in every test. Under concurrent load it served 1.5–1.7× r7i's throughput, because it has 8 physical cores where r7i.2xlarge has 4 cores with hyperthreading.
  - 11% cheaper per hour than r7i.
- **r7g.2xlarge (secondary):** the best choice where r8g isn't available in your region or Availability Zone, or when the lowest hourly price matters most.
  - It handles every workload tested, including heavy full-block serving.
  - Versus r7i: r7g syncs faster, costs 19% less per hour and has the lowest total sync cost.
  - r7i is better at two things:
    - about 16% faster on full-block RPC (`getblock` verbosity 2)
    - faster on light RPC once r7i's C-states are tuned (see below)
- **r7i.2xlarge (x86):** choose this when you need x86 on the host, such as x86-only sidecars or tooling, or an x86 fleet standard.
  - Among the three, it's second only to r8g on full-block RPC, and it's the slowest and most expensive at initial sync.
  - With default settings, small RPC requests are slower on r7i because the vCPUs enter the deep C6 idle state (190 µs exit latency) between requests.
  - For latency-sensitive light RPC on r7i, consider limiting C-states, for example the kernel boot parameter `intel_idle.max_cstate=1`. This trades Turbo Boost headroom for lower wakeup latency; see [Processor state control](https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/processor_state_control.html).
  - Graviton instances don't expose C-states to the OS, so they don't have this issue.

Initial sync spends most of its time on one CPU thread (block validation below the `assumevalid` height), so single-core performance matters more than vCPU count. The final stretch above `assumevalid` verifies signatures on multiple threads, where physical core count helps.

#### Under concurrent load

The concurrency test used:
- a separate load-generator instance in the same Availability Zone
- 1–64 concurrent clients, 45 s per level
- the default Bitcoin Core RPC settings (16 RPC threads)

Peak throughput:

| Workload | r8g.2xlarge | r7i.2xlarge | r8g.xlarge | r7i.xlarge |
|---|---|---|---|---|
| Full blocks (`getblock` verbosity 2) | **81/s** | 50/s | 41/s | 25/s |
| Transaction lookups (`getrawtransaction` verbose) | **25,000/s** | 17,000/s | 15,300/s | 9,800/s |
| Mixed, 90% lookups / 10% full blocks | **812/s** | 490/s | 400/s | 252/s |
| Full-block p99 latency at 16 clients | **363 ms** | 625 ms | 793 ms | 1,193 ms |

- **Full-block and mixed workloads are CPU-bound.** Throughput levels off once the number of clients reaches about the number of physical cores, and the host is then at 100% CPU. Beyond that, extra clients only add latency.
  - r8g.2xlarge peaks at about 16 clients, and r7i.2xlarge at about 8.
  - Each xlarge reaches half its 2xlarge's throughput, at half the price.
- **Transaction lookups level off below full CPU.** r8g.2xlarge peaked at 74% CPU, which points to a limit inside Bitcoin Core rather than the instance.
  - Going from xlarge to 2xlarge gives 1.6–1.7× the throughput here, not 2×.
- **Network can limit sustained full-block serving.** Full decoded blocks are large (about 8.5 MB of JSON each on average). At peak, r8g.2xlarge sent about 680 MB/s, above its 3.75 Gbit/s (about 470 MB/s) baseline network bandwidth. Short bursts are covered by burst bandwidth.
  - For sustained full-block serving to remote clients, size for the baseline: roughly 55 full blocks/s on r8g.2xlarge, and about 28/s on r8g.xlarge (1.875 Gbit/s baseline).

#### After initial sync

A synced node can run on a smaller instance.
- **Tested:** `r8g.xlarge` (4 vCPU, 32 GB) kept up with the chain tip. On the single-client RPC benchmark it performed the same as `r8g.2xlarge` (`getblock` verbosity 2: 7.7/s; transaction lookups: 2,799/s) at half the hourly price.
- **Memory:** bitcoind used about 6.4 GB of the 32 GB.
- **Keep the 2xlarge for initial sync.** The xlarge's EBS baseline throughput (156 MB/s) is below the gp3 volume's 400 MB/s, and it has half the cores for signature checks. Also keep it for catching up after long downtime.
- **Under load,** `r8g.xlarge` peaked at about 41 full blocks/s and about 15,300 transaction lookups/s, roughly half the 2xlarge's full-block throughput (see [Under concurrent load](#under-concurrent-load)).
  - Stay on the xlarge if your peak load fits within that.
  - Choose the 2xlarge if you regularly run more than about 4 concurrent full-block clients or need lower tail latency.

To resize a single-node deployment within the same architecture, change `INSTANCE_TYPE` in `.env` (for example `r8g.2xlarge` → `r8g.xlarge`) and redeploy:

```bash
npx cdk deploy --json --outputs-file deploy-output-bitcoin-mainnet.json
```

- CloudFormation stops and starts the same instance with the new type. It isn't replaced, the data volume stays attached, and the node resumes from its chain data with no re-sync.
- In testing, the node was offline for about a minute and back at the chain tip right after restart.
- Resize through `cdk deploy` rather than changing the instance type in the EC2 console, so the stack and `.env` stay in sync.

> **Note:** Don't change `CPU_TYPE` on an existing single-node stack with `cdk deploy`. The new architecture needs a new AMI, so CloudFormation replaces the instance. The replacement then fails because the data volume is still attached to the old instance, and the stack rolls back with the node unchanged. To move a node to a different architecture (for example x86 to Graviton), deploy a new stack and let it sync.

### Storage Requirements

| Network | Current Size | Growth Rate | Recommended | Type | IOPS |
|---------|-------------|-------------|-------------|------|------|
| Mainnet | ~970 GB (blocks 880 GB, txindex 74 GB, chainstate 14 GB; block 969,306) | ~100 GB/year | 1.5 TB | gp3 | 6,000 |
| Testnet | ~50 GB | ~10 GB/year | 200 GB | gp3 | 3,000 |

> Running multiple protocols? Each deployment creates an independent CloudFormation stack. Total costs are additive — use the tables above per protocol.

## Setup Instructions

There are two ways to deploy a Bitcoin node.

### Option 1: AI-Driven Deployment (Recommended)

Deploy with a single prompt. In Kiro (or your AI assistant of choice), run:

```
@deploy a Bitcoin mainnet RPC node in us-east-1
```

The AI assistant will guide you through infrastructure selection, configuration, deployment, and initial healthcheck. For full setup, see [Getting Started](/docs/getting-started/quickstart).

### Option 2: Manual Deployment

This section focuses on Bitcoin-specific configuration.

#### Step 1: Configure Environment

```bash
cp node_modules/aws-bnr-blueprint-bitcoin/samples/.env-mainnet-bitcoin-core-full .env
```

Edit `.env` with your details:

```bash
AWS_ACCOUNT_ID="your-account-id"
AWS_REGION="us-east-1"
```

#### Step 2: Deploy

> CDK bootstrap is a one-time setup step — see [Getting Started](/docs/getting-started/quickstart).

```bash
npx cdk deploy --json --outputs-file deploy-output-bitcoin-mainnet.json
```

For advanced options (HA mode, multiple stacks, maintenance), see the [Deployment Guide](/docs/guides/deployment-guide).

#### Step 3: Monitor Synchronization

Initial Block Download (IBD) from genesis took about 8–10 hours on the recommended 8-vCPU instances with 6,000 IOPS gp3 (measured with Bitcoin Core v31.1; `r8g.2xlarge` was fastest). Smaller instances, lower IOPS, or poor peers take longer.

```bash
DASHBOARD=$(cat deploy-output-bitcoin-mainnet.json | jq -r '..|.DashboardName? | select(. != null)')
echo "Dashboard: https://console.aws.amazon.com/cloudwatch/home#dashboards:name=$DASHBOARD"
```

Key metrics:
- **c1_block_height**: Current block number
- **c1_blocks_behind**: Headers minus blocks (target: 0)

#### Step 4: Verify Node Operation

```bash
INSTANCE_ID=$(cat deploy-output-bitcoin-mainnet.json | jq -r '..|.InstanceId? | select(. != null)')
aws ssm start-session --target $INSTANCE_ID --region $AWS_REGION
```

Once connected via SSM:

```bash
# Check service status
sudo systemctl status node

# Use bitcoin-cli (cookie auth, no credentials needed locally)
/home/bcuser/bin/bitcoin-cli -conf=/data/bitcoin.conf -datadir=/data getblockchaininfo
```

> **Note**: You can alternatively connect via the AWS Console: navigate to **EC2 > Instances**, select your Bitcoin node instance, click **Connect**, choose **Session Manager**, and click **Connect**.

## Accessing and Using bitcoin-cli

Bitcoin Core supports cookie-based authentication by default, so interacting with `bitcoin-cli` from the node itself does not require credentials.

### Connecting to the Node

From your terminal, connect via Systems Manager:

```bash
INSTANCE_ID=$(cat deploy-output-bitcoin-mainnet.json | jq -r '..|.InstanceId? | select(. != null)')
aws ssm start-session --target $INSTANCE_ID --region $AWS_REGION
```

### Executing RPC Calls

Once connected, query the node directly:

```bash
/home/bcuser/bin/bitcoin-cli -conf=/data/bitcoin.conf -datadir=/data getblockchaininfo
```

This returns current blockchain state including block height, difficulty, and sync progress.

### Other Useful Commands

```bash
# Get network info
/home/bcuser/bin/bitcoin-cli -conf=/data/bitcoin.conf -datadir=/data getnetworkinfo

# Get peer connections
/home/bcuser/bin/bitcoin-cli -conf=/data/bitcoin.conf -datadir=/data getpeerinfo

# Get mempool info
/home/bcuser/bin/bitcoin-cli -conf=/data/bitcoin.conf -datadir=/data getmempoolinfo
```

## RPC Authentication

Bitcoin Core uses `rpcauth` for secure remote RPC access. This blueprint automatically:

1. Generates a random username, password, and salt during node setup
2. Computes `HMAC-SHA256(key=salt, message=password)` to create the hash
3. Writes `rpcauth=username:salt$hash` to `bitcoin.conf`
4. Stores `username:password` in AWS Secrets Manager as `<stack-name>/bitcoin_rpc_credentials` (for example `bitcoin-mainnet-bitcoin-core-v-full/bitcoin_rpc_credentials`). In HA mode, all nodes share this secret.
5. Saves credentials locally to `/data/.rpc-credentials` as a fallback

The final `rpcauth` line in `bitcoin.conf` looks like this:

```
rpcauth=user_204ce958:a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4$7c6ec2dd90e792d60450b01a84cc8c2563a7fb1d0fbd73de49be818fde4b407
```

The `rpcauth` consists of a username, salt, and a hashed password, providing robust protection in the case that your `bitcoin.conf` is accessed by an unauthorized entity. The randomly generated username and password are securely stored in AWS Secrets Manager.

### Secure RPC Access with AWS Secrets Manager

For a client to securely interact with the Bitcoin Core RPC endpoint from within your VPC, retrieve credentials from AWS Secrets Manager.

#### Retrieving Credentials

From your CloudShell terminal:

```bash
STACK_NAME=$(jq -r 'keys[0]' deploy-output-bitcoin-mainnet.json)
export BTC_RPC_AUTH=$(aws secretsmanager get-secret-value \
    --secret-id "$STACK_NAME/bitcoin_rpc_credentials" \
    --query SecretString --output text --region $AWS_REGION)
echo "BTC_RPC_AUTH=$BTC_RPC_AUTH"
```

#### Single Node RPC Call Using Credentials

Retrieve the private IP of your Bitcoin node:

```bash
export BITCOIN_NODE_IP=$(cat deploy-output-bitcoin-mainnet.json | jq -r '..|.NodePrivateIp? // ..|.PrivateIp? | select(. != null)')
echo "BITCOIN_NODE_IP=$BITCOIN_NODE_IP"
```

Copy the `BITCOIN_NODE_IP` and `BTC_RPC_AUTH` values, then open a CloudShell tab with VPC environment to access the internal IP address space. Paste the variables into the new tab, then query the node:

```bash
curl --user "$BTC_RPC_AUTH" \
     --data-binary '{"jsonrpc":"1.0","id":"curltest","method":"getblockchaininfo","params":[]}' \
     -H 'content-type: text/plain;' \
     http://$BITCOIN_NODE_IP:8332/
```

#### HA RPC Call Using Credentials

Retrieve the load balancer DNS name:

```bash
export LOAD_BALANCER_DNS=$(cat deploy-output-bitcoin-mainnet.json | jq -r '..|.LoadBalancerDNS? | select(. != null)')
echo "LOAD_BALANCER_DNS=$LOAD_BALANCER_DNS"
```

Copy `LOAD_BALANCER_DNS` and `BTC_RPC_AUTH` into a CloudShell VPC environment tab, then execute:

```bash
curl --user "$BTC_RPC_AUTH" \
     --data-binary '{"jsonrpc":"1.0","id":"curltest","method":"getblockchaininfo","params":[]}' \
     -H 'content-type: text/plain;' \
     http://$LOAD_BALANCER_DNS:8332/
```

### Local Access (No Credentials Needed)

When connected via SSM, `bitcoin-cli` uses cookie-based auth automatically — no credentials required:

```bash
/home/bcuser/bin/bitcoin-cli -conf=/data/bitcoin.conf -datadir=/data getblockchaininfo
```

### Rotating Credentials

Redeploy the node to generate fresh credentials. Each deployment creates a new `rpcauth` and updates Secrets Manager automatically.

## Configuration Options

### bitcoin.conf

The `bitcoin.conf` is generated dynamically during node setup with:

| Setting | Value | Purpose |
|---------|-------|---------|
| `server=1` | Enabled | Enables RPC server |
| `rpcauth=...` | Auto-generated | Secure RPC authentication |
| `rpcbind` | `$EC2_INTERNAL_IP:8332` | Binds RPC to internal IP only |
| `rpcallowip` | RFC1918 ranges | Allows RPC from VPC subnets |
| `txindex=1` | Enabled | Full transaction index for RPC queries |
| `dbcache=4096` | 4 GB | In-memory UTXO cache for faster IBD |
| `maxmempool=300` | 300 MB | Memory pool size limit |
| `maxconnections=125` | 125 peers | Maximum P2P connections |

## Creating an Encrypted Wallet for Payments

Bitcoin Core supports encrypted wallets for securely receiving and managing payments.

> **Note**: Run the following commands after connecting to the node via Systems Manager.

### 1. Create an Encrypted Payment Wallet

```bash
/home/bcuser/bin/bitcoin-cli -conf=/data/bitcoin.conf -datadir=/data \
    createwallet "payments" false false "my_secure_passphrase"
```

- `payments`: The wallet name, indicating its purpose.
- `passphrase`: A secure, memorable phrase to protect your funds.

**Why encrypt?** Protects against unauthorized access and ensures funds are safe even if the server is compromised.

### 2. Generate a Receiving Address

To receive payments, generate a new address. You do not need to unlock the wallet for this step:

```bash
/home/bcuser/bin/bitcoin-cli -conf=/data/bitcoin.conf -datadir=/data \
    -rpcwallet="payments" getnewaddress "customer1" "bech32"
```

- `customer1`: Label to identify payments from this customer.
- `bech32`: Generates a SegWit address for lower transaction fees.

Example output: `bc1qxyzabc123...`

### 3. Monitor Incoming Payments

Check the balance and verify received payments:

```bash
# Check balance
/home/bcuser/bin/bitcoin-cli -conf=/data/bitcoin.conf -datadir=/data \
    -rpcwallet="payments" getbalance

# View detailed transactions
/home/bcuser/bin/bitcoin-cli -conf=/data/bitcoin.conf -datadir=/data \
    -rpcwallet="payments" listtransactions
```

### 4. Sending Payments (Requires Unlocking)

Unlock the wallet before making a payout:

```bash
/home/bcuser/bin/bitcoin-cli -conf=/data/bitcoin.conf -datadir=/data \
    -rpcwallet="payments" walletpassphrase "my_secure_passphrase" 600
```

This unlocks the wallet for 600 seconds (10 minutes). Then send Bitcoin:

```bash
/home/bcuser/bin/bitcoin-cli -conf=/data/bitcoin.conf -datadir=/data \
    -rpcwallet="payments" sendtoaddress "bc1qrecipientaddress" 0.01 "Payment for service"
```

### 5. Lock the Wallet After Use

For enhanced security, immediately lock the wallet after transactions:

```bash
/home/bcuser/bin/bitcoin-cli -conf=/data/bitcoin.conf -datadir=/data \
    -rpcwallet="payments" walletlock
```

### 6. Backup the Wallet

Protect your payment data by backing up the encrypted wallet regularly:

```bash
/home/bcuser/bin/bitcoin-cli -conf=/data/bitcoin.conf -datadir=/data \
    -rpcwallet="payments" backupwallet "/data/backups/payments.dat"
```

**Security tips:**
- Use strong passphrases and store them securely offline.
- Regularly backup your wallet after creating new addresses or receiving payments.
- Consider setting up automated wallet backups to ensure data integrity.

## Troubleshooting

### Node Not Starting

```bash
# Check service logs
sudo journalctl -u node.service --no-pager -n 50

# Check cloud-init logs
sudo cat /var/log/cloud-init-output.log
```

Common causes:
- Binary download failure (check network connectivity)
- Insufficient disk space
- Invalid bitcoin.conf syntax

### Node Crash-Loops After an Interrupted First Boot

**Symptom:** `journalctl -u node.service` repeats `specified config file "/data/bitcoin.conf" could not be opened`, and `/data/init-completed` doesn't exist.

**Cause:** node setup runs only once, on the instance's first boot. If the instance is stopped or rebooted before setup finishes, it doesn't resume. The service is left without `bitcoin.conf`.

Re-run the blueprint's setup script from an SSM session. It reuses the existing RPC credentials in Secrets Manager, then starts the service:

```bash
sudo systemctl stop node.service
sudo /opt/blueprints/user-data/node.sh
sudo systemctl start syncchecker.timer net-rules.service
test -f /data/init-completed && echo "setup complete"
```

### Slow Initial Sync

- Increase `dbcache` (requires more RAM)
- Ensure gp3 IOPS are sufficient (6,000+ recommended)
- Bitcoin IBD is mostly limited by one CPU thread (block validation). A faster core helps more than more vCPUs; `r8g.2xlarge` synced fastest in testing

### RPC Not Responding

1. Confirm service is running: `sudo systemctl status node`
2. Check bitcoin.conf: `cat /data/bitcoin.conf`
3. Verify RPC credentials: `aws secretsmanager get-secret-value --secret-id <stack-name>/bitcoin_rpc_credentials`
4. Ensure security group allows port 8332 from your VPC CIDR

### Monitoring Logs

```bash
# View recent Bitcoin Core logs
sudo journalctl -u node.service -f --no-pager -n 100

# View user data setup logs
sudo cat /var/log/cloud-init-output.log
```

See the [Troubleshooting Guide](/docs/guides/troubleshooting) for detailed diagnostics.

## Upgrades

### Upgrading Client Versions

1. Update the image tag / version in the configuration `.yml` file
2. Update `CLIENT_CONFIG` in `.env` to the new filename
3. Redeploy: `npx cdk deploy --json --outputs-file deploy-output-bitcoin-mainnet.json`

> **Note (single-node):** Redeploying a single-node stack with a new `CLIENT_CONFIG` doesn't upgrade the running node.
> - CloudFormation applies the new user data by stopping and starting the same instance; it isn't replaced. Node setup runs only on first boot, so it doesn't run again, and the node keeps running the previous Bitcoin Core version on the same chain data.
> - To move to a new client version, deploy a new stack with the new configuration and let it sync.
> - Changing `CPU_TYPE` on an existing stack fails and rolls back (see [After initial sync](#after-initial-sync)).

### Rolling Updates (HA Only)

HA deployments perform rolling updates automatically, ensuring no RPC downtime during client upgrades. See the [Deployment Guide](/docs/guides/deployment-guide) for details.

## Cost Optimization

### Storage
- gp3 is sufficient for Bitcoin (10-minute block time, low write pressure)
- 1.5 TB leaves about 5 years of headroom at the current ~100 GB/year growth. Monitor `disk_used_percent` and [expand the volume](/docs/guides/deployment-guide) before it fills.

### Compute
- Graviton instances cost less per hour than x86: `r8g.2xlarge` is 11% cheaper than `r7i.2xlarge`, and `r7g.2xlarge` is 19% cheaper. Graviton is also as fast or faster for Bitcoin Core; see [Choosing an instance type](#choosing-an-instance-type).
- `r7g.2xlarge` has the lowest total compute cost for the initial sync ($3.62 vs $4.80 on `r7i.2xlarge`, us-east-1 on-demand).
- Bitcoin IBD is the most compute-intensive phase. After sync, `r8g.xlarge` handled single-client RPC as well as `r8g.2xlarge` at half the price; see [After initial sync](#after-initial-sync)

See the [Deployment Guide](/docs/guides/deployment-guide) for detailed cost optimization strategies.

## Security Considerations

- **RPC binds to internal IP only** — not exposed to public internet
- **rpcallowip** restricted to RFC1918 private ranges (VPC only)
- **RPC credentials** stored in AWS Secrets Manager, never in plaintext
- **Cookie auth** available for local access (no credentials needed on the instance)
- **P2P port** (8333) open for Bitcoin network participation
- **No SSH access** — use AWS Systems Manager Session Manager
- **Encrypted EBS volumes** with IAM least-privilege roles

## Cleaning Up

```bash
# Delete Single Node
npx cdk destroy bitcoin-mainnet-bitcoin-core-v-full

# Delete HA Node
npx cdk destroy bitcoin-mainnet-bitcoin-core-v-full
```

> **Warning:** `cdk destroy` also deletes the data volume and all synced chain data (about 970 GB on mainnet). This applies to both single-node and HA stacks. A new deployment starts Initial Block Download from scratch. To keep the chain data, create an EBS snapshot of the `/data` volume before destroying the stack.

The RPC credentials secret is created by the node at first boot, not by CloudFormation, so `cdk destroy` leaves it behind. Delete it after destroying the stack:

```bash
aws secretsmanager delete-secret --region $AWS_REGION \
    --secret-id bitcoin-mainnet-bitcoin-core-v-full/bitcoin_rpc_credentials \
    --force-delete-without-recovery
```

The secret name is `<stack-name>/bitcoin_rpc_credentials`.

## FAQ

**Q: Does upgrading or redeploying require a full re-sync?**

A: No. Bitcoin Core resumes from the existing chain data on the `/data` EBS volume. A full Initial Block Download is only needed for a brand-new volume.

**Q: How long does the initial sync take?**

A: About 8–10 hours on mainnet with the recommended 8-vCPU instances and 6,000 IOPS gp3 (measured with Bitcoin Core v31.1). Most of IBD is limited by a single CPU thread, so single-core performance (`r8g.2xlarge` was fastest) matters more than adding vCPUs.

**Q: Do I need RPC credentials to use the node locally?**

A: No. When connected via SSM, `bitcoin-cli` uses cookie-based authentication automatically. Credentials (stored in AWS Secrets Manager) are only needed for remote RPC access from within the VPC.

**Q: Why is `txindex` enabled?**

A: `txindex=1` builds a full transaction index, which is required for RPC queries by arbitrary transaction ID and for explorer/wallet backends. It increases storage usage but is recommended for general-purpose RPC nodes.

## Additional Resources

### Client Release Channels

| Client | Repo | Query method | Version line | Prereleases |
|--------|------|--------------|--------------|-------------|
| Bitcoin Core | [bitcoin/bitcoin](https://github.com/bitcoin/bitcoin/releases) | releases/latest | * | stable only |

> Column legend — **Repo**: canonical `owner/repo` (link goes to the releases page). **Query method**: `releases/latest` = newest non-prerelease via GitHub API (`https://api.github.com/repos/{repo}/releases/latest`); `tags` = list `/tags` and pick the highest matching semver; `releases` = list `/releases` and pick the newest matching the prerelease policy; `pinned-file` = read the named file at the given ref. **Version line**: constrains updates to a release line (`*` = any). **Prereleases**: whether beta/RC tags are eligible.

- [Bitcoin Core Documentation](https://bitcoin.org/en/bitcoin-core/)
- [Bitcoin Core GitHub](https://github.com/bitcoin/bitcoin)
- [Bitcoin RPC API Reference](https://developer.bitcoin.org/reference/rpc/)
- [Bitcoin Core Config Generator](https://jlopp.github.io/bitcoin-core-config-generator/)

## Support

For issues and questions:
- Check [Troubleshooting Guide](/docs/guides/troubleshooting)
- Review [Configuration Reference](/docs/guides/configuration-reference)
- Open a GitHub issue
