# Sample AWS Blockchain Node Runner app for Polygon PoS Nodes

| Contributed by |
|:--------------------:|
| [@snese](https://github.com/snese) |

## Architecture Overview

This blueprint has two options for running Polygon PoS nodes using **Erigon**. You can set up a single RPC node or multiple nodes in a highly available setup. Instead of running a local Heimdall node, Erigon connects to Polygon's official Heimdall API endpoint.

> **Why Erigon?** The traditional Polygon setup requires two containers: Heimdall (consensus) and Bor (execution). The ongoing Heimdall v1→v2 migration makes this dual-container setup unreliable. Erigon provides a simpler, single-container alternative that connects to Polygon's official Heimdall API, avoiding the migration complexity entirely.

### Single node setup

The setup deploys a single EC2 instance running one Erigon container. The RPC port (8545) is exposed only to the internal VPC IP range, while P2P port (30303) and snap sync torrent port (42069) allow external access to keep the node synced with the network.

**Docker image:** `0xpolygon/erigon:v3.4.0` (Polygon's fork of Erigon, supports ARM/Graviton)

**Ports:**
| Port | Protocol | Access | Purpose |
|:-----|:---------|:-------|:--------|
| 8545 | TCP | VPC internal | JSON-RPC API |
| 30303 | TCP/UDP | Public | P2P networking |
| 42069 | TCP/UDP | Public | Torrent-based snap sync |

### Highly Available RPC Nodes setup

The highly available setup deploys multiple Erigon nodes behind an Application Load Balancer (ALB), managed by an Auto Scaling Group (ASG) across multiple Availability Zones. The ALB performs health checks on port 8545 to ensure only healthy nodes receive traffic. If a node fails, the ASG automatically replaces it, maintaining the desired number of healthy RPC endpoints without manual intervention.

### Hardware requirements

| Network | Instance | Storage | IOPS | Throughput | Est. monthly cost (us-east-1) |
|:--------|:---------|:--------|:-----|:-----------|:------------------------------|
| Mainnet | m7g.4xlarge (Graviton3) | 8 TB gp3 | 16,000 | 1,000 MB/s | ~$1,100 |
| Amoy testnet | m7g.xlarge (Graviton3) | 1 TB gp3 | 5,000 | default | ~$250 |

> **NOTE:** *Mainnet full node storage is comparable to the previous Heimdall+Bor setup. Archive node storage will be larger. Syncing from genesis takes time — snapshot restore is recommended for mainnet.*

## Well-Architected

<details>
<summary>Review the pros and cons of this solution.</summary>

### Well-Architected Checklist

This is the Well-Architected checklist for Polygon PoS nodes implementation of the AWS Blockchain Node Runner app. This checklist takes into account questions from the [AWS Well-Architected Framework](https://aws.amazon.com/architecture/well-architected/) which are relevant to this workload. Please feel free to add more checks from the framework if required for your workload.

| Pillar                  | Control                           | Question/Check                                                                   | Remarks          |
|:------------------------|:----------------------------------|:---------------------------------------------------------------------------------|:-----------------|
| Security                | Network protection                | Are there unnecessary open ports in security groups?                             | P2P port 30303 and Erigon snap sync port 42069 are open to the public for network participation (same as the Ethereum Erigon blueprint). RPC port 8545 is restricted to VPC internal traffic only. |
|                         |                                   | Traffic inspection                                                               | AWS WAF could be implemented for traffic inspection. Additional charges will apply. |
|                         | Compute protection                | Reduce attack surface                                                            | This solution uses Amazon Linux 2 AMI. You may choose to run hardening scripts on it. |
|                         |                                   | Enable people to perform actions at a distance                                   | This solution uses AWS Systems Manager (SSM) Session Manager for terminal access, not SSH. |
|                         | Data protection at rest           | Use encrypted Amazon Elastic Block Store (Amazon EBS) volumes                    | This solution uses encrypted Amazon EBS volumes. |
|                         | Authorization and access control  | Use instance profile with Amazon Elastic Compute Cloud (Amazon EC2) instances    | This solution uses AWS Identity and Access Management (AWS IAM) role instead of IAM user. |
|                         |                                   | Following principle of least privilege access                                    | The EC2 instance role has only the permissions required for CloudWatch metrics and SSM access. |
|                         | Application security              | Security focused development practices                                           | cdk-nag is being used with appropriate suppressions. |
| Cost optimization       | Service selection                 | Use cost effective resources                                                     | AWS Graviton3-based Amazon EC2 instances (m7g) are used for best price-performance ratio. |
|                         | Cost awareness                    | Estimate costs                                                                   | A single mainnet node with m7g.4xlarge and 8 TB gp3 storage costs ~$1,100/month in us-east-1. Amoy testnet with m7g.xlarge and 1 TB gp3 costs ~$250/month. |
| Reliability             | Resiliency implementation         | Withstand component failures                                                     | Single-node deployment has no HA. For high availability, use the `polygon-ha-nodes` stack which deploys multiple nodes behind an Application Load Balancer with Auto Scaling Group to automatically replace failed nodes. |
|                         | Data backup                       | How is data backed up?                                                           | Chain data can be restored from public snapshots. No automated S3 backup is configured in this blueprint. |
|                         | Resource monitoring               | How are workload resources monitored?                                            | Amazon CloudWatch custom metrics (ErigonBlockHeight) are published every 5 minutes via cron. |
| Performance efficiency  | Compute selection                 | How is compute solution selected?                                                | Compute solution is selected based on best price-performance — AWS Graviton3-based m7g instances. |
|                         | Storage selection                 | How is storage solution selected?                                                | gp3 Amazon EBS volumes with 16,000 IOPS and 1,000 MB/s throughput for mainnet, per Polygon official recommendations. |
| Operational excellence  | Workload health                   | How is health of workload determined?                                            | CloudWatch metrics (ErigonBlockHeight) are published every 5 minutes. Operators can monitor sync progress via CloudWatch dashboards. |
| Sustainability          | Hardware & services               | Select most efficient hardware for your workload                                 | This solution uses AWS Graviton3-based Amazon EC2 instances which offer the best performance per watt of energy use in Amazon EC2. |

</details>

## Solution Walkthrough

### Open AWS CloudShell

To begin, ensure you login to your AWS account with permissions to create and modify resources in IAM, EC2, EBS, and VPC.

From the AWS Management Console, open the [AWS CloudShell](https://docs.aws.amazon.com/cloudshell/latest/userguide/welcome.html), a web-based shell environment. If unfamiliar, review the [2-minute YouTube video](https://youtu.be/fz4rbjRaiQM) for an overview and check out [CloudShell with VPC environment](https://docs.aws.amazon.com/cloudshell/latest/userguide/creating-vpc-environment.html) that we'll use to test the node's RPC API from internal IP address space.

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

> **NOTE:** *The default VPC must have at least two public subnets in different Availability Zones, and public subnet must set `Auto-assign public IPv4 address` to `YES`.*

### Configure your setup

Create your own copy of the `.env` file and edit it:

```bash
# Make sure you are in aws-blockchain-node-runners/lib/polygon
cd lib/polygon
pwd
```

**For Mainnet:**
```bash
cp ./sample-configs/.env-mainnet .env
nano .env
```

**For Amoy Testnet:**
```bash
cp ./sample-configs/.env-amoy .env
nano .env
```

Edit the following values in your `.env` file:
- `AWS_ACCOUNT_ID` — your target AWS account ID
- `AWS_REGION` — your target AWS region
- `POLYGON_ERIGON_IMAGE` — Docker image for Erigon (default: `0xpolygon/erigon:v3.4.0`)
- `POLYGON_NETWORK` — `mainnet` or `amoy`
- `POLYGON_HEIMDALL_API_URL` — Polygon's official Heimdall API endpoint:
  - Mainnet: `https://heimdall-api.polygon.technology`
  - Amoy: `https://heimdall-api-amoy.polygon.technology`

**HA-specific parameters (only needed for Highly Available RPC Nodes):**
- `POLYGON_RPC_NUMBER_OF_NODES` — Number of RPC nodes in the Auto Scaling Group (default: `"2"`)
- `POLYGON_RPC_ALB_HEALTHCHECK_GRACE_PERIOD_MIN` — Grace period in minutes before ALB health checks start (default: `"10"`)
- `POLYGON_RPC_HA_NODES_HEARTBEAT_DELAY_MIN` — Delay in minutes between node heartbeat checks (default: `"60"`)

### Deploy common components

Deploy common components such as IAM role and security groups:

```bash
pwd
# Make sure you are in aws-blockchain-node-runners/lib/polygon
npx cdk deploy polygon-common
```

### Deploy Single Node

1. Deploy `polygon-single-node` stack

```bash
pwd
# Make sure you are in aws-blockchain-node-runners/lib/polygon
npx cdk deploy polygon-single-node --json --outputs-file single-node-deploy.json
```

2. After starting the node you need to wait for the initial synchronization process to finish. You can use Amazon CloudWatch to track the progress. A custom metric (`ErigonBlockHeight`) is published every 5 minutes. To see it:

    - Navigate to [CloudWatch service](https://console.aws.amazon.com/cloudwatch/) (make sure you are in the region you have specified for `AWS_REGION`)
    - Open `Dashboards` and select the Polygon node dashboard from the list.

3. Once the initial synchronization is done, you should be able to access the RPC API of that node from within the same VPC. The RPC port is not exposed to the Internet. Run the following to get the node's internal IP:

```bash
INSTANCE_ID=$(cat single-node-deploy.json | jq -r '..|.node-instance-id? | select(. != null)')
NODE_INTERNAL_IP=$(aws ec2 describe-instances --instance-ids $INSTANCE_ID --query 'Reservations[*].Instances[*].PrivateIpAddress' --output text)
echo "NODE_INTERNAL_IP=$NODE_INTERNAL_IP"
```

Copy output from the last `echo` command with `NODE_INTERNAL_IP=<internal_IP>` and open a [CloudShell tab with VPC environment](https://docs.aws.amazon.com/cloudshell/latest/userguide/creating-vpc-environment.html) to access internal IP address space. Paste `NODE_INTERNAL_IP=<internal_IP>` into the new CloudShell tab. Then query the API:

```bash
# IMPORTANT: Run from CloudShell VPC environment tab
curl http://$NODE_INTERNAL_IP:8545 -X POST -H "Content-Type: application/json" \
  --data '{"method":"eth_blockNumber","params":[],"id":1,"jsonrpc":"2.0"}'
```

The result should be like this (the actual block number will differ):

```json
{"jsonrpc":"2.0","id":1,"result":"0x3d0975a"}
```

### Deploy Highly Available RPC Nodes

1. Deploy `polygon-ha-nodes` stack

```bash
pwd
# Make sure you are in aws-blockchain-node-runners/lib/polygon
npx cdk deploy polygon-ha-nodes --json --outputs-file ha-nodes-deploy.json
```

2. Give the new RPC nodes some time to initialize, then run the following to get the ALB URL:

```bash
export POLYGON_RPC_ALB_URL=$(cat ha-nodes-deploy.json | jq -r '..|.alburl? | select(. != null)')
echo POLYGON_RPC_ALB_URL=$POLYGON_RPC_ALB_URL
```

3. Test the RPC API from a [CloudShell VPC environment](https://docs.aws.amazon.com/cloudshell/latest/userguide/creating-vpc-environment.html):

```bash
# IMPORTANT: Run from CloudShell VPC environment tab
curl http://$POLYGON_RPC_ALB_URL:8545 -X POST -H "Content-Type: application/json" \
  --data '{"jsonrpc":"2.0","method":"eth_blockNumber","params":[],"id":1}'
```

The result should be like this (the actual block number will differ):

```json
{"jsonrpc":"2.0","id":1,"result":"0x3d0975a"}
```

> **NOTE:** *By default and for security reasons the ALB is only available from within the VPC in the region where it is deployed. It is not available from the Internet and is not open for external connections. Before opening it up please make sure you protect your RPC APIs.*

### Clearing up and undeploying everything

```bash
# Setting the AWS account id and region in case local .env file is lost
export AWS_ACCOUNT_ID=<your_target_AWS_account_id>
export AWS_REGION=<your_target_AWS_region>

pwd
# Make sure you are in aws-blockchain-node-runners/lib/polygon

# Destroy HA RPC Nodes
npx cdk destroy polygon-ha-nodes

# Destroy Single Node
npx cdk destroy polygon-single-node

# Delete all common components like IAM role and Security Group
npx cdk destroy polygon-common
```

### FAQ

1. How to check the logs of the client running on my node?

> **NOTE:** *This solution uses SSM Session Manager instead of SSH. That allows you to log all sessions in AWS CloudTrail to see who logged into the server and when. If you receive an error similar to `SessionManagerPlugin is not found`, [install Session Manager plugin for AWS CLI](https://docs.aws.amazon.com/systems-manager/latest/userguide/session-manager-working-with-install-plugin.html).*

```bash
pwd
# Make sure you are in aws-blockchain-node-runners/lib/polygon

export INSTANCE_ID=$(cat single-node-deploy.json | jq -r '..|.node-instance-id? | select(. != null)')
echo "INSTANCE_ID=" $INSTANCE_ID
aws ssm start-session --target $INSTANCE_ID --region $AWS_REGION

# Erigon logs:
docker logs erigon -f
```

2. How to check the logs from the EC2 user-data script?

```bash
pwd
# Make sure you are in aws-blockchain-node-runners/lib/polygon

export INSTANCE_ID=$(cat single-node-deploy.json | jq -r '..|.node-instance-id? | select(. != null)')
echo "INSTANCE_ID=" $INSTANCE_ID
aws ssm start-session --target $INSTANCE_ID --region $AWS_REGION
sudo cat /var/log/cloud-init-output.log
```

3. How to restart the node if it gets stuck during syncing?

```bash
pwd
# Make sure you are in aws-blockchain-node-runners/lib/polygon

export INSTANCE_ID=$(cat single-node-deploy.json | jq -r '..|.node-instance-id? | select(. != null)')
echo "INSTANCE_ID=" $INSTANCE_ID
aws ssm start-session --target $INSTANCE_ID --region $AWS_REGION
docker-compose down && docker-compose up -d
```
