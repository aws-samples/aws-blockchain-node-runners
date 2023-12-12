# Sample AWS Blockchain Node Runner app for Scroll Nodes

This is RPC Scroll nodes setup on AWS guide. In addition, you can choose to deploy those configurations as a single node setup. 

## Overview of Deployment Architectures for Single Node setups

### Single node setup

![Single Node Deployment](./doc/assets/Architecture-SingleNode_v2.jpg)

1.	A Scroll node deployed in the [Default VPC](https://docs.aws.amazon.com/vpc/latest/userguide/default-vpc.html) continuously synchronizes with the rest of nodes on [Scroll Clusters](https://docs.scroll.com/clusters) through [Internet Gateway](https://docs.aws.amazon.com/vpc/latest/userguide/VPC_Internet_Gateway.html).
2.	The Scroll node is used by dApps or development tools internally from within the Default VPC. JSON RPC API is not exposed to the Internet directly to protect nodes from unauthorized access.
3.	The Scroll node uses all required secrets locally, but stores a copy in [AWS Secrets Manager](https://docs.aws.amazon.com/secretsmanager/latest/userguide/intro.html) as secure backup.
4.  You will need access to a fully-synced Ethereum Mainnet RPC endpoint before running l2geth.
5.  The Scroll node sends various monitoring metrics for both EC2 and Scroll nodes to Amazon CloudWatch.


## Additional materials

<details>

<summary>Managing Secrets</summary>

During the startup, if a node can't find the necessary identity file on the attached Root EBS volume, it generates a new one and stores it in AWS Secrets Manager. For a single-node deployment, the ARN of a secret can be provided within the `.env` configuration file with configuration and the node will pick it up.

Base RPC and Extended RPC nodes use only 1 secret:

- **Scroll Node Identity Secret**: The identity key pair for a Scroll node.

Consensus node uses up to 3 more identity secrets:

- **Vote Account Secret**: The [Validator Identity's key pair](https://docs.scroll.com/running-validator/vote-accounts#validator-identity).

- **Authorized Withdrawer Account Secret**: The [Authorized Withdrawer key pair](https://docs.scroll.com/running-validator/vote-accounts#authorized-withdrawer).

- **Registration Transaction Funding Account Secret**: An account that has sufficient SOL to pay for on-chain validator creation transaction. If not present, the node provisioning script assumes the on-chain validator creation transaction was issued elsewhere and will skip it.

</details>

<details>

<summary>Recommended Infrastructure</summary>

## Hardware Requirements

**Minimum**

- Machine comparable to AWS `t3.large` [instance](https://aws.amazon.com/ec2/instance-types/t3/).
- 500GB SSD storage.

**Recommended**

- Machine comparable to AWS `t3.2xlarge` [instance](https://aws.amazon.com/ec2/instance-types/t3/).
- 1TB SSD storage.`
</details>

## Setup Instructions

### Setup Cloud9

We will use AWS Cloud9 to execute the subsequent commands. Follow the instructions in [Cloud9 Setup](../../docs/setup-cloud9.md)

### Clone this repository and install dependencies

```bash
   git clone https://github.com/alickwong/aws-blockchain-node-runners
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

3. Configure your setup

Create your own copy of `.env` file and edit it to update with your AWS Account ID and Region:
```bash
   # Make sure you are in aws-blockchain-node-runners/lib/scroll
   cd lib/scroll
   npm install
   pwd
   cp ./sample-configs/.env-sample-baserpc .env
   nano .env
```
> [!NOTE]
> Example configuration parameters are set in the local `.env-sample` file. You can find more examples inside `sample-configs` directory.

> [!NOTE]
> You will need access to a fully-synced Ethereum Mainnet RPC endpoint before running l2geth. Please be reminded to update `L2GETH_L1_ENDPOINT` in `.env` file.


4. Deploy common components such as IAM role, and Amazon S3 bucket to store data snapshots

```bash
   pwd
   # Make sure you are in aws-blockchain-node-runners/lib/scroll
   npx cdk deploy scroll-common
```

> [!IMPORTANT]
> All AWS CDK v2 deployments use dedicated AWS resources to hold data during deployment. Therefore, your AWS account and Region must be [bootstrapped](https://docs.aws.amazon.com/cdk/v2/guide/bootstrapping.html) to create these resources before you can deploy. If you haven't already bootstrapped, issue the following command:
> ```angular2html 
> cdk bootstrap aws://ACCOUNT-NUMBER/REGION
> ```

5. Deploy Sync Node

```bash
   pwd
   # Make sure you are in aws-blockchain-node-runners/lib/scroll
   npx cdk deploy scroll-single-node --json --outputs-file single-node-deploy.json
```

6. After starting the node you need to wait for the initial synchronization process to finish. It may take about 30 minutes and you can use Amazon CloudWatch to track the progress. There is a script that publishes CloudWatch metrics every 5 minutes, where you can watch `current block` and `slots behind` metrics. When the node is fully synced the `slots behind` metric should go to 0. To see them:

    - Navigate to [CloudWatch service](https://console.aws.amazon.com/cloudwatch/) (make sure you are in the region you have specified for `AWS_REGION`)
    - Open `Dashboards` and select `scroll-single-node` from the list of dashboards.

## Accessing the RPC Node
Since SSM agent is installed and configured in the EC2. You may reference "[Connect to your Linux instance with AWS Systems Manager Session Manager](https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/session-manager-to-linux.html)".

### l2geth Agent
The agent direct is located in `/home/ubuntu/l2geth-source`. You may use the following cmd for start/ stop the service.
```bash
sudo systemctl restart scroll.service
sudo systemctl status scroll.service
sudo systemctl stop scroll.service
```
The data director of l2geth agent is under:
```bash
/home/ubuntu/l2geth-source/l2geth-datadir
```


## Clearing up and undeploy everything

1. Undeploy HA Nodes, Single Nodes and Common stacks

```bash
   # Setting the AWS account id and region in case local .env file is lost
    export AWS_ACCOUNT_ID=<your_target_AWS_account_id>
    export AWS_REGION=<your_target_AWS_region>

   pwd
   # Make sure you are in aws-blockchain-node-runners/lib/scroll

   # Undeploy Single Node
   cdk destroy scroll-single-node

   # Delete all common components like IAM role and Security Group
   cdk destroy scroll-common
```

2. Follow steps to delete the Cloud9 instance in [Cloud9 Setup](../../doc/setup-cloud9.md)

## FAQ

1. How to check the logs of the clients running on my sync node?

   **Note:** In this tutorial we chose not to use SSH and use Session Manager instead. That allows you to log all sessions in AWS CloudTrail to see who logged into the server and when. If you receive an error similar to `SessionManagerPlugin is not found`, [install Session Manager plugin for AWS CLI](https://docs.aws.amazon.com/systems-manager/latest/userguide/session-manager-working-with-install-plugin.html)

```bash
   pwd
   # Make sure you are in aws-blockchain-node-runners/lib/scroll

   export INSTANCE_ID=$(cat single-node-deploy.json | jq -r '..|.node-instance-id? | select(. != null)')
   echo "INSTANCE_ID=" $INSTANCE_ID
   aws ssm start-session --target $INSTANCE_ID --region $AWS_REGION
   sudo su bcuser
   sudo journalctl -o cat -fu sol
```
2. How to check the logs from the EC2 user-data script?

```bash
   pwd
   # Make sure you are in aws-blockchain-node-runners/lib/scroll

   export INSTANCE_ID=$(cat single-node-deploy.json | jq -r '..|.node-instance-id? | select(. != null)')
   echo "INSTANCE_ID=" $INSTANCE_ID
   aws ssm start-session --target $INSTANCE_ID --region $AWS_REGION
   sudo cat /var/log/cloud-init-output.log
```

3. How can I restart the Scroll service?

``` bash
   export INSTANCE_ID=$(cat single-node-deploy.json | jq -r '..|.node-instance-id? | select(. != null)')
   echo "INSTANCE_ID=" $INSTANCE_ID
   aws ssm start-session --target $INSTANCE_ID --region $AWS_REGION
   sudo systemctl status sol
```
4. How to upload a secret to AWS Secrets Manager?
```bash
    # Create key pair
    sudo ./scroll-keygen new --no-passphrase -o /tmp/keypair.json
    SCROLL_ADDRESS=$(sudo ./scroll-keygen pubkey /tmp/keypair.json)
    # Upload key pair to AWS Secrets Manager"
    export AWS_REGION=<your_region>
    sudo aws secretsmanager create-secret --name "scroll/"$SCROLL_ADDRESS --description "Scroll secret key pair" --secret-string file:///tmp/keypair.json --region $AWS_REGION
    #Delete key pair from the local file system
    rm -rf /tmp/keypair.json

```

## Upgrades

When nodes need to be upgraded or downgraded, [use blue/green pattern to do it](https://aws.amazon.com/blogs/devops/performing-bluegreen-deployments-with-aws-codedeploy-and-auto-scaling-groups/). This is not yet automated and contributions are welcome!
