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
|  |  |  |    EBS Volume (/data) - 1 TB gp3                 | | |
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
| Mainnet | Single Node | r7i.2xlarge | 8 | 64 GB | 1 TB gp3 |
| Mainnet | HA (2 nodes) | r7i.2xlarge | 8 each | 64 GB each | 1 TB gp3 each |
| Testnet | Single Node | r7i.xlarge | 4 | 32 GB | 200 GB gp3 |

**ARM Alternative**: Use `r8g.2xlarge` for ~10% cost savings on mainnet.

### Storage Requirements

| Network | Current Size | Growth Rate | Recommended | Type | IOPS |
|---------|-------------|-------------|-------------|------|------|
| Mainnet | ~650 GB (with txindex) | ~80 GB/year | 1 TB | gp3 | 6,000 |
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

Initial Block Download (IBD) takes 12-48 hours depending on instance type and IOPS.

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
4. Stores `username:password` in AWS Secrets Manager as `bitcoin_rpc_credentials`
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
export BTC_RPC_AUTH=$(aws secretsmanager get-secret-value \
    --secret-id bitcoin_rpc_credentials \
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

### Slow Initial Sync

- Increase `dbcache` (requires more RAM)
- Ensure gp3 IOPS are sufficient (6,000+ recommended)
- Bitcoin IBD is CPU-intensive — larger instance helps

### RPC Not Responding

1. Confirm service is running: `sudo systemctl status node`
2. Check bitcoin.conf: `cat /data/bitcoin.conf`
3. Verify RPC credentials: `aws secretsmanager get-secret-value --secret-id bitcoin_rpc_credentials`
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

Note: The instance will be replaced and Bitcoin Core will resume from the existing chain data on the EBS volume (no full re-sync required).

### Rolling Updates (HA Only)

HA deployments perform rolling updates automatically, ensuring no RPC downtime during client upgrades. See the [Deployment Guide](/docs/guides/deployment-guide) for details.

## Cost Optimization

### Storage
- gp3 is sufficient for Bitcoin (10-minute block time, low write pressure)
- 1 TB provides ~4 years of growth headroom with txindex

### Compute
- ARM instances (`r8g.2xlarge`) save ~10% vs x86
- Bitcoin IBD is the most compute-intensive phase; after sync, a smaller instance suffices

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
npx cdk destroy bitcoin-mainnet-bitcoin-core-v-full-ha
```

## FAQ

**Q: Does upgrading or redeploying require a full re-sync?**

A: No. Bitcoin Core resumes from the existing chain data on the `/data` EBS volume. A full Initial Block Download is only needed for a brand-new volume.

**Q: How long does the initial sync take?**

A: Initial Block Download (IBD) takes 12-48 hours on mainnet depending on instance type and IOPS. IBD is CPU- and I/O-intensive — a larger instance and 6,000+ IOPS speed it up.

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
