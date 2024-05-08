# Sample AWS Blockchain Node Runner app for Fantom Blockchain Nodes

| Contributed by |
|:--------------------:|
| [@ngl-aws](https://github.com/ngl-aws), [@frbrkoala](https://github.com/frbrkoala) |

[Fantom](https://fantom.foundation/) is a permissionless blockchain platform that supports EVM-compatible smart contracts and applications. It utilizes Delegated Proof of Stake (DPoS) and directed acyclic graphs (DAG) of event blocks to achieve fast transaction confirmation with asynchronous Byzantine fault tolerance (aBFT) guarantee.

This blueprint is designed to assist in deploying a single node or a Highly Available (HA) [Fantom read-only node](https://docs.fantom.foundation/node/tutorials/run-a-read-only-node) on AWS. It is intended for use in development, testing, or Proof of Concept purposes.

## Overview of Deployment Architectures

### Single Node setup
![Single Nodes Deployment](./doc/assets/Architecture-Single-Fantom-Node-Runners.drawio.png)

1. The AWS Cloud Development Kit (CDK) is used to deploy a single node. The CDK application stores assets like scripts and config files in S3 bucket to copy them to the EC2 instance when launching a Fantom Node.
2. A single RPC Fantom Fullnode is deployed within the [Default VPC](https://docs.aws.amazon.com/vpc/latest/userguide/default-vpc.html) and continuously synchronizes with the rest of nodes on Fantom Blockchain Network through an [Internet Gateway](https://docs.aws.amazon.com/vpc/latest/userguide/VPC_Internet_Gateway.html).
3. The Fantom node is accessed by dApps or development tools internally. JSON RPC API is not exposed to the Internet to protect the node from unauthorized access. dApps need to handle user authentication and API protection, like [in this example for dApps on AWS](https://aws.amazon.com/blogs/architecture/dapp-authentication-with-amazon-cognito-and-web3-proxy-with-amazon-api-gateway/).
4. The Fantom node sends various monitoring metrics for both the EC2 instance and the Fantom client to Amazon CloudWatch.

### Highly Available setup

![Highly Available Nodes Deployment](./doc/assets/Architecture-HA-Fantom-Node-Runners.drawio.png)

1. The CDK is used to deploy a highly available (HA) architecture. An S3 bucket is utilized to store [User data](https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/user-data.html) and other scripts and configuration files required when launching EC2 as the Fantom Node.
2. A set of RPC Fantom Fullnodes that are deployed within the [Auto Scaling Group](https://docs.aws.amazon.com/autoscaling/ec2/userguide/auto-scaling-groups.html) in the [Default VPC](https://docs.aws.amazon.com/vpc/latest/userguide/default-vpc.html) continuously synchronize with the rest of the nodes on Fantom Blockchain Network through an [Internet Gateway](https://docs.aws.amazon.com/vpc/latest/userguide/VPC_Internet_Gateway.html).
3. The Fantom nodes are accessed by dApps or development tools internally through an [Application Load Balancer](https://docs.aws.amazon.com/elasticloadbalancing/latest/application/introduction.html). JSON RPC API is not exposed to the Internet to protect nodes from unauthorized access. dApps need to handle user authentication and API protection, like [in this example for dApps on AWS](https://aws.amazon.com/blogs/architecture/dapp-authentication-with-amazon-cognito-and-web3-proxy-with-amazon-api-gateway/).
4. The Fantom nodes send various monitoring metrics for both the EC2 and the Fantom nodes to Amazon CloudWatch.

## Additional materials

<details>

<summary>Well-Architected Checklist</summary>

This is the Well-Architected checklist for Fantom nodes implementation of the AWS Blockchain Node Runner app. This checklist takes into account questions from the [AWS Well-Architected Framework](https://aws.amazon.com/architecture/well-architected/) which are relevant to this workload. Please feel free to add more checks from the framework if required for your workload.

| Pillar                  | Control                           | Question/Check                                                                   | Remarks |
|:------------------------|:----------------------------------|:---------------------------------------------------------------------------------|:----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| Security                | Network protection                | Are there unnecessary open ports in security groups?                             | Please note that ports 5050 (TCP/UDP) for Fantom are open to public to support P2P protocols. |
|                         |                                   | Traffic inspection                                                               | Traffic protection is not used in the solution. [AWS Web Applications Firewall (WAF)](https://docs.aws.amazon.com/waf/latest/developerguide/waf-chapter.html) could be implemented for traffic over HTTP(S), [AWS Shield](https://docs.aws.amazon.com/waf/latest/developerguide/shield-chapter.html) provides Distributed Denial of Service (DDoS) protection. Additional charges will apply. |
|                         | Compute protection                | Reduce attack surface                                                            | This solution uses Ubuntu 22.04 AMI(`Ubuntu 22.04.4`). You may choose to run hardening scripts on it. |
|                         |                                   | Enable people to perform actions at a distance                                   | This solution uses [AWS Systems Manager for terminal session](https://docs.aws.amazon.com/systems-manager/latest/userguide/session-manager-working-with-sessions-start.html#start-sys-console), not ssh ports. |
|                         | Data protection at rest           | Use encrypted Amazon Elastic Block Store (Amazon EBS) volumes                    | This solution uses encrypted Amazon EBS volumes. |
|                         | Data protection in transit        | Use TLS                                                                          | The AWS Application Load balancer currently uses HTTP listener. Create HTTPS listener with self signed certificate if TLS is desired. |
|                         | Authorization and access control  | Use instance profile with Amazon Elastic Compute Cloud (Amazon EC2) instances    | This solution uses AWS Identity and Access Management (AWS IAM) role instead of IAM user. |
|                         |                                   | Following principle of least privilege access                                    | In all node types, root user is not used (using special user "bcuser" instead). |
|                         | Application security              | Security focused development practices                                           | cdk-nag is being used with appropriate suppressions. |
| Cost optimization       | Service selection                 | Use cost effective resources                                                     | 1/ We use x86-based binaries. We recommend using the `m6a.2xlarge` EC2 instance type to optimize computational costs.  2/ Cost-effective EBS gp3 are used instead of io2. |
|                         | Cost awareness                    | Estimate costs                                                                   | Single RPC node with `m6a.2xlarge` EBS gp3 volumes about 4000 GB(1000 IOPS, 700 MBps/s throughput) with On-Demand pricing will cost around US$854.54 per month in the US East (N. Virginia) region. More cost-optimal option with 3 year EC2 Instance Savings plan the cost goes down to $594.15 USD. To create your own estimate use [AWS Pricing Calculator](https://calculator.aws/#/)                                                                                          |
| Reliability             | Resiliency implementation         | Withstand component failures                                                     | This solution uses AWS Application Load Balancer with RPC nodes for high availability. Newly provisioned Fantom nodes triggered by Auto Scaling get up and running in about 300 minutes.  |
|                         | Data backup                       | How is data backed up?                                                           | Considering blockchain data is replicated by nodes automatically and Fantom nodes sync from start within an hour, we don't use any additional mechanisms to backup the data. |
|                         | Resource monitoring               | How are workload resources monitored?                                            | Resources are being monitored using Amazon CloudWatch dashboards. Amazon CloudWatch custom metrics are being pushed via CloudWatch Agent.  |
| Performance efficiency  | Compute selection                 | How is compute solution selected?                                                | Compute solution is selected based on best price-performance, i.e. AWS Graviton-based Amazon EC2 instances. |
|                         | Storage selection                 | How is storage solution selected?                                                | Storage solution is selected based on best price-performance, i.e. gp3 Amazon EBS volumes with optimal IOPS and throughput. |
|                         | Architecture selection            | How is the best performance architecture selected?                               | We used a combination of recommendations from the Fantom community and our own testing. |
| Operational excellence  | Workload health                   | How is health of workload determined?                                            | Health of workload is determined via AWS Application Load Balancer Target Group Health Checks, on port 8845. |
| Sustainability          | Hardware & services               | Select most efficient hardware for your workload                                 | The solution uses Graviton-powered instances. There is a potential to use AWS Graviton-based Amazon EC2 instances which offer the best performance per watt of energy use in Amazon EC2. |
</details>

<details>

<summary>Recommended Infrastructure</summary>


| Usage pattern                                     | Ideal configuration                                                                                                      | Primary option on AWS                                                  | Config reference                                      |
|---------------------------------------------------|--------------------------------------------------------------------------------------------------------------------------|------------------------------------------------------------------------|-------------------------------------------------------|
| 1/ Fullnode                                       | 8 vCPU, 32 GB RAM, Data volume: EBS gp3 2TB, 7K IOPS, 400 MB/s throughput | `m6a.2xlarge` EBS gp3 volumes about 2000 GB(7000 IOPS, 400 MBps/s throughput) | [.env-sample-full](./sample-configs/.env-sample-full) |
</details>

## Setup Instructions

### Setup Cloud9

We will use AWS Cloud9 to execute the subsequent commands. Follow the instructions in [Cloud9 Setup](../../docs/setup-cloud9.md)

### Clone this repository and install dependencies

```bash
git clone https://github.com/aws-samples/aws-blockchain-node-runners.git
cd aws-blockchain-node-runners
npm install
```

### Deploy the HA Nodes

1. Make sure you are in the root directory of the cloned repository

2. If you have deleted or don't have the default VPC, create default VPC

    ```bash
    aws ec2 create-default-vpc
    ```

   > **NOTE**:
   > You may see the following error if the default VPC already exists: `An error occurred (DefaultVpcAlreadyExists) when calling the CreateDefaultVpc operation: A Default VPC already exists for this account in this region.`. That means you can just continue with the following steps.


3. Configure the CDK app

   Create your own copy of `.env` file and edit it to update with your AWS Account ID, AWS Region, and optionally the Fantom SNAPSHOTS URI:

   ```bash
   # Make sure you are in aws-blockchain-node-runners/lib/fantom
   cd lib/fantom
   pwd
   cp ./sample-configs/.env-sample-read .env
   nano .env
   ```
   > **IMPORTANT**:
   > 1. By default we use the latest Fantom snapshot from [Fantom](https://snapshot.fantom.network/files/snapsync/latest/listtgzfiles.txt)

4. Deploy common components such as IAM role

   ```bash
   pwd
   # Make sure you are in aws-blockchain-node-runners/lib/fantom
   npx cdk deploy fantom-common
   ```

   > **IMPORTANT**:
   > All AWS CDK v2 deployments use dedicated AWS resources to hold data during deployment. Therefore, your AWS account and Region must be [bootstrapped](https://docs.aws.amazon.com/cdk/v2/guide/bootstrapping.html) to create these resources before you can deploy. If you haven't already bootstrapped, issue the following command:
   > ```bash
   > cdk bootstrap aws://ACCOUNT-NUMBER/REGION

### Option 1: Single RPC Node

1. The inital deployment of a Fantom Fullnode and downloading its snapshot typically takes about 3-12 hours. The Full node uses snapshots data, and downloading and decompressing the data takes time. You can grab a cup of coffee☕️ and patiently wait during this process. Maybe two. After deployment, you'll need to wait for the node to synchronize with the Fantom Blockchain Network (next step).

   ```bash
      pwd
      # Make sure you are in aws-blockchain-node-runners/lib/fantom
      npx cdk deploy fantom-single-node --json --outputs-file single-node-deploy.json
   ```

2. After the node is initialised from the snapshot you need to wait from another half a day to a day for the inital syncronization process to complete. The time depends on how fresh the snapshot was. You can use Amazon CloudWatch to track the progress. There is a script that publishes CloudWatch metrics every 5 minutes, where you can watch `sync distance` for consensus client and `blocks behind` for execution client. When the node is fully synced those two metrics shold show 0. To see them:

    - Navigate to [CloudWatch service](https://console.aws.amazon.com/cloudwatch/) (make sure you are in the region you have specified for `AWS_REGION`)
    - Open `Dashboards` and select `fantom-single-node-<node_configuration>-<your_fantom_network>-<ec2_instance_id>` from the list of dashboards.

Alternatively, you can manually check [Geth Syncing Status](https://geth.ethereum.org/docs/fundamentals/logs#syncing). Run the following query from within the same VPC and against the private IP of the single RPC node you deployed:

   ```bash
      INSTANCE_ID=$(cat single-node-deploy.json | jq -r '..|.singleinstanceid? | select(. != null)')
      NODE_INTERNAL_IP=$(aws ec2 describe-instances --instance-ids $INSTANCE_ID --query 'Reservations[*].Instances[*].PrivateIpAddress' --output text --region us-east-1)

      curl http://$NODE_INTERNAL_IP:18545 -X POST -H "Content-Type: application/json" \
      --data '{"jsonrpc":"2.0","method":"eth_syncing","params":[],"id":1}'
   ```

   It will return `false` if the node is in sync. If `eth_syncing` returns anything other than false it has not finished syncing. Generally, if syncing is still ongoing, `eth_syncing` will return block info that looks as follows:

   ```javascript
   {
        "jsonrpc": "2.0",
        "id": 1,
        "result": {
                 "currentBlock": "0x211f0d8",
                 "healedBytecodeBytes": "0x0",
                 "healedBytecodes": "0x0",
                 "healedTrienodeBytes": "0x0",
                 "healedTrienodes": "0x0",
                 "healingBytecode": "0x0",
                 "healingTrienodes": "0x0",
                 "highestBlock": "0x2123bff",
                 "startingBlock": "0x20910d7",
                 "syncedAccountBytes": "0x0",
                 "syncedAccounts": "0x0",
                 "syncedBytecodeBytes": "0x0",
                 "syncedBytecodes": "0x0",
                 "syncedStorage": "0x0",
                 "syncedStorageBytes": "0x0"
        }
   }
   ```

3. Once the initial synchronization is done, you should be able to access the RPC API of that node from within the same VPC. The RPC port is not exposed to the Internet. Run the following query against the private IP of the single RPC node you deployed:

   ```bash
      INSTANCE_ID=$(cat single-node-deploy.json | jq -r '..|.singleinstanceid? | select(. != null)')
      NODE_INTERNAL_IP=$(aws ec2 describe-instances --instance-ids $INSTANCE_ID --query 'Reservations[*].Instances[*].PrivateIpAddress' --output text)

      # We query token balance of one of the system contracts: https://ftmscan.com/address/0x0000000000000000000000000000000000000001
      curl http://$NODE_INTERNAL_IP:18545 -X POST -H "Content-Type: application/json" \
      --data '{"method":"eth_getBalance","params":["0x0000000000000000000000000000000000000001", "latest"],"id":1,"jsonrpc":"2.0"}'
   ```
   You will get a response similar to this:

   ```json
      {"jsonrpc":"2.0","id":1,"result":"0xbe9fa76042c4daf622"}
   ```

### Option 2: Highly Available RPC Nodes

1. The inital deployment of a Fantom Fullnode and downloading its snapshot typically takes about 2-3 hours. The Full node uses snapshots data, and downloading and decompressing the data takes time. You can grab a cup of coffee☕️ and patiently wait during this process. Maybe two. After deployment, you'll need to wait for another half a day to a day for your nodes to synchronize with the Fantom Blockchain Network, depending on how fresh the snapshot was.

   ```bash
      pwd
      # Make sure you are in aws-blockchain-node-runners/lib/fantom
      npx cdk deploy fantom-ha-nodes --json --outputs-file ha-nodes-deploy.json
   ```

2. Give the new RPC nodes about few hours to initialize and then run the following query against the load balancer behind the RPC node created

   ```bash
      export RPC_ALB_URL=$(cat ha-nodes-deploy.json | jq -r '..|.alburl? | select(. != null)')
      echo $RPC_ALB_URL
   ```

   Periodically check [Fantom Syncing Status](https://docs.chainstack.com/reference/fantom-syncing). Run the following query from within the same VPC and against the private IP of the load balancer fronting your nodes:

   ```bash
   curl http://$RPC_ALB_URL:18545 -X POST -H "Content-Type: application/json" \
   --data '{"jsonrpc":"2.0","method":"eth_syncing","params":[],"id":1}'
   ```

   It will return `false` if the node is in sync. If `eth_syncing` returns anything other than false it has not finished syncing. Generally, if syncing is still ongoing, `eth_syncing` will return block info that looks as follows:

   ```javascript
   {
        "jsonrpc": "2.0",
        "id": 1,
        "result": {
                 "currentBlock": "0x211f0d8",
                 "healedBytecodeBytes": "0x0",
                 "healedBytecodes": "0x0",
                 "healedTrienodeBytes": "0x0",
                 "healedTrienodes": "0x0",
                 "healingBytecode": "0x0",
                 "healingTrienodes": "0x0",
                 "highestBlock": "0x2123bff",
                 "startingBlock": "0x20910d7",
                 "syncedAccountBytes": "0x0",
                 "syncedAccounts": "0x0",
                 "syncedBytecodeBytes": "0x0",
                 "syncedBytecodes": "0x0",
                 "syncedStorage": "0x0",
                 "syncedStorageBytes": "0x0"
        }
   }
   ```

**NOTE:** By default and for security reasons the load balancer is available only from inside the default VPC in the region where it is deployed. It is not available from the Internet and is not open for external connections. Before you consider opening it up to the internet, **please make sure you protect your RPC APIs**.

3. Once the initial synchronization is done, you should be able to access the RPC API of that node from within the same VPC. The RPC port is not exposed to the Internet. Run the following query against the private IP of the single RPC node you deployed:

   ```bash
      export RPC_ALB_URL=$(cat ha-nodes-deploy.json | jq -r '..|.alburl? | select(. != null)')
      echo $RPC_ALB_URL

      # We query token balance of one of the system contracts: https://ftmscan.com/address/0x0000000000000000000000000000000000000001
      curl http://$RPC_ALB_URL:18545 -X POST -H "Content-Type: application/json" \
      --data '{"method":"eth_getBalance","params":["0x0000000000000000000000000000000000000001", "latest"],"id":1,"jsonrpc":"2.0"}'
   ```
   You will get a response similar to this:

   ```json
      {"jsonrpc":"2.0","id":1,"result":"0xbe9fa76042c4daf622"}
   ```

### Clearing up and undeploy everything

1. Undeploy HA Nodes, Single Nodes and Common stacks

```bash
# Setting the AWS account id and region in case local .env file is lost
export AWS_ACCOUNT_ID=<your_target_AWS_account_id>
export AWS_REGION=<your_target_AWS_region>

pwd
# Make sure you are in aws-blockchain-node-runners/lib/fantom

# Undeploy Single Node
cdk destroy fantom-single-node

# Undeploy HA Nodes
cdk destroy fantom-ha-nodes

 # Delete all common components like IAM role and Security Group
cdk destroy fantom-common
```

2. Follow steps to delete the Cloud9 instance in [Cloud9 Setup](../../doc/setup-cloud9.md)

### FAQ

1. How to check the logs of the clients running on my sync node?

Please enter the [AWS Management Console - EC2 Instances](https://us-east-2.console.aws.amazon.com/ec2/home?region=us-east-2#Instances:instanceState=running), choose the correct region, copy the instance ID you need to query.

   **Note:** In this tutorial we chose not to use SSH and use Session Manager instead. That allows you to log all sessions in AWS CloudTrail to see who logged into the server and when. If you receive an error similar to `SessionManagerPlugin is not found`, [install Session Manager plugin for AWS CLI](https://docs.aws.amazon.com/systems-manager/latest/userguide/session-manager-working-with-install-plugin.html)

```bash
pwd
# Make sure you are in aws-blockchain-node-runners/lib/fantom

export INSTANCE_ID="i-**************"
echo "INSTANCE_ID=" $INSTANCE_ID
aws ssm start-session --target $INSTANCE_ID --region $AWS_REGION
sudo su ec2-user
sudo journalctl -o cat -fu fantom
```
2. How to check the logs from the EC2 user-data script?

Please enter the [AWS Management Console - EC2 Instances](https://us-east-2.console.aws.amazon.com/ec2/home?region=us-east-2#Instances:instanceState=running), choose the correct region, copy the instance ID you need to query.

```bash
pwd
# Make sure you are in aws-blockchain-node-runners/lib/fantom

export INSTANCE_ID="i-**************"
echo "INSTANCE_ID=" $INSTANCE_ID
aws ssm start-session --target $INSTANCE_ID --region $AWS_REGION
sudo cat /var/log/cloud-init-output.log
```

3. How can I restart the Fantom service?

Please enter the [AWS Management Console - EC2 Instances](https://us-east-2.console.aws.amazon.com/ec2/home?region=us-east-2#Instances:instanceState=running), choose the correct region, copy the instance ID you need to query.

```bash
pwd
# Make sure you are in aws-blockchain-node-runners/lib/fantom

export INSTANCE_ID="i-**************"
echo "INSTANCE_ID=" $INSTANCE_ID

aws ssm start-session --target $INSTANCE_ID --region $AWS_REGION
sudo systemctl stop fantom && sleep 20 && sudo systemctl start fantom
```
**NOTE:** You can also try the following command to obtain more information：
- Check the Fantom service status
  - `sudo systemctl status fantom`
- View Fantom service configuration
  - `cat /etc/systemd/system/fantom.service`

5. Where can I find more information about Fantom?

Please refer to the [Fantom Developer Documentation](https://docs.fantom.foundation/)

## Upgrades

When nodes need to be upgraded or downgraded, [use blue/green pattern to do it](https://aws.amazon.com/blogs/devops/performing-bluegreen-deployments-with-aws-codedeploy-and-auto-scaling-groups/). This is not yet automated and contributions are welcome!
