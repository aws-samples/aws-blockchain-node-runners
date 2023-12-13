# Sample AWS Blockchain Node Runner app for Scroll Nodes

This is RPC Scroll nodes (L2Geth) setup on AWS guide. 

## Overview of Deployment Architectures for Single Node setups

### Single node setup

![Single Node Deployment](./doc/assets/Architecture-SingleNode-v3.jpg)

1.	A Scroll node deployed in the [Default VPC](https://docs.aws.amazon.com/vpc/latest/userguide/default-vpc.html) continuously synchronizes with the rest of nodes on [Scroll Clusters](https://docs.scroll.com/clusters) through [Internet Gateway](https://docs.aws.amazon.com/vpc/latest/userguide/VPC_Internet_Gateway.html).
2.	The Scroll node is used by dApps or development tools internally from within the Default VPC. JSON RPC API is not exposed to the Internet directly to protect nodes from unauthorized access.
3. You will need access to a fully-synced Ethereum Mainnet RPC endpoint before running l2geth.
4. The Scroll node sends various monitoring metrics for both EC2 and Scroll nodes to Amazon CloudWatch.


## Additional materials

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

   > NOTE:
   > You may see the following error if the default VPC already exists: `An error occurred (DefaultVpcAlreadyExists) when calling the CreateDefaultVpc operation: A Default VPC already exists for this account in this region.`. That means you can just continue with the following steps.

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
   > NOTE:
   > Example configuration parameters are set in the local `.env-sample` file. You can find more examples inside `sample-configs` directory.

   > NOTE:
   > You will need access to a fully-synced Ethereum Mainnet RPC endpoint before running l2geth. Please be reminded to update `L2GETH_L1_ENDPOINT` in `.env` file.


4. Deploy common components such as IAM role, and Amazon S3 bucket to store data snapshots

   ```bash
   pwd
   # Make sure you are in aws-blockchain-node-runners/lib/scroll
   npx cdk deploy scroll-common
   ```

   > IMPORTANT:
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

    

## Accessing the RPC Node
After starting the node you will need to wait for the initial synchronization process to finish.To see the progress, you may use SSM to connect into EC2 first. Here is a guide: "[Connect to your Linux instance with AWS Systems Manager Session Manager](https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/session-manager-to-linux.html)".

After connecting to the EC2, you may use the following commend to trace the init synchronization process:
```bash
tail -f /var/log/scroll/error.log
```
When the process complete, you will see `L1 message initial sync completed` in the log:
```bash
INFO [12-13|08:25:46.095] Syncing L1 messages                      processed=18,683,700 confirmed=18,775,938 collected=77348 progress(%)=99.509
INFO [12-13|08:25:56.165] Syncing L1 messages                      processed=18,699,700 confirmed=18,775,938 collected=78100 progress(%)=99.594
INFO [12-13|08:26:06.122] Syncing L1 messages                      processed=18,709,300 confirmed=18,775,938 collected=79042 progress(%)=99.645
INFO [12-13|08:26:16.107] Syncing L1 messages                      processed=18,729,400 confirmed=18,775,938 collected=79585 progress(%)=99.752
INFO [12-13|08:26:26.127] Syncing L1 messages                      processed=18,741,900 confirmed=18,775,938 collected=80688 progress(%)=99.819
INFO [12-13|08:26:36.208] Syncing L1 messages                      processed=18,750,200 confirmed=18,775,938 collected=82535 progress(%)=99.863
INFO [12-13|08:26:46.124] Syncing L1 messages                      processed=18,755,400 confirmed=18,775,938 collected=84176 progress(%)=99.891
INFO [12-13|08:26:56.120] Syncing L1 messages                      processed=18,768,200 confirmed=18,775,938 collected=85240 progress(%)=99.959
INFO [12-13|08:27:00.524] L1 message initial sync completed        latestProcessedBlock=18,775,938
```

### Connecgting to Geth IPC
Once the synchronization process is completed. You can now attach to l2geth.
```bash
sudo su - ubuntu
cd /home/ubuntu/l2geth-source/
alias l2geth=./build/bin/geth
l2geth attach "./l2geth-datadir/geth.ipc"

> admin.peers.length
14

> eth.blockNumber
10000
```

### l2geth directory
The agent direct is located in `/home/ubuntu/l2geth-source`. You may use the following cmd for start/ stop the service.
```bash
sudo systemctl restart scroll.service
sudo systemctl status scroll.service
sudo systemctl stop scroll.service
```
The data directory of l2geth agent is under:
```bash
cd /home/ubuntu/l2geth-source/l2geth-datadir
du -sch ./*
```

### Monitoring
 It may take about 30 minutes and you can use Amazon CloudWatch to track the progress. There is a script that publishes CloudWatch metrics every 5 minutes, where you can watch current block and slots behind metrics. When the node is fully synced the slots behind metric should go to 0. To see them:

Navigate to CloudWatch service (make sure you are in the region you have specified for AWS_REGION)
Open Dashboards and select scroll-single-node from the list of dashboards.

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
   $INSTANCE_ID=i-xxxxxxxxxxxxx
   $AWS_REGION=us-east-1
   aws ssm start-session --target $INSTANCE_ID --region $AWS_REGION
   sudo systemctl status scroll.service
   sudo systemctl restart scroll.service
   ```

## Upgrades
When nodes need to be upgraded or downgraded, [use blue/green pattern to do it](https://aws.amazon.com/blogs/devops/performing-bluegreen-deployments-with-aws-codedeploy-and-auto-scaling-groups/). This is not yet automated and contributions are welcome!
