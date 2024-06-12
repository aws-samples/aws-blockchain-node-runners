# Sample AWS Blockchain Node Runner app for Base Nodes

| Contributed by |
|:---------------|
|[@frbrkoala](https://github.com/frbrkoala), [@danyalprout](https://github.com/danyalprout)|

[Base](https://base.org/) is a "Layer 2" scaling solution for Ethereum. This blueprint helps to deploy Base RPC nodes on AWS. It is meant to be used for development, testing or Proof of Concept purposes.

## Overview of Deployment Architectures for Single Node setups

### Single node setup

![Single Node Deployment](./doc/assets/Architecture-SingleNode-v3.png)

1.	A Base node deployed in the [Default VPC](https://docs.aws.amazon.com/vpc/latest/userguide/default-vpc.html) continuously synchronizes with the rest of nodes on Base blockchain network through [Internet Gateway](https://docs.aws.amazon.com/vpc/latest/userguide/VPC_Internet_Gateway.html).
2.	The Base node is used by dApps or development tools internally from within the Default VPC. JSON RPC API is not exposed to the Internet directly to protect nodes from unauthorized access.
3. Your Base node needs access to a fully-synced [Ethereum Mainnet or Sepolia RPC endpoint](https://docs.base.org/tools/node-providers) .
4. The Base node sends various monitoring metrics for both EC2 and Base nodes to Amazon CloudWatch.

## Additional materials

<details>
<summary>Review the for pros and cons of this solution.</summary>

### Well-Architected Checklist

This is the Well-Architected checklist for Ethereum nodes implementation of the AWS Blockchain Node Runner app. This checklist takes into account questions from the [AWS Well-Architected Framework](https://aws.amazon.com/architecture/well-architected/) which are relevant to this workload. Please feel free to add more checks from the framework if required for your workload.

| Pillar                  | Control                           | Question/Check                                                                   | Remarks          |
|:------------------------|:----------------------------------|:---------------------------------------------------------------------------------|:-----------------|
| Security                | Network protection                | Are there unnecessary open ports in security groups?                             | Please note that port 9222 (TCP/UDP) for Base are open to public to support P2P protocols. We have to rely on the protection mechanisms built into the Base software to protect those ports.   |
|                         |                                   | Traffic inspection                                                               | AWS WAF could be implemented for traffic inspection. Additional charges will apply.  |
|                         | Compute protection                | Reduce attack surface                                                            | This solution uses Amazon Linux 2 AMI. You may choose to run hardening scripts on it.  |
|                         |                                   | Enable people to perform actions at a distance                                   | This solution uses AWS Systems Manager for terminal session, not ssh ports.  |
|                         | Data protection at rest           | Use encrypted Amazon Elastic Block Store (Amazon EBS) volumes                    | This solution uses encrypted Amazon EBS volumes.  |
|                         | Data protection in transit        | Use TLS                                                                          | By design TLS is not used in Base RPC and P2P protocols because the data is considered public. To protect RPC traffic we expose the port only for internal use. |
|                         | Authorization and access control  | Use instance profile with Amazon Elastic Compute Cloud (Amazon EC2) instances    | This solution uses AWS Identity and Access Management (AWS IAM) role instead of IAM user.  |
|                         |                                   | Following principle of least privilege access                                    | In the node, root user is not used (using special user "bcuser" instead).  |
|                         | Application security              | Security focused development practices                                           | cdk-nag is being used with documented suppressions.  |
| Cost optimization       | Service selection                 | Use cost effective resources                                                     | Base nodes works well on ARM architecture and we use Graviton3-powered EC2 instances for better cost effectiveness.  |
|                         | Cost awareness                    | Estimate costs                                                                   | One Base node with on-Demand priced m7g.2xlarge and 3TiB EBS gp3 volume will cost around US$599.27 per month in the US East (N. Virginia) region. Additional charges will apply for Ethereum L1 node and will depend on the service used. |
| Reliability             | Resiliency implementation         | Withstand component failures                                                     | This solution currently does not have high availability and is deployed to a single availability zone.  |
|                         | Data backup                       | How is data backed up?                                                           | The data is not specially backed up. The node will have to re-sync its state from other nodes in the Base network to recover.  |
|                         | Resource monitoring               | How are workload resources monitored?                                            | Resources are being monitored using Amazon CloudWatch dashboards. Amazon CloudWatch custom metrics are being pushed via CloudWatch Agent.  |
| Performance efficiency  | Compute selection                 | How is compute solution selected?                                                | Compute solution is selected based on the recommendations the from Base community to provide stable and cost-effective operations.  |
|                         | Storage selection                 | How is storage solution selected?                                                | Storage solution is selected based on the recommendations the from Base community to provide stable and cost-effective operations.  |
|                         | Architecture selection            | How is the best performance architecture selected?                               | In this solution we try to balance price and performance to achieve better cost efficiency, but not necessarily the best performance.  |
| Operational excellence  | Workload health                   | How is health of workload determined?                                            | We rely on the standard EC2 instance monitoring tool to detect stalled instances.  |
| Sustainability          | Hardware & services               | Select most efficient hardware for your workload                                 | We use ARM-powered EC2 instance type for better cost/performance balance.  |
</details>

<details>
<summary>Recommended Infrastructure</summary>

## Hardware Requirements

**Minimum for Base node sepolia**

- Instance type [m7g.2xlarge](https://aws.amazon.com/ec2/instance-types/m7g/).
- 1500GB EBS gp3 storage with at least 5000 IOPS.

**Recommended for Base node on mainnet**

- Instance type [m7g.2xlarge](https://aws.amazon.com/ec2/instance-types/m7g/).
- 4100GB EBS gp3 storage with at least 5000 IOPS.`

</details>

## Setup Instructions

### Setup Cloud9

We will use AWS Cloud9 to execute the subsequent commands. Follow the instructions in [Cloud9 Setup](../../docs/setup-cloud9.md)

### Make sure you have access to Ethereum L1 node

Base node needs a URL to a Full Ethereum Node to validate blocks it receives. You can run your own with [Ethereum node blueprint](https://aws-samples.github.io/aws-blockchain-node-runners/docs/Blueprints/Ethereum) or use [one of partners of Base](https://docs.base.org/tools/node-providers).

### On your Cloud9: Clone this repository and install dependencies

```bash
   git clone https://github.com/aws-samples/aws-blockchain-node-runners
   cd aws-blockchain-node-runners
   npm install
```

### From your Cloud9: Deploy required dependencies

1. Make sure you are in the root directory of the cloned repository

2. If you have deleted or don't have the default VPC, create default VPC

 ```bash
 aws ec2 create-default-vpc
 ```

   > NOTE:
   > You may see the following error if the default VPC already exists: `An error occurred (DefaultVpcAlreadyExists) when calling the CreateDefaultVpc operation: A Default VPC already exists for this account in this region.`. That means you can just continue with the following steps.

3. Configure your setup

    Create your own copy of `.env` file and edit it to update with your AWS Account ID and Region:
```bash
# Make sure you are in aws-blockchain-node-runners/lib/base
cd lib/base
pwd
cp ./sample-configs/.env-sample-rpc .env
nano .env
```

4. Deploy common components such as IAM role

```bash
pwd
# Make sure you are in aws-blockchain-node-runners/lib/base
npx cdk deploy base-common
```

   > IMPORTANT:
   > All AWS CDK v2 deployments use dedicated AWS resources to hold data during deployment. Therefore, your AWS account and Region must be [bootstrapped](https://docs.aws.amazon.com/cdk/v2/guide/bootstrapping.html) to create these resources before you can deploy. If you haven't already bootstrapped, issue the following command:
   > ```bash
   > cdk bootstrap aws://ACCOUNT-NUMBER/REGION
   > ```

### Option 1: Deploy Single Node

1. For L1 node you you can set your own URLs in `BASE_L1_EXECUTION_ENDPOINT` and `BASE_L1_CONSENSUS_ENDPOINT` properties of `.env` file. It can be one of [the providers recommended by Base](https://docs.base.org/tools/node-providers) or you can run your own Ethereum node [with Node Runner Ethereum blueprint](https://aws-samples.github.io/aws-blockchain-node-runners/docs/Blueprints/Ethereum) (tested with geth-lighthouse combination). For example:

```bash
#For Sepolia:
BASE_L1_EXECUTION_ENDPOINT="https://ethereum-sepolia-rpc.publicnode.com"
BASE_L1_CONSENSUS_ENDPOINT="https://ethereum-sepolia-beacon-api.publicnode.com"
```

2. Deploy Base RPC Node and wait for it to sync. For Full node on Mainnet it might take a day when using snapshots or about a week if syncing from block 0. You can use snapshots provided by the Base team by setting `BASE_RESTORE_FROM_SNAPSHOT="true"` in `.env` file.

```bash
pwd
# Make sure you are in aws-blockchain-node-runners/lib/base
npx cdk deploy base-single-node --json --outputs-file single-node-deploy.json
```
After deployment you can watch the progress with CloudWatch dashboard (see [Monitoring](#monitoring)) or check the progress manually. For manual access, use SSM to connect into EC2 first and watch the log like this:

```bash
export INSTANCE_ID=$(cat single-node-deploy.json | jq -r '..|.node-instance-id? | select(. != null)')
echo "INSTANCE_ID=" $INSTANCE_ID
export AWS_REGION=us-east-1
aws ssm start-session --target $INSTANCE_ID --region $AWS_REGION
echo Latest synced block behind by: $((($(date +%s)-$( \
curl -d '{"id":0,"jsonrpc":"2.0","method":"optimism_syncStatus"}' \
-H "Content-Type: application/json" http://localhost:7545 | \
jq -r .result.unsafe_l2.timestamp))/60)) minutes
```

3. Test Base RPC API
   Use curl to query from within the node instance:
```bash
export INSTANCE_ID=$(cat single-node-deploy.json | jq -r '..|.node-instance-id? | select(. != null)')
echo "INSTANCE_ID=" $INSTANCE_ID
export AWS_REGION=us-east-1
aws ssm start-session --target $INSTANCE_ID --region $AWS_REGION

curl -s -X POST -H "Content-Type: application/json" --data '{"jsonrpc":"2.0","method":"eth_blockNumber","params":[],"id":1}' http://localhost:8545
```

### Option 2: Highly Available RPC Nodes

1. For L1 node you you can set your own URLs in `BASE_L1_EXECUTION_ENDPOINT` and `BASE_L1_CONSENSUS_ENDPOINT` properties of `.env` file. It can be one of [the providers recommended by Base](https://docs.base.org/tools/node-providers) or you can run your own Ethereum node [with Node Runner Ethereum blueprint](https://aws-samples.github.io/aws-blockchain-node-runners/docs/Blueprints/Ethereum) (tested with geth-lighthouse combination). For example:

```bash
#For Sepolia:
BASE_L1_EXECUTION_ENDPOINT="https://ethereum-sepolia-rpc.publicnode.com"
BASE_L1_CONSENSUS_ENDPOINT="https://ethereum-sepolia-beacon-api.publicnode.com"
```

2. Deploy Base RPC Node and wait for it to sync. For Mainnet it might a day when using snapshots or about a week if syncing from block 0. You can use snapshots provided by the Base team by setting `BASE_RESTORE_FROM_SNAPSHOT="true"` in `.env` file.

   ```bash
      pwd
      # Make sure you are in aws-blockchain-node-runners/lib/base
      npx cdk deploy base-ha-nodes --json --outputs-file ha-nodes-deploy.json
   ```

2. Give the new RPC **full** nodes about 2-3 hours (24 hours for **archive** node) to initialize and then run the following query against the load balancer behind the RPC node created

   ```bash
      export RPC_ALB_URL=$(cat ha-nodes-deploy.json | jq -r '..|.alburl? | select(. != null)')
      echo $RPC_ALB_URL
   ```

   Periodically check [Geth Syncing Status](https://geth.ethereum.org/docs/fundamentals/logs#syncing). Run the following query from within the same VPC and against the private IP of the load balancer fronting your nodes:

   ```bash
   curl http://$RPC_ALB_URL:8545 -X POST -H "Content-Type: application/json" \
   --data '{"jsonrpc":"2.0","method":"eth_blockNumber","params":[],"id":1}'
   ```

**NOTE:** By default and for security reasons the load balancer is available only from within the default VPC in the region where it is deployed. It is not available from the Internet and is not open for external connections. Before opening it up please make sure you protect your RPC APIs.

### Monitoring
Every 5 minutes a script on the Base node publishes to CloudWatch service the metrics for current block for L1/L2 clients as well as blocks behind metric for L1 and minutes behind for L2. When the node is fully synced the blocks behind metric should get to 4 and minutes behind should get down to 0. To see the metrics for **single node only**:

- Navigate to CloudWatch service (make sure you are in the region you have specified for AWS_REGION)
- Open Dashboards and select `base-single-node-<network>-<your_ec2_instance_id>` from the list of dashboards.

Metrics for **ha nodes** configuration is not yet implemented (contributions are welcome!)

## From your Cloud9: Clear up and undeploy everything

1. Undeploy all Nodes and Common stacks

```bash
# Setting the AWS account id and region in case local .env file is lost
export AWS_ACCOUNT_ID=<your_target_AWS_account_id>
export AWS_REGION=<your_target_AWS_region>

pwd
# Make sure you are in aws-blockchain-node-runners/lib/base

# Undeploy Single Node
npx cdk destroy base-single-node

# Undeploy HA Nodes
npx cdk destroy base-ha-nodes

# Delete all common components like IAM role and Security Group
npx cdk destroy base-common
```

2. Follow steps to delete the Cloud9 instance in [Cloud9 Setup](../../doc/setup-cloud9.md)

## FAQ

1. How to check the logs of the clients running on my Base node?

   **Note:** In this tutorial we chose not to use SSH and use Session Manager instead. That allows you to log all sessions in AWS CloudTrail to see who logged into the server and when. If you receive an error saying `SessionManagerPlugin is not found`, [install Session Manager plugin for AWS CLI](https://docs.aws.amazon.com/systems-manager/latest/userguide/session-manager-working-with-install-plugin.html)

```bash
pwd
# Make sure you are in aws-blockchain-node-runners/lib/base

export INSTANCE_ID=$(cat single-node-deploy.json | jq -r '..|.nodeinstanceid? | select(. != null)')
echo "INSTANCE_ID=" $INSTANCE_ID
export AWS_REGION=us-east-1
aws ssm start-session --target $INSTANCE_ID --region $AWS_REGION
sudo su bcuser
# Geth logs:
docker logs --tail 50 node_geth_1 -f
# Base logs:
docker logs --tail 50 node_node_1 -f
```
2. How to check the logs from the EC2 user-data script?

```bash
pwd
# Make sure you are in aws-blockchain-node-runners/lib/base

export INSTANCE_ID=$(cat single-node-deploy.json | jq -r '..|.nodeinstanceid? | select(. != null)')
echo "INSTANCE_ID=" $INSTANCE_ID
export AWS_REGION=us-east-1
aws ssm start-session --target $INSTANCE_ID --region $AWS_REGION
sudo cat /var/log/cloud-init-output.log
```

3. How can I restart the Base node?

``` bash
export INSTANCE_ID=$(cat single-node-deploy.json | jq -r '..|.nodeinstanceid? | select(. != null)')
echo "INSTANCE_ID=" $INSTANCE_ID
export AWS_REGION=us-east-1
aws ssm start-session --target $INSTANCE_ID --region $AWS_REGION
sudo su bcuser
/usr/local/bin/docker-compose -f /home/bcuser/node/docker-compose.yml down && \
/usr/local/bin/docker-compose -f /home/bcuser/node/docker-compose.yml up -d
```
4. Where to find the key Base client directories?

   - The data directory is `/data`
