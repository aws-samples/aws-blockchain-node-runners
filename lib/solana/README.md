# Sample AWS Blockchain Node Runner app for Solana Nodes

Solana nodes on AWS can be deployes in 3 different configurations: Validator, Light RPC and Heavy RPC. In addition, you can choose to deploy those configurations as a single node or a highly available (HA) nodes setup. Learn more about configurations on [Solana on AWS documentation page](https://docs.solana.com/TBA) and below are the details on single node and HA deployment setups.

## Overview of Deployment Architectures for Single and HA setups

### Single node setup

![Single Node Deployment](./doc/assets/Architecture-SingleNode.drawio.png)

1.	A Solana node deployed in the [Default VPC](https://docs.aws.amazon.com/vpc/latest/userguide/default-vpc.html) continuesly synchronizes with the rest of nodes on [Solana Clusters](https://docs.solana.com/clusters) through [Internet Gateway](https://docs.aws.amazon.com/vpc/latest/userguide/VPC_Internet_Gateway.html).
2.	The Solana node is used by dApps or development tools internally from within the Default VPC. JSON RPC API is not exposed to the Internet directly to protect nodes from unauthorized access.
3.	The Solanna node uses all required secrets locally, but stores a copy in [AWS Secrets Manager](https://docs.aws.amazon.com/secretsmanager/latest/userguide/intro.html) as secure backup.
4.	The Solana node sends various monitoring metrics for both EC2 and Solana nodes to Amazon CloudWatch.

### HA setup

![Highly Available Nodes Deployment](./doc/assets/Architecture-HANodes.drawio.png)
1.	A set of Solana nodes are deployed within the [Auto Scaling Group](https://docs.aws.amazon.com/autoscaling/ec2/userguide/auto-scaling-groups.html) in the [Default VPC](https://docs.aws.amazon.com/vpc/latest/userguide/default-vpc.html) continuesly synchronizes with the rest of nodes on [Solana Clusters](https://docs.solana.com/clusters) through [Internet Gateway](https://docs.aws.amazon.com/vpc/latest/userguide/VPC_Internet_Gateway.html).
2.	The Solana nodes are accessed by dApps or development tools internallythrough [Application Load Balancer](https://docs.aws.amazon.com/elasticloadbalancing/latest/application/introduction.html). JSON RPC API is not exposed to the Internet to protect nodes from unauthorized access. dApps need to handle user authentication and API protection, like [in this example for dApps on AWS](https://aws.amazon.com/blogs/architecture/dapp-authentication-with-amazon-cognito-and-web3-proxy-with-amazon-api-gateway/).
3.	The Solanna nodes use all required secrets locally, but store a copy in [AWS Secrets Manager](https://docs.aws.amazon.com/secretsmanager/latest/userguide/intro.html) as secure backup.
4.	The Solana nodes send various monitoring metrics for both EC2 and Solana nodes to Amazon CloudWatch.

## Managing Secrets
During the startup, if a node can't find the necessary identity file on the attached Root EBS volume, it generates a new one and stores it in AWS Secrets Manager. For a single-node deployment, the ARN of a secret can be provided within the `.env` configuration file with configuration and the node will pick it up.

Solana node in Light RPC or Heavy RPC configuration, it uses only 1 secret: 

- **Solana Node Identity Secret**: The identity key pair for a Solana node.

A node in Validator configuration uses up to 3 more identity secrets:

- **Vote Account Secret**: The [Validator Identity's key pair](https://docs.solana.com/running-validator/vote-accounts#validator-identity).

- **Authorized Withdrawer Account Secret**: The [Authorized Withdrawer key pair](https://docs.solana.com/running-validator/vote-accounts#authorized-withdrawer).

- **Registration Transaction Funding Account Secret**: An account that has sufficient SOL to pay for on-chain validator creation transaction. If not present, the node provisioning script assumes the on-chain validator creation transaction was issued elsewhere and will skip it.

## Well-Architected

Review the [Well-Architected Checklist](./doc/assets/Well_Architected.md) for pros and cons of this solution.

## Solution Walkthrough

### Setup Cloud9

We will use AWS Cloud9 to execute the subsequent commands. Follow the instructions in [Cloud9 Setup](../../doc/setup-cloud9.md)

### Clone this repository and install dependencies

```bash
   git clone https://github.com/aws-samples/aws-blockchain-node-runners.git
   cd aws-blockchain-node-runners
   npm install
```

### Deploy Single Node

1. Make sure you are in the root directory of the cloned repository

2. If you have deleted or don't have the default VPC, create default VPC

```bash
    aws ec2 create-default-vpc
   ```

   **NOTE:** You may see the following error if the default VPC already exists: `An error occurred (DefaultVpcAlreadyExists) when calling the CreateDefaultVpc operation: A Default VPC already exists for this account in this region.`. That means you can just continue with the following steps.

3. Configure  your setup

Create your own copy of `.env` file and edit it:
```bash
   # Make sure you are in aws-blockchain-node-runners/lib/solana
   cd lib/solana
   pwd
   cp .env-sample .env
   nano .env
```
   **NOTE:** Example configuration parameters are set in the local `.env-sample` file. You can find more examples inside `sample-configs` directory.


4. Deploy common components such as IAM role, and Amazon S3 bucket to store data snapshots

```bash
   pwd
   # Make sure you are in aws-blockchain-node-runners/lib/solana
   npx cdk deploy solana-common
```

5. Deploy Sync Node

```bash
   pwd
   # Make sure you are in aws-blockchain-node-runners/lib/solana
   npx cdk deploy solana-single-node --json --outputs-file single-node-deploy.json
```

6. After starting the node you need to wait for the inital syncronization process to finish. It may take about 30 minutes and you can use Amazon CloudWatch to track the progress. There is a script that publishes CloudWatch metrics every 5 minutes, where you can watch `current block` and `slots behind` metrics. When the node is fully synced the `slots behind` metric should go to 0. To see them:

    - Navigate to [CloudWatch service](https://console.aws.amazon.com/cloudwatch/) (make sure you are in the region you have specified for `AWS_REGION`)
    - Open `Dashboards` and select `solana-single-node` from the list of dashboards.

### Deploy the HA Nodes

1. Configure and deploy 2 HA Nodes

```bash
   pwd
   # Make sure you are in aws-blockchain-node-runners/lib/solana
   npx cdk deploy solana-ha-nodes --json --outputs-file ha-nodes-deploy.json
```

2. Give the new RPC nodes about 30 minutes to initialize and then run the following query against the load balancer behind the RPC node created

```bash
    export RPC_ABL_URL=$(cat ha-nodes-deploy.json | jq -r '..|.ALBURL? | select(. != null)')
    echo $RPC_ABL_URL
    
    # We query token balance this account: https://solanabeach.io/address/9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM
    curl http://$RPC_ABL_URL:8899 -X POST -H "Content-Type: application/json" \
    --data '{ "jsonrpc": "2.0", "id": 1, "method": "getBalance", "params": ["9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM"]}'
```

The result should be like this (the actual balance might change):

```javascript
   {"jsonrpc":"2.0","id":1,"result":"14,870,473.061882488SOL
"}
```

   If the nodes are still starting and catching up with the chain, you will see the following repsonse:

```HTML
   <html>
   <head><title>503 Service Temporarily Unavailable</title></head>
   <body>
   <center><h1>503 Service Temporarily Unavailable</h1></center>
   </body>
```

**NOTE:** By default and for security reasons the load balancer is available only from wihtin the default VPC in the region where it is deployed. It is not available from the Internet and is not open for external connections. Before opening it up please make sure you protect your RPC APIs. 

### Clearing up and undeploying everything

1. Undeploy RPC Nodes, Sync Nodes and Comon components

```bash
   # Setting the AWS account id and region in case local .env file is lost
    export AWS_ACCOUNT_ID=<your_target_AWS_account_id>
    export AWS_REGION=<your_target_AWS_region>
   
   pwd
   # Make sure you are in aws-blockchain-node-runners/lib/solana
   
   # Undeploy HA Nodes
    cdk destroy solana-ha-nodes

    # Undeploy Single Node
    cdk destroy sync-single-node

    # Delete all common components like IAM role and Security Group
    cdk destroy solana-common
```

2. Follow steps to delete the Cloud9 instance in [Cloud9 Setup](../../doc/setup-cloud9.md)

### FAQ

1. How to check the logs of the clients running on my sync node?

   **Note:** In this tutorial we chose not to use SSH and use Session Manager instead. That allows you to log all sessions in AWS CloudTrail to see who logged into the server and when. If you receive an error similar to `SessionManagerPlugin is not found`, [install Session Manager plugin for AWS CLI](https://docs.aws.amazon.com/systems-manager/latest/userguide/session-manager-working-with-install-plugin.html)

```bash
   pwd
   # Make sure you are in aws-blockchain-node-runners/lib/solana

   export INSTANCE_ID=$(cat single-node-deploy.json | jq -r '..|.node-instance-id? | select(. != null)')
   echo "INSTANCE_ID=" $INSTANCE_ID
   aws ssm start-session --target $INSTANCE_ID --region $AWS_REGION
   sudo su bcuser
   sudo journalctl -o cat -fu sol
```
2. How to check the logs from the EC2 user-data script?

```bash
   pwd
   # Make sure you are in aws-blockchain-node-runners/lib/solana

   export INSTANCE_ID=$(cat single-node-deploy.json | jq -r '..|.node-instance-id? | select(. != null)')
   echo "INSTANCE_ID=" $INSTANCE_ID
   aws ssm start-session --target $INSTANCE_ID --region $AWS_REGION
   sudo cat /var/log/cloud-init-output.log
```

3. How can I restart the Solana serice?

``` bash
   export INSTANCE_ID=$(cat single-node-deploy.json | jq -r '..|.node-instance-id? | select(. != null)')
   echo "INSTANCE_ID=" $INSTANCE_ID
   aws ssm start-session --target $INSTANCE_ID --region $AWS_REGION
   sudo systemctl status sol
```

## Upgrades

When nodes need to be upgraded or downgraded, [use blue/green pattern to do it](https://aws.amazon.com/blogs/devops/performing-bluegreen-deployments-with-aws-codedeploy-and-auto-scaling-groups/). This is not yet automated and contributions are welcome!