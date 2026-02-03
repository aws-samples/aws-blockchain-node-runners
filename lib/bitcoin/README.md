# Sample AWS Blockchain Node Runner app for Bitcoin Nodes

| Contributed by |
|:--------------------:|
| [@frbrkoala](https://github.com/frbrkoala) |

## Architecture Overview

This blueprint has two options for running nodes. You can set up a single node or multiple nodes in highly-available setup. The details are below.

### Single node setup

This setup is for small scale PoC or development environments. It deploys a single EC2 instance running Bitcoin Core (bitcoind). The RPC port is exposed only to internal IP range of the VPC, while P2P ports allow external access to keep the node synced with the Bitcoin network.

**Quick Start - Single Node:**
```bash
git clone https://github.com/aws-samples/aws-blockchain-node-runners.git
cd aws-blockchain-node-runners
npm install
cd lib/bitcoin
cp ./sample-configs/.env-sample-mainnet .env
# Edit .env with your AWS_ACCOUNT_ID and AWS_REGION
npx cdk deploy bitcoin-common
npx cdk deploy bitcoin-single-node
```

### Highly available setup

1. Multiple Bitcoin nodes are deployed behind an Application Load Balancer for high availability.
2. Each node syncs independently with the Bitcoin network.
3. Applications access the RPC API through the Application Load Balancer.

**Quick Start - HA Nodes:**
```bash
git clone https://github.com/aws-samples/aws-blockchain-node-runners.git
cd aws-blockchain-node-runners
npm install
cd lib/bitcoin
cp ./sample-configs/.env-sample-mainnet .env
# Edit .env with your AWS_ACCOUNT_ID and AWS_REGION
npx cdk deploy bitcoin-common
npx cdk deploy bitcoin-ha-nodes
```

## Well-Architected

<details>
<summary>Review the for pros and cons of this solution.</summary>

### Well-Architected Checklist

This is the Well-Architected checklist for Bitcoin nodes implementation of the AWS Blockchain Node Runner app. This checklist takes into account questions from the [AWS Well-Architected Framework](https://aws.amazon.com/architecture/well-architected/) which are relevant to this workload. Please feel free to add more checks from the framework if required for your workload.

| Pillar                  | Control                           | Question/Check                                                                   | Remarks          |
|:------------------------|:----------------------------------|:---------------------------------------------------------------------------------|:-----------------|
| Security                | Network protection                | Are there unnecessary open ports in security groups?                             | P2P ports (8333 for mainnet) are open to allow network participation. RPC ports are restricted to VPC CIDR only. |
|                         |                                   | Traffic inspection                                                               | AWS WAF could be implemented for traffic inspection. Additional charges will apply. |
|                         | Compute protection                | Reduce attack surface                                                            | This solution uses Amazon Linux 2023 AMI. You may choose to run hardening scripts on it. |
|                         |                                   | Enable people to perform actions at a distance                                   | This solution uses AWS Systems Manager for terminal session, not SSH ports. |
|                         | Data protection at rest           | Use encrypted Amazon Elastic Block Store (Amazon EBS) volumes                    | This solution uses encrypted Amazon EBS volumes. |
|                         | Data protection in transit        | Use TLS                                                                          | The AWS Application Load Balancer currently uses HTTP listener. Create HTTPS listener with self-signed certificate if TLS is desired. |
|                         | Authorization and access control  | Use instance profile with Amazon Elastic Compute Cloud (Amazon EC2) instances    | This solution uses AWS Identity and Access Management (AWS IAM) role instead of IAM user. |
|                         |                                   | Following principle of least privilege access                                    | Root user is not used (using special user "bitcoin" instead). |
|                         | Application security              | Security focused development practices                                           | cdk-nag is being used with appropriate suppressions. Systemd service uses hardening options (PrivateTmp, ProtectSystem, NoNewPrivileges). |
| Cost optimization       | Service selection                 | Use cost effective resources                                                     | AWS Graviton-based Amazon EC2 instances (m7g.large) are used by default, which are cost effective compared to Intel/AMD instances. |
|                         | Cost awareness                    | Estimate costs                                                                   | One node with m7g.large (700GB gp3) will cost around US$120 per month in the US East (N. Virginia) region. Additional charges will apply if you choose to deploy HA nodes with load balancer. |
| Reliability             | Resiliency implementation         | Withstand component failures                                                     | This solution uses AWS Application Load Balancer with multiple nodes for high availability. |
|                         | Data backup                       | How is data backed up?                                                           | Blockchain data can be re-synced from the network. For faster recovery, consider periodic EBS snapshots. |
|                         | Resource monitoring               | How are workload resources monitored?                                            | Resources are being monitored using Amazon CloudWatch dashboards. Amazon CloudWatch custom metrics are being pushed via CloudWatch Agent. |
| Performance efficiency  | Compute selection                 | How is compute solution selected?                                                | Compute solution is selected based on best price-performance, i.e. AWS Graviton-based Amazon EC2 instances. Bitcoin Core runs well on ARM64. |
|                         | Storage selection                 | How is storage solution selected?                                                | Storage solution is selected based on best price-performance, i.e. gp3 Amazon EBS volumes with optimal IOPS and throughput. |
|                         | Architecture selection            | How is the best performance architecture selected?                               | Bitcoin Core's dbcache setting is configured to use available memory for faster initial sync. |
| Operational excellence  | Workload health                   | How is health of workload determined?                                            | Health of workload is determined via AWS Application Load Balancer Target Group Health Checks on the RPC port. |
| Sustainability          | Hardware & services               | Select most efficient hardware for your workload                                 | This solution uses AWS Graviton-based Amazon EC2 instances which offer the best performance per watt of energy use in Amazon EC2. |

</details>

## Solution Walkthrough

### Open AWS CloudShell

To begin, ensure you login to your AWS account with permissions to create and modify resources in IAM, EC2, EBS, VPC, and S3.

From the AWS Management Console, open the [AWS CloudShell](https://docs.aws.amazon.com/cloudshell/latest/userguide/welcome.html), a web-based shell environment. If unfamiliar, review the [2-minute YouTube video](https://youtu.be/fz4rbjRaiQM) for an overview and check out [CloudShell with VPC environment](https://docs.aws.amazon.com/cloudshell/latest/userguide/creating-vpc-environment.html) that we'll use to test nodes API from internal IP address space.

Once ready, you can run the commands to deploy and test blueprints in the CloudShell.

### Clone this repository and install dependencies

```bash
git clone https://github.com/aws-samples/aws-blockchain-node-runners.git
cd aws-blockchain-node-runners
npm install
```

### Prepare AWS account to deploy nodes

1. Make sure you are in the root directory of the cloned repository

2. If you have deleted or don't have the default VPC, create default VPC

```bash
aws ec2 create-default-vpc
```

> **NOTE:** *You may see the following error if the default VPC already exists: `An error occurred (DefaultVpcAlreadyExists) when calling the CreateDefaultVpc operation: A Default VPC already exists for this account in this region.`. That means you can just continue with the following steps.*

> **NOTE:** *The default VPC must have at least two public subnets in different Availability Zones, and public subnet must set `Auto-assign public IPv4 address` to `YES`*

### Configure your setup

Create your own copy of `.env` file and edit it using your preferred text editor:

```bash
# Make sure you are in aws-blockchain-node-runners/lib/bitcoin
cd lib/bitcoin
pwd
```


<details>

<summary>Mainnet Full Node</summary>
<br/>

**Configure your Node Runners Bitcoin - Mainnet Full Node**

```bash
cp ./sample-configs/.env-sample-mainnet .env
nano .env
```

</details>

<details>

<summary>Testnet Full Node</summary>
<br/>

**Configure your Node Runners Bitcoin - Testnet Full Node**

```bash
cp ./sample-configs/.env-sample-testnet .env
nano .env
```

</details>

<details>

<summary>Mainnet Pruned Node</summary>
<br/>

**Configure your Node Runners Bitcoin - Mainnet Pruned Node**

A pruned node only keeps a limited amount of block data, significantly reducing storage requirements.

```bash
cp ./sample-configs/.env-sample-pruned .env
nano .env
```

</details>

> **NOTE:** *You can find more examples inside the `sample-configs` directory.*

### Deploy common components

Deploy common components such as IAM role:

```bash
pwd
# Make sure you are in aws-blockchain-node-runners/lib/bitcoin
npx cdk deploy bitcoin-common
```

### Deploy Single Node

1. Deploy `bitcoin-single-node` stack

```bash
pwd
# Make sure you are in aws-blockchain-node-runners/lib/bitcoin
npx cdk deploy bitcoin-single-node --json --outputs-file single-node-deploy.json
```

2. After starting the node you need to wait for the initial synchronization process to finish. It may take from 1 to 7 days depending on your instance type, storage performance, and network conditions. You can use Amazon CloudWatch to track the progress:

   - Navigate to [CloudWatch service](https://console.aws.amazon.com/cloudwatch/) (make sure you are in the region you have specified for `AWS_REGION`)
   - Open `Dashboards` and select `bitcoin-single-node-<network>` from the list of dashboards.

3. Once the initial synchronization is done, you should be able to access the RPC API of that node from within the same VPC. The RPC port is not exposed to the Internet. Run the following query against the private IP of the single node:

```bash
INSTANCE_ID=$(cat single-node-deploy.json | jq -r '..|.nodeinstanceid? | select(. != null)')
NODE_INTERNAL_IP=$(aws ec2 describe-instances --instance-ids $INSTANCE_ID --query 'Reservations[*].Instances[*].PrivateIpAddress' --output text)
echo "NODE_INTERNAL_IP=$NODE_INTERNAL_IP"
```

Copy output from the last `echo` command with `NODE_INTERNAL_IP=<internal_IP>` and open [CloudShell tab with VPC environment](https://docs.aws.amazon.com/cloudshell/latest/userguide/creating-vpc-environment.html) to access internal IP address space. Paste `NODE_INTERNAL_IP=<internal_IP>` into the new CloudShell tab. Then query the API:

```bash
# IMPORTANT: Run from CloudShell VPC environment tab
# Query blockchain info
curl --user <rpcuser>:<rpcpassword> --data-binary '{"jsonrpc": "1.0", "id": "curltest", "method": "getblockchaininfo", "params": []}' -H 'content-type: text/plain;' http://$NODE_INTERNAL_IP:8332/
```

The result should be like this (actual values will vary):

```json
{"result":{"chain":"main","blocks":800000,"headers":800000,"bestblockhash":"...","verificationprogress":0.9999...},"error":null,"id":"curltest"}
```

### Deploy Highly Available Nodes

1. Deploy `bitcoin-ha-nodes` stack

```bash
pwd
# Make sure you are in aws-blockchain-node-runners/lib/bitcoin
npx cdk deploy bitcoin-ha-nodes --json --outputs-file ha-nodes-deploy.json
```

2. Give the new nodes time to initialize and sync, then run the following query against the load balancer:

```bash
export BITCOIN_ALB_URL=$(cat ha-nodes-deploy.json | jq -r '..|.alburl? | select(. != null)')
echo BITCOIN_ALB_URL=$BITCOIN_ALB_URL
```

```bash
# IMPORTANT: Run from CloudShell VPC environment tab
curl --user <rpcuser>:<rpcpassword> --data-binary '{"jsonrpc": "1.0", "id": "curltest", "method": "getblockchaininfo", "params": []}' -H 'content-type: text/plain;' http://$BITCOIN_ALB_URL:8332/
```

> **NOTE:** *By default and for security reasons the load balancer is available only from within the default VPC in the region where it is deployed. It is not available from the Internet and is not open for external connections. Before opening it up please make sure you protect your RPC APIs.*

### Generating RPC Authentication

To generate an `rpcauth` string for secure RPC access:

```bash
# Download the rpcauth.py script from Bitcoin Core
wget https://raw.githubusercontent.com/bitcoin/bitcoin/master/share/rpcauth/rpcauth.py
python3 rpcauth.py <username>
```

Use the generated string in your `.env` file:

```
BITCOIN_RPCAUTH="username:salt$hash"
```

### Clearing up and undeploying everything

1. Destroy all stacks

```bash
# Setting the AWS account id and region in case local .env file is lost
export AWS_ACCOUNT_ID=<your_target_AWS_account_id>
export AWS_REGION=<your_target_AWS_region>

pwd
# Make sure you are in aws-blockchain-node-runners/lib/bitcoin

# Destroy Single Node
npx cdk destroy bitcoin-single-node

# Destroy HA Nodes
npx cdk destroy bitcoin-ha-nodes

# Delete all common components like IAM role
npx cdk destroy bitcoin-common
```

### FAQ

1. How to check the logs of Bitcoin Core running on my node?

> **NOTE:** *In this tutorial we chose not to use SSH and use Session Manager instead. That allows you to log all sessions in AWS CloudTrail to see who logged into the server and when. If you receive an error similar to `SessionManagerPlugin is not found`, [install Session Manager plugin for AWS CLI](https://docs.aws.amazon.com/systems-manager/latest/userguide/session-manager-working-with-install-plugin.html)*

```bash
pwd
# Make sure you are in aws-blockchain-node-runners/lib/bitcoin

export INSTANCE_ID=$(cat single-node-deploy.json | jq -r '..|.nodeinstanceid? | select(. != null)')
echo "INSTANCE_ID=" $INSTANCE_ID
aws ssm start-session --target $INSTANCE_ID --region $AWS_REGION
sudo journalctl -u bitcoind -f
```

2. How to check the logs from the EC2 user-data script?

```bash
pwd
# Make sure you are in aws-blockchain-node-runners/lib/bitcoin

export INSTANCE_ID=$(cat single-node-deploy.json | jq -r '..|.nodeinstanceid? | select(. != null)')
echo "INSTANCE_ID=" $INSTANCE_ID
aws ssm start-session --target $INSTANCE_ID --region $AWS_REGION
sudo cat /var/log/cloud-init-output.log
```

3. How to check Bitcoin Core sync status?

```bash
aws ssm start-session --target $INSTANCE_ID --region $AWS_REGION
sudo -u bitcoin bitcoin-cli -conf=/home/bitcoin/.bitcoin/bitcoin.conf getblockchaininfo
```

4. What are the disk space requirements?

| Network | Full Node | Pruned Node |
|---------|-----------|-------------|
| Mainnet | ~650 GB   | ~5-10 GB    |
| Testnet | ~50 GB    | ~5 GB       |
| Signet  | ~5 GB     | ~1 GB       |

## Configuration Options

### Instance Configuration

| Variable | Description | Default |
|----------|-------------|---------|
| `BITCOIN_INSTANCE_TYPE` | EC2 instance type | `m7g.large` |
| `BITCOIN_CPU_TYPE` | CPU architecture (`ARM_64` or `x86_64`) | `ARM_64` |

### Data Volume Configuration

| Variable | Description | Default |
|----------|-------------|---------|
| `BITCOIN_DATA_VOL_TYPE` | EBS volume type | `gp3` |
| `BITCOIN_DATA_VOL_SIZE` | Volume size in GiB | `700` |
| `BITCOIN_DATA_VOL_IOPS` | IOPS for EBS volume | `5000` |
| `BITCOIN_DATA_VOL_THROUGHPUT` | Throughput in MB/s | `250` |

### Bitcoin Core Configuration

| Variable | Description | Default |
|----------|-------------|---------|
| `BITCOIN_NETWORK` | Network to connect to | `mainnet` |
| `BITCOIN_VERSION` | Bitcoin Core version | `28.0` |
| `BITCOIN_TXINDEX` | Enable transaction index | `false` |
| `BITCOIN_SERVER` | Enable RPC server | `true` |
| `BITCOIN_LISTEN` | Accept incoming connections | `true` |
| `BITCOIN_DBCACHE` | Database cache size in MB | `4096` |
| `BITCOIN_MAXCONNECTIONS` | Maximum peer connections | `125` |
| `BITCOIN_RPCALLOWIP` | IP range for RPC access | `127.0.0.1` |
| `BITCOIN_RPCAUTH` | RPC authentication string | `none` |
| `BITCOIN_PRUNE` | Prune blockchain (0=disabled) | `0` |

### ZMQ Configuration

| Variable | Description | Default |
|----------|-------------|---------|
| `BITCOIN_ZMQPUBRAWBLOCK` | ZMQ raw block endpoint | `none` |
| `BITCOIN_ZMQPUBRAWTX` | ZMQ raw tx endpoint | `none` |
| `BITCOIN_ZMQPUBHASHBLOCK` | ZMQ hash block endpoint | `none` |
| `BITCOIN_ZMQPUBHASHTX` | ZMQ hash tx endpoint | `none` |

### Snapshot Configuration

| Variable | Description | Default |
|----------|-------------|---------|
| `BITCOIN_RESTORE_FROM_SNAPSHOT` | Enable snapshot restoration | `false` |
| `BITCOIN_SNAPSHOT_URL` | HTTPS URL to snapshot tarball | `none` |

### HA Configuration

| Variable | Description | Default |
|----------|-------------|---------|
| `BITCOIN_HA_NUMBER_OF_NODES` | Number of nodes | `2` |
| `BITCOIN_HA_ALB_HEALTHCHECK_GRACE_PERIOD_MIN` | Health check grace period | `10` |
| `BITCOIN_HA_NODES_HEARTBEAT_DELAY_MIN` | Heartbeat delay | `60` |

## Configuration Guidance

This section explains key Bitcoin Core configuration options and how to select appropriate values for your use case.

### Network Selection (`BITCOIN_NETWORK`)

| Network | Use Case | Storage Required |
|---------|----------|------------------|
| `mainnet` | Production, real transactions | ~650 GB |
| `testnet` | Testing with test coins | ~50 GB |
| `signet` | Controlled testing environment | ~5 GB |
| `regtest` | Local development, instant blocks | Minimal |

### Database Cache (`BITCOIN_DBCACHE`)

The `dbcache` setting controls how much RAM Bitcoin Core uses for the UTXO database cache. Higher values significantly speed up initial sync and improve performance.

| Instance Memory | Recommended `dbcache` | Notes |
|-----------------|----------------------|-------|
| 8 GB | 4096 MB | Default, good balance |
| 16 GB | 8192 MB | Faster sync |
| 32 GB+ | 16384 MB | Maximum practical benefit |

During initial sync, Bitcoin Core is CPU and I/O bound. A larger dbcache reduces disk writes and can cut sync time from 7 days to 1-2 days.

### Transaction Index (`BITCOIN_TXINDEX`)

- **`false` (default)**: Node only indexes transactions in your wallet. Most RPC calls work normally.
- **`true`**: Indexes all transactions, enabling `getrawtransaction` for any transaction. Requires ~30 GB additional storage and slightly slower sync.

**Enable if**: You need to look up arbitrary transactions by txid (e.g., block explorers, analytics).

### Pruning (`BITCOIN_PRUNE`)

Pruning reduces storage by deleting old block data after validation.

| Value | Behavior | Storage Required |
|-------|----------|------------------|
| `0` | No pruning (full node) | ~650 GB |
| `550` | Minimum pruning | ~550 MB |
| `5000` | Moderate pruning | ~5 GB |
| `50000` | Light pruning | ~50 GB |

**Trade-offs**:
- Pruned nodes cannot serve historical blocks to other nodes
- Cannot enable `txindex` with pruning
- Cannot rescan wallet for old transactions
- Still validates all blocks during sync

**Use pruning if**: Storage cost is a concern and you don't need historical block data.

### Listening (`BITCOIN_LISTEN`)

- **`true` (default)**: Accept incoming P2P connections. Helps the network and improves your connectivity.
- **`false`**: Only make outgoing connections. Reduces bandwidth but still syncs normally.

**Set to `false` if**: You're behind restrictive firewalls or want to minimize bandwidth.

### RPC Server (`BITCOIN_SERVER`)

- **`true` (default)**: Enable JSON-RPC server for API access.
- **`false`**: Disable RPC (node runs but cannot be queried).

Keep enabled for most deployments. The RPC port is already restricted to VPC CIDR.

### RPC Access Control (`BITCOIN_RPCALLOWIP`)

Controls which IP addresses can connect to the RPC server.

| Value | Access |
|-------|--------|
| `127.0.0.1` | Localhost only |
| `10.0.0.0/8` | Private 10.x.x.x range (typical VPC) |
| `172.16.0.0/12` | Private 172.16-31.x.x range |
| `192.168.0.0/16` | Private 192.168.x.x range |

**Recommendation**: Use your VPC CIDR (e.g., `10.0.0.0/8`) to allow access from other instances in the VPC.

### Maximum Connections (`BITCOIN_MAXCONNECTIONS`)

Controls the maximum number of peer connections.

| Value | Use Case |
|-------|----------|
| `8` | Minimal bandwidth usage |
| `50` | Light usage |
| `125` | Default, good connectivity |
| `256+` | High-bandwidth, helping the network |

Higher values improve block propagation speed but increase bandwidth usage (~200 GB/month at default).

### Blocks Only Mode (`BITCOIN_BLOCKSONLY`)

- **`false` (default)**: Receive blocks and unconfirmed transactions (mempool).
- **`true`**: Only receive blocks, no mempool data.

**Set to `true` if**: You only need confirmed transaction data and want to reduce bandwidth by ~90%.

### ZMQ (ZeroMQ) Notifications

ZMQ provides real-time push notifications for new blocks and transactions. Useful for applications that need instant updates.

| Setting | Data Provided |
|---------|---------------|
| `BITCOIN_ZMQPUBRAWBLOCK` | Full serialized block data |
| `BITCOIN_ZMQPUBRAWTX` | Full serialized transaction data |
| `BITCOIN_ZMQPUBHASHBLOCK` | Block hash only (lightweight) |
| `BITCOIN_ZMQPUBHASHTX` | Transaction hash only (lightweight) |

**Example configuration**:
```
BITCOIN_ZMQPUBRAWBLOCK="tcp://0.0.0.0:28332"
BITCOIN_ZMQPUBRAWTX="tcp://0.0.0.0:28333"
```

**Enable if**: You're building applications that need real-time blockchain notifications (wallets, payment processors, analytics).

### Snapshot Restoration (`BITCOIN_RESTORE_FROM_SNAPSHOT`)

Restoring from a snapshot can significantly reduce initial sync time from days to hours.

**Security Requirements**:
- Snapshot URL must use HTTPS (enforced by the restore script)
- Only use snapshots from trusted sources
- The node will still validate all blocks after restoration

**How to use**:
1. Set `BITCOIN_RESTORE_FROM_SNAPSHOT="true"` in your `.env` file
2. Set `BITCOIN_SNAPSHOT_URL` to an HTTPS URL pointing to a `.tar.gz` or `.tar.zst` snapshot

**Example**:
```bash
BITCOIN_RESTORE_FROM_SNAPSHOT="true"
BITCOIN_SNAPSHOT_URL="https://your-trusted-source.com/bitcoin-mainnet-snapshot.tar.gz"
```

**Trusted Snapshot Sources**:
- Create your own snapshots from a fully synced node using `tar -czf`
- Use snapshots from reputable infrastructure providers
- Never use snapshots from untrusted or anonymous sources

**Trade-offs**:
- Faster initial sync (hours instead of days)
- Requires trusting the snapshot source
- Node validates all new blocks after restoration

### Recommended Configurations by Use Case

<details>
<summary>Block Explorer / Analytics Platform</summary>

```bash
BITCOIN_TXINDEX="true"          # Index all transactions
BITCOIN_DBCACHE="8192"          # Fast queries
BITCOIN_PRUNE="0"               # Keep all data
BITCOIN_MAXCONNECTIONS="50"     # Moderate connectivity
```
</details>

<details>
<summary>Payment Processing</summary>

```bash
BITCOIN_TXINDEX="false"         # Not needed for wallet transactions
BITCOIN_DBCACHE="4096"          # Standard
BITCOIN_PRUNE="0"               # Full validation
BITCOIN_ZMQPUBRAWBLOCK="tcp://0.0.0.0:28332"  # Real-time notifications
BITCOIN_ZMQPUBRAWTX="tcp://0.0.0.0:28333"
```
</details>

<details>
<summary>Minimal Footprint / Cost Optimized</summary>

```bash
BITCOIN_TXINDEX="false"         # Minimal indexing
BITCOIN_DBCACHE="2048"          # Lower memory
BITCOIN_PRUNE="5000"            # Pruned to 5GB
BITCOIN_BLOCKSONLY="true"       # No mempool
BITCOIN_MAXCONNECTIONS="8"      # Minimal connections
BITCOIN_INSTANCE_TYPE="m7g.medium"  # Smaller instance
BITCOIN_DATA_VOL_SIZE="20"      # Minimal storage
```
</details>

<details>
<summary>Development / Testing</summary>

```bash
BITCOIN_NETWORK="testnet"       # Test network
BITCOIN_TXINDEX="true"          # Full indexing for debugging
BITCOIN_DBCACHE="2048"          # Moderate
BITCOIN_INSTANCE_TYPE="m7g.medium"  # Smaller instance
BITCOIN_DATA_VOL_SIZE="100"     # Testnet is smaller
```
</details>
