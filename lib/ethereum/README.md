# Sample AWS Blockchain Node Runner app for Ethereum Nodes

## Architecture Overview

![Architecture](./doc/assets/Architecture.png)

1.	An ongoing data synchronization process is configured with nodes in the Ethereum network with a sync node and RPC nodes.
2.	The sync node is used to create a copy of node's state data in Amazon S3 bucket.
3.	When new RPC nodes are provisioned, they copy state data from Amazon S3 bucket to speed up the initial sync process.
4.	Applications and smart contract development tools access highly available RPC nodes behind the Application Load Balancer.

## Well-Architected



<details>

<summary>Review the for pros and cons of this solution.</summary>

### Well-Architected Checklist

This is the Well-Architected checklist for Ethereum nodes implementation of the AWS Blockchain Node Runner app. This checklist takes into account questions from the [AWS Well-Architected Framework](https://aws.amazon.com/architecture/well-architected/) which are relevant to this workload. Please feel free to add more checks from the framework if required for your workload.

| Pillar                  | Control                           | Question/Check                                                                   | Remarks          |
|:------------------------|:----------------------------------|:---------------------------------------------------------------------------------|:-----------------|
| Security                | Network protection                | Are there unnecessary open ports in security groups?                             | Please note that Erigon snap sync port remains open for non-erigon clients, i.e. Port 42069 (TCP/UDP).  |
|                         |                                   | Traffic inspection                                                               | AWS WAF could be implemented for traffic inspection. Additional charges will apply.  |
|                         | Compute protection                | Reduce attack surface                                                            | This solution uses Amazon Linux 2 AMI. You may choose to run hardening scripts on it.  |
|                         |                                   | Enable people to perform actions at a distance                                   | This solution uses AWS Systems Manager for terminal session, not ssh ports.  |
|                         | Data protection at rest           | Use encrypted Amazon Elastic Block Store (Amazon EBS) volumes                    | This solution uses encrypted Amazon EBS volumes.  |
|                         |                                   | Use encrypted Amazon Simple Storage Service (Amazon S3) buckets                  | This solution uses Amazon S3 managed keys (SSE-S3) encryption.  |
|                         | Data protection in transit        | Use TLS                                                                          | The AWS Application Load balancer currently uses HTTP listener. Create HTTPS listener with self signed certificate if TLS is desired.  |
|                         | Authorization and access control  | Use instance profile with Amazon Elastic Compute Cloud (Amazon EC2) instances    | This solution uses AWS Identity and Access Management (AWS IAM) role instead of IAM user.  |
|                         |                                   | Following principle of least privilege access                                    | In sync node, root user is not used (using special user "ethereum" instead").  |
|                         | Application security              | Security focused development practices                                           | cdk-nag is being used with appropriate suppressions.  |
| Cost optimization       | Service selection                 | Use cost effective resources                                                     | AWS Graviton-based Amazon EC2 instances are being used, which are cost effective compared to Intel/AMD instances.  |
|                         | Cost awareness                    | Estimate costs                                                                   | One sync node with m7g.2xlarge for geth-lighthouse configuration (2048GB ssd) will cost around US$430 per month in the US East (N. Virginia) region. Additional charges will apply if you choose to deploy RPC nodes with load balancer. |
| Reliability             | Resiliency implementation         | Withstand component failures                                                     | This solution uses AWS Application Load Balancer with RPC nodes for high availability. If sync node fails, Amazon S3 backup can be used to reinstate the nodes.  |
|                         | Data backup                       | How is data backed up?                                                           | Data is backed up to Amazon S3 using [s5cmd](https://github.com/peak/s5cmd) tool.  |
|                         | Resource monitoring               | How are workload resources monitored?                                            | Resources are being monitored using Amazon CloudWatch dashboards. Amazon CloudWatch custom metrics are being pushed via CloudWatch Agent.  |
| Performance efficiency  | Compute selection                 | How is compute solution selected?                                                | Compute solution is selected based on best price-performance, i.e. AWS Graviton-based Amazon EC2 instances.  |
|                         | Storage selection                 | How is storage solution selected?                                                | Storage solution is selected based on best price-performance, i.e. gp3 Amazon EBS volumes with optimal IOPS and throughput.  |
|                         | Architecture selection            | How is the best performance architecture selected?                               | s5cmd tool has been chosen for Amazon S3 uploads/downloads because it gives better price-performance compared to Amazon EBS snapshots (including Fast Snapshot Restore, which can be expensive).  |
| Operational excellence  | Workload health                   | How is health of workload determined?                                            | Health of workload is determined via AWS Application Load Balancer Target Group Health Checks, on port 8545.  |
| Sustainability          | Hardware & services               | Select most efficient hardware for your workload                                 | This solution uses AWS Graviton-based Amazon EC2 instances which offer the best performance per watt of energy use in Amazon EC2.  |

</details>


## Solution Walkthrough

### Setup Cloud9

We will use AWS Cloud9 to execute the subsequent commands. Follow the instructions in [Cloud9 Setup](../../docs/setup-cloud9.md)

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
   # Make sure you are in aws-blockchain-node-runners/lib/ethereum
   cd lib/ethereum
   pwd
   cp .env-sample .env
   nano .env
```
   **NOTE:** Example configuration parameters are set in the local `.env-sample` file. You can find more examples inside `sample-configs` directory.


4. Deploy common components such as IAM role, and Amazon S3 bucket to store data snapshots

```bash
   pwd
   # Make sure you are in aws-blockchain-node-runners/lib/ethereum
   npx cdk deploy eth-common
```

5. Deploy Sync Node

```bash
   pwd
   # Make sure you are in aws-blockchain-node-runners/lib/ethereum
   npx cdk deploy eth-sync-node --json --outputs-file sync-node-deploy.json
```

6. After starting the node you need to wait for the inital syncronization process to finish. It may take from half a day to about 6-10 days depending on the client combination and the state of the network. You can use Amazon CloudWatch to track the progress. There is a script that publishes CloudWatch metrics every 5 minutes, where you can watch `sync distance` for consensus client and `blocks behind` for execution client. When the node is fully synced those two metrics shold show 0. To see them:

    - Navigate to [CloudWatch service](https://console.aws.amazon.com/cloudwatch/) (make sure you are in the region you have specified for `AWS_REGION`)
    - Open `Dashboards` and select `eth-sync-node-<your-eth-client-combination>` from the list of dashboards.

Once synchronization process is over, the script will automatically stop both clients and copy all the contents of the `/data` directory to your snapshot S3 bucket. That may take from 30 minutes to about 2 hours. During the process on the dashboard you will see lower CPU and RAM utilization but high data disc throughput and outbound network traffic. The script will automatically start the clients after the process is done.

Note: the snapshot backup process will automatically run ever day at midnight time of the time zone were the sync node runs. To change the schedule, modify `crontab` of the root user on the node's EC2 instance.

### Deploy the RPC Nodes

1. Configure and deploy 2 RPC Nodes

```bash
   pwd
   # Make sure you are in aws-blockchain-node-runners/lib/ethereum
   npx cdk deploy eth-rpc-nodes --json --outputs-file rpc-node-deploy.json
```

2. Give the new RPC nodes about 30 minutes (up to 2 hours for Erigon) to initialize and then run the following query against the load balancer behind the RPC node created

```bash
    export ETH_RPC_ABL_URL=$(cat rpc-node-deploy.json | jq -r '..|.alburl? | select(. != null)')
    echo $ETH_RPC_ABL_URL
    
    # We query token balance of Beacon deposit contract: https://etherscan.io/address/0x00000000219ab540356cbb839cbe05303d7705fa
    curl http://$ETH_RPC_ABL_URL:8545 -X POST -H "Content-Type: application/json" \
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
   # Make sure you are in aws-blockchain-node-runners/lib/ethereum
   
   # Undeploy RPC Nodes
    cdk destroy eth-rpc-nodes

    # Undeploy Sync Node
    cdk destroy eth-sync-node

    # You need to manually delete an s3 bucket with a name similar to 'eth-snapshots-$accountid-eth-nodes-common' on the console,firstly empty the bucket,secondly delete the bucket,and then execute
    # Delete all common components like IAM role and Security Group
    cdk destroy eth-common
```

2. Follow steps to delete the Cloud9 instance in [Cloud9 Setup](../../doc/setup-cloud9.md)

### FAQ

1. How to check the logs of the clients running on my sync node?

   **Note:** In this tutorial we chose not to use SSH and use Session Manager instead. That allows you to log all sessions in AWS CloudTrail to see who logged into the server and when. If you receive an error similar to `SessionManagerPlugin is not found`, [install Session Manager plugin for AWS CLI](https://docs.aws.amazon.com/systems-manager/latest/userguide/session-manager-working-with-install-plugin.html)

```bash
   pwd
   # Make sure you are in aws-blockchain-node-runners/lib/ethereum

   export INSTANCE_ID=$(cat sync-node-deploy.json | jq -r '..|.sync-node-instance-id? | select(. != null)')
   echo "INSTANCE_ID=" $INSTANCE_ID
   aws ssm start-session --target $INSTANCE_ID --region $AWS_REGION
   sudo su ethereum
   # Execution client logs:
   docker logs --tail 50 execution -f
   # Consensus client logs:
   docker logs --tail 50 consensus -f
```
2. How to check the logs from the EC2 user-data script?

```bash
   pwd
   # Make sure you are in aws-blockchain-node-runners/lib/ethereum

   export INSTANCE_ID=$(cat sync-node-deploy.json | jq -r '..|.sync-node-instance-id? | select(. != null)')
   echo "INSTANCE_ID=" $INSTANCE_ID
   aws ssm start-session --target $INSTANCE_ID --region $AWS_REGION
   sudo cat /var/log/cloud-init-output.log
```

3. I'm running sync node with Ethereum and Prysm or Lighthouse and it gets stuck during syncing, what should I do?

Usually restart helps Erigon client to re-connect with other nodes and continue syncing. To restart do the following:

```bash
   pwd
   # Make sure you are in aws-blockchain-node-runners/lib/ethereum

   export INSTANCE_ID=$(cat sync-node-deploy.json | jq -r '..|.sync-node-instance-id? | select(. != null)')
   echo "INSTANCE_ID=" $INSTANCE_ID
   aws ssm start-session --target $INSTANCE_ID --region $AWS_REGION
   sudo su ethereum
   /usr/local/bin/docker-compose -f /home/ethereum/docker-compose.yml down
   /usr/local/bin/docker-compose -f /home/ethereum/docker-compose.yml up -d
```
