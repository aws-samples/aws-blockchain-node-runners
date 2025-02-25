# Sample AWS Blockchain Node Runner app for XRP Nodes

|          Contributed by          |
|:--------------------------------:|
| Pedro Aceves <br/>acevespa@amazon.com |

XRP node deployment on AWS. All nodes are configure as ["Stock Servers"](https://xrpl.org/docs/infrastructure/configuration/server-modes/run-rippled-as-a-stock-server)

## Overview of Deployment Architectures for Single and HA setups

### Single node setup

![Single Node Deployment](./doc/assets/Architecture-Single%20node.drawio.png)

1.	A XRP node deployed in the [Default VPC](https://docs.aws.amazon.com/vpc/latest/userguide/default-vpc.html) continuously synchronizes with the rest of nodes on the configured xrp network through [Internet Gateway](https://docs.aws.amazon.com/vpc/latest/userguide/VPC_Internet_Gateway.html).
2.	The XRP node is used by dApps or development tools internally from within the Default VPC. RPC API is not exposed to the Internet directly to protect nodes from unauthorized access.
3.  The XRP node sends various monitoring metrics for both EC2 and current XRP ledger sequence to Amazon CloudWatch. It also updates the dashboard with correct storage device names to display respective metrics properly.

### HA setup

![Highly Available Nodes Deployment](./doc/assets/Architecture-HA%20Nodes.drawio.png)

1.	A set of XRP nodes are deployed within an [Auto Scaling Group](https://docs.aws.amazon.com/autoscaling/ec2/userguide/auto-scaling-groups.html) in the [Default VPC](https://docs.aws.amazon.com/vpc/latest/userguide/default-vpc.html) continuously synchronizing with the rest of nodes on the configured xrp network through [Internet Gateway](https://docs.aws.amazon.com/vpc/latest/userguide/VPC_Internet_Gateway.html).
2.	The XRP nodes are accessed by dApps or development tools internally through [Application Load Balancer](https://docs.aws.amazon.com/elasticloadbalancing/latest/application/introduction.html). RPC API is not exposed to the Internet to protect nodes from unauthorized access.
3.	The XRP nodes send various monitoring metrics for EC2 to Amazon CloudWatch.

## Setup Instructions

### Open AWS CloudShell

To begin, ensure you login to your AWS account with permissions to create and modify resources in IAM, EC2, EBS, VPC, S3, KMS, and Secrets Manager.

From the AWS Management Console, open the [AWS CloudShell](https://docs.aws.amazon.com/cloudshell/latest/userguide/welcome.html), a web-based shell environment. If unfamiliar, review the [2-minute YouTube video](https://youtu.be/fz4rbjRaiQM) for an overview and check out [CloudShell with VPC environment](https://docs.aws.amazon.com/cloudshell/latest/userguide/creating-vpc-environment.html) that we'll use to test nodes API from internal IP address space.

Once ready, you can run the commands to deploy and test blueprints in the CloudShell.

### Clone this repository and install dependencies

```bash
git clone https://github.com/aws-samples/aws-blockchain-node-runners.git
cd aws-blockchain-node-runners
npm install
```

### Configure your setup

1. Make sure you are in the root directory of the cloned repository

2. If you have deleted or don't have the default VPC, create default VPC

```bash
aws ec2 create-default-vpc
```

> **NOTE:** *You may see the following error if the default VPC already exists: `An error occurred (DefaultVpcAlreadyExists) when calling the CreateDefaultVpc operation: A Default VPC already exists for this account in this region.`. That means you can just continue with the following steps.*

3. Configure  your setup

Create your own copy of `.env` file and edit it to update with your AWS Account ID and Region:
```bash
cd lib/xrp
cp ./sample-configs/.env-sample-testnet .env
nano .env
```
> **NOTE:** *You can find more examples inside `sample-configs` *


4. Deploy common components such as IAM role:

```bash
npx cdk deploy XRP-common
```


### Deploy a Single Node

1. Deploy the node

```bash
npx cdk deploy XRP-single-node --json --outputs-file single-node-deploy.json
```

2. After starting the node you need to wait for the initial synchronization process to finish. You can use Amazon CloudWatch to track the progress. There is a script that publishes CloudWatch metrics every 5 minutes, where you can watch `XRP Sequence` metrics. When the node is fully synced the sequence should match that of the configured xrp network (testnet, mainnet, etc). To see them:

    - Navigate to [CloudWatch service](https://console.aws.amazon.com/cloudwatch/) (make sure you are in the region you have specified for `AWS_REGION`)
    - Open `Dashboards` and select dashboard that starts with `XRP-single-node` from the list of dashboards.

### Deploy HA Nodes

1. Deploy multiple HA Nodes

```bash
pwd
# Make sure you are in aws-blockchain-node-runners/lib/xrp
npx cdk deploy XRP-ha-nodes --json --outputs-file ha-nodes-deploy.json
```

2. Give the new  nodes time to initialize

> **NOTE:** *By default and for security reasons the load balancer is available only from within the default VPC in the region where it is deployed. It is not available from the Internet and is not open for external connections. Before opening it up please make sure you protect your RPC APIs.*

### Cleaning up and undeploying everything

Destroy HA Nodes, Single Nodes and Common stacks

```bash
# Setting the AWS account id and region in case local .env file is lost
 export AWS_ACCOUNT_ID=<your_target_AWS_account_id>
 export AWS_REGION=<your_target_AWS_region>

pwd
# Make sure you are in aws-blockchain-node-runners/lib/xrp

# Destroy HA Nodes
cdk destroy XRP-ha-nodes

# Destroy Single Node
cdk destroy XRP-single-node

# Delete all common components like IAM role and Security Group
cdk destroy XRP-common
```

### FAQ

1. How to check the logs from the EC2 user-data script?

```bash
pwd
# Make sure you are in aws-blockchain-node-runners/lib/xrp

export INSTANCE_ID=$(cat single-node-deploy.json | jq -r '.["XRP-single-node"].nodeinstanceid')
echo "INSTANCE_ID=" $INSTANCE_ID
aws ssm start-session --target $INSTANCE_ID --region $AWS_REGION
sudo cat /var/log/cloud-init-output.log
sudo cat /var/log/user-data.log
```
2. How can I change rippled (XRP) configuration?  
   There are two places of configuration for the xrp nodes:

   a. `.env` file. Here is where you specify the xrp network you want. This is the key for the config in part b

      ```bash
      HUB_NETWORK_ID="testnet"
      ```

   b. `lib/xrp/lib/assets/rippled/rippledconfig.py` file. Here you can setup listeners and network configuration for the network specified in part "a"
