# Sample AWS Blockchain Node Runner app for Polygon Nodes

## Architecture Overview

![Architecture](./doc/assets/Architecture.png)

1.	A dedicated Amazon Elastic Compute Cloud (EC2) instance (“sync node”) downloads and unarchives the snapshot data to from Polygon Snapshot service to its local storage.
2.	The sync node uploads Polygon extracted snapshot data to the S3 bucket.
3.	A set of EC2 instances (“RPC nodes”) are spun up by Auto Scaling Group to serve JSON RPC API requests from dApps and download snapshot data from S3 bucket to initialize the node data storage.
4.	The new RPC nodes catch up with the rest of the nodes syncing the new data added after the snapshot was created.
5.	The dApps and developers use highly available RPC nodes through Application Load Balancer.


## Well-Architected

Review the ![Well-Architected Checklist](./doc/assets/Well_Architected.md) for pros and cons of this solution.

## Solution Walkthrough

### Setup Cloud9

We will use AWS Cloud9 to execute the subsequent commands. Follow the instructions in [Cloud9 Setup](../../doc/setup-cloud9.md)

### Clone this repository and install dependencies

```bash
   git clone https://github.com/aws-samples/aws-blockchain-node-runners.git
   cd aws-blockchain-node-runners
   npm install
```

**NOTE:** In this tutorial we will set all major configuration through environment variables, but you also can modify parameters in `config/config.ts`.

### Deploy Sync Node

1. Make sure you are in the root directory of the cloned repository

2. If you have deleted or don't have the default VPC, create default VPC

```bash
    aws ec2 create-default-vpc
   ```

   **NOTE:** You may see the following error if the default VPC already exists: `An error occurred (DefaultVpcAlreadyExists) when calling the CreateDefaultVpc operation: A Default VPC already exists for this account in this region.`. That means you can just continue with the following steps.

3. Configure  your setup

Create your own copy of `.env` file and edit it:
```bash
   # Make sure you are in aws-blockchain-node-runners/lib/polygon
   cd lib/polygon
   pwd
   cp .env-sample .env
   nano .env
```
   **NOTE:** Example configuration parameters are set in the local `.env-sample` file. You can find more examples inside `sample-configs` directory.


4. Deploy common components such as IAM role, and Amazon S3 bucket to store data snapshots

```bash
   pwd
   # Make sure you are in aws-blockchain-node-runners/lib/polygon
   npx cdk deploy polygon-common
```

5. Deploy Sync Node

```bash
   pwd
   # Make sure you are in aws-blockchain-node-runners/lib/polygon
   npx cdk deploy polygon-sync-node --json --outputs-file sync-node-deploy.json
```

6. After starting the node you need to wait for the inital syncronization process to finish. It may take from half a day to about 6-10 days depending on the client combination and the state of the network. You can use Amazon CloudWatch to track the progress. There is a script that publishes CloudWatch metrics every 5 minutes, where you can watch `sync distance` for consensus client and `blocks behind` for execution client. When the node is fully synced those two metrics shold show 0. To see them:

    - Navigate to [CloudWatch service](https://console.aws.amazon.com/cloudwatch/) (make sure you are in the region you have specified for `AWS_REGION`)
    - Open `Dashboards` and select `polygon-sync-node-<your-polygon-client-combination>` from the list of dashboards.

Once synchronization process is over, the script will automatically stop both clients and copy all the contents of the `/data` directory to your snapshot S3 bucket. That may take from 30 minutes to about 2 hours. During the process on the dashboard you will see lower CPU and RAM utilization but high data disc throughput and outbound network traffic. The script will automatically start the clients after the process is done.

Note: the snapshot backup process will automatically run ever day at midnight time of the time zone were the sync node runs. To change the schedule, modify `crontab` of the root user on the node's EC2 instance.

### Deploy the RPC Nodes

1. Configure and deploy a single RPC Node

```bash
   pwd
   # Make sure you are in aws-blockchain-node-runners/lib/polygon
   npx cdk deploy polygon-single-rpc-node --json --outputs-file single-rpc-node-deploy.json
```

1. Configure and deploy Highly Available RPC Nodes

```bash
   pwd
   # Make sure you are in aws-blockchain-node-runners/lib/polygon
   npx cdk deploy polygon-ha-rpc-nodes --json --outputs-file ha-rpc-nodes-deploy.json
```

2. Give the new RPC nodes about 30 minutes to initialize and then run the following query against the load balancer behind the RPC node created

```bash
    export RPC_ABL_URL=$(cat ha-rpc-nodes-deploy.json | jq -r '..|.ALBURL? | select(. != null)')
    echo $RPC_ABL_URL
    
    # We query token balance of Beacon deposit contract: https://etherscan.io/address/0x00000000219ab540356cbb839cbe05303d7705fa
    curl http://$RPC_ABL_URL:8545 -X POST -H "Content-Type: application/json" \
    --data '{"method":"eth_getBalance","params":["0x00000000219ab540356cBB839Cbe05303d7705Fa", "latest"],"id":1,"jsonrpc":"2.0"}'
```

The result should be like this (the actual balance might change):

```javascript
   {"jsonrpc":"2.0","id":1,"result":"0xe791d050f91d9949d344d"}
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
   # Make sure you are in aws-blockchain-node-runners/lib/polygon
   
   # Undeploy RPC Nodes
    cdk destroy rpc-nodes-stack

    # Undeploy Sync Node
    cdk destroy sync-node-stack

    # Delete all common components like IAM role and Security Group
    cdk destroy common-stack
```

2. Follow steps to delete the Cloud9 instance in [Cloud9 Setup](../../doc/setup-cloud9.md)

### FAQ

1. How to check the logs of the clients running on my sync node?

   **Note:** In this tutorial we chose not to use SSH and use Session Manager instead. That allows you to log all sessions in AWS CloudTrail to see who logged into the server and when. If you receive an error similar to `SessionManagerPlugin is not found`, [install Session Manager plugin for AWS CLI](https://docs.aws.amazon.com/systems-manager/latest/userguide/session-manager-working-with-install-plugin.html)

```bash
   pwd
   # Make sure you are in aws-blockchain-node-runners/lib/polygon

   export INSTANCE_ID=$(cat sync-node-deploy.json | jq -r '..|.sync-node-instance-id? | select(. != null)')
   echo "INSTANCE_ID=" $INSTANCE_ID
   aws ssm start-session --target $INSTANCE_ID --region $AWS_REGION
   sudo su polygon
   # Execution client logs:
   docker logs --tail 50 execution -f
   # Consensus client logs:
   docker logs --tail 50 consensus -f
```
2. How to check the logs from the EC2 user-data script?

```bash
   pwd
   # Make sure you are in aws-blockchain-node-runners/lib/polygon

   export INSTANCE_ID=$(cat sync-node-deploy.json | jq -r '..|.sync-node-instance-id? | select(. != null)')
   echo "INSTANCE_ID=" $INSTANCE_ID
   aws ssm start-session --target $INSTANCE_ID --region $AWS_REGION
   sudo cat /var/log/cloud-init-output.log
```

3. I'm running sync node with polygon and Prysm or Lighthouse and it gets stuck during syncing, what should I do?

Usually restart helps Erigon client to re-connect with other nodes and continue syncing. To restart do the following:

```bash
   pwd
   # Make sure you are in aws-blockchain-node-runners/lib/polygon

   export INSTANCE_ID=$(cat sync-node-deploy.json | jq -r '..|.sync-node-instance-id? | select(. != null)')
   echo "INSTANCE_ID=" $INSTANCE_ID
   aws ssm start-session --target $INSTANCE_ID --region $AWS_REGION
   sudo su polygon
   /usr/local/bin/docker-compose -f /home/polygon/docker-compose.yml down
   /usr/local/bin/docker-compose -f /home/polygon/docker-compose.yml up -d
```
