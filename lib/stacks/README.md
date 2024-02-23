# Sample AWS Blockchain Node Runner app for Stacks Nodes

Stacks nodes on AWS can currently be deployed in only the "follower" configuration, but is scoped to handle three different configurations: "follower", "miner", and "signer". You can choose to deploy nodes as a single node or a highly available (HA) node.

## Overview of Deployment Architectures for Single and HA setups

### Single node setup

![Single Node Deployment](./doc/assets/Stacks%20Single%20Node%20AWS%20Diagram.png)

1.	A Stacks node deployed in the [Default VPC](https://docs.aws.amazon.com/vpc/latest/userguide/default-vpc.html) continuously synchronizes with the rest of nodes on the Stacks network through [Internet Gateway](https://docs.aws.amazon.com/vpc/latest/userguide/VPC_Internet_Gateway.html).
2.	The Stacks node is used by dApps or development tools internally from within the Default VPC. JSON RPC API is not exposed to the Internet directly to protect nodes from unauthorized access.
3.	The Stacks node uses all required secrets locally, but stores a copy in [AWS Secrets Manager](https://docs.aws.amazon.com/secretsmanager/latest/userguide/intro.html) as secure backup.
4.	The Stacks node sends various monitoring metrics for both EC2 and Stacks nodes to Amazon CloudWatch.

### HA setup

![Highly Available Nodes Deployment](./doc/assets/Stacks%20HA%20Node%20AWS%20Diagram.png)

1.	A set of Base or Extended RPC Stacks nodes are deployed within the [Auto Scaling Group](https://docs.aws.amazon.com/autoscaling/ec2/userguide/auto-scaling-groups.html) in the [Default VPC](https://docs.aws.amazon.com/vpc/latest/userguide/default-vpc.html) continuously synchronizes with the rest of nodes on Stacks network through [Internet Gateway](https://docs.aws.amazon.com/vpc/latest/userguide/VPC_Internet_Gateway.html). **Note that HA setup is not suitable for note types other than follower.**
2.	The Stacks nodes are accessed by dApps or development tools internally through [Application Load Balancer](https://docs.aws.amazon.com/elasticloadbalancing/latest/application/introduction.html). JSON RPC API is not exposed to the Internet to protect nodes from unauthorized access. dApps need to handle user authentication and API protection, like [in this example for dApps on AWS](https://aws.amazon.com/blogs/architecture/dapp-authentication-with-amazon-cognito-and-web3-proxy-with-amazon-api-gateway/).
3.	The Stacks nodes use all required secrets locally, but store a copy in [AWS Secrets Manager](https://docs.aws.amazon.com/secretsmanager/latest/userguide/intro.html) as secure backup.
4.	The Stacks nodes send various monitoring metrics for both EC2 and Stacks nodes to Amazon CloudWatch.

## Additional materials

<details>

<summary>Managing Secrets</summary>

These details will become relevant with the implementation of the `signer` and `miner` node types.

</details>

<details>

<summary>Well-Architected Checklist</summary>

This is the Well-Architected checklist for Stacks nodes implementation of the AWS Blockchain Node Runner app. This checklist takes into account questions from the [AWS Well-Architected Framework](https://aws.amazon.com/architecture/well-architected/) which are relevant to this workload. Please feel free to add more checks from the framework if required for your workload.

| Pillar                  | Control                           | Question/Check                                                                   | Remarks          |
|:------------------------|:----------------------------------|:---------------------------------------------------------------------------------|:-----------------|
| Security                | Network protection                | Are there unnecessary open ports in security groups?                             | Please note that ports 20443 and 20444 for Stacks are open to the public to support P2P protocols. We have to rely on the protection mechanisms built into the Stacks software to protect those ports. |
|                         |                                   | Traffic inspection                                                               | AWS WAF could be implemented for traffic inspection. Additional charges will apply.  |
|                         | Compute protection                | Reduce attack surface                                                            | This solution uses Amazon Linux 2023 AMI. You may choose to run hardening scripts on it.  |
|                         |                                   | Enable people to perform actions at a distance                                   | This solution uses AWS Systems Manager for terminal session, not ssh ports.  |
|                         | Data protection at rest           | Use encrypted Amazon Elastic Block Store (Amazon EBS) volumes                    | This solution uses encrypted Amazon EBS volumes.  |
|                         |                                   | Use encrypted Amazon Simple Storage Service (Amazon S3) buckets                  | This solution uses Amazon S3 managed keys (SSE-S3) encryption.  |
|                         | Data protection in transit        | Use TLS                                                                          | The AWS Application Load balancer currently uses HTTP listener. Create HTTPS listener with self signed certificate if TLS is desired.  |
|                         | Authorization and access control  | Use instance profile with Amazon Elastic Compute Cloud (Amazon EC2) instances    | This solution uses AWS Identity and Access Management (AWS IAM) role instead of IAM user.  |
|                         |                                   | Following principle of least privilege access                                    | In all node types, root user is not used (using special user "stacks" instead).  |
|                         | Application security              | Security focused development practices                                           | cdk-nag is being used with appropriate suppressions.  |
| Cost optimization       | Service selection                 | Use cost effective resources                                                     | 1. AMD-based instances are used for Consensus and RPC node to save the costs. Consider compiling Graviton-based binaries to improve costs for compute.<br/>2. Cost-effective EBS gp3 are preferred instead of io2. |
|                         | Cost awareness                    | Estimate costs                                                                   | Single RPC node with `m5.large` EBS gp3 volumes about 512 GB with On-Demand pricing will cost around US$151.43 per month in the US East (N. Virginia) region not including network requests for follower nodes. More analysis needed. |
| Reliability             | Resiliency implementation         | Withstand component failures                                                     | This solution uses AWS Application Load Balancer with RPC nodes for high availability. Newly provisioned Stacks nodes triggered by Auto Scaling get up and running in about 80-90 minutes. |
|                         | Data backup                       | How is data backed up?                                                           | Considering blockchain data is replicated by nodes automatically and Stacks nodes sync from start within an hour and a half, we don't use any additional mechanisms to backup the data.  |
|                         | Resource monitoring               | How are workload resources monitored?                                            | Resources are being monitored using Amazon CloudWatch dashboards. Amazon CloudWatch custom metrics are being pushed via CloudWatch Agent.  |
| Performance efficiency  | Compute selection                 | How is compute solution selected?                                                | Compute solution is selected based on best price-performance, i.e. AWS AMD-based Amazon EC2 instances.  |
|                         | Storage selection                 | How is storage solution selected?                                                | Storage solution is selected based on best price-performance, i.e. gp3 Amazon EBS volumes with optimal IOPS and throughput.  |
|                         | Architecture selection            | How is the best performance architecture selected?                               | We used a combination of recommendations from the Stacks community and our own testing.  |
| Operational excellence  | Workload health                   | How is health of workload determined?                                            | Health of workload is determined via AWS Application Load Balancer Target Group Health Checks, on port 20444.  |
| Sustainability          | Hardware & services               | Select most efficient hardware for your workload                                 | The solution uses AMD-powered instances. There is a potential to use AWS Graviton-based Amazon EC2 instances which offer the best performance per watt of energy use in Amazon EC2.  |
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

### Deploy Single Node

1. Make sure you are in the root directory of the cloned repository

2. If you have deleted or don't have the default VPC, create default VPC

```bash
    aws ec2 create-default-vpc
   ```

   **NOTE:** You may see the following error if the default VPC already exists: `An error occurred (DefaultVpcAlreadyExists) when calling the CreateDefaultVpc operation: A Default VPC already exists for this account in this region.`. That means you can just continue with the following steps.

3. Configure  your setup

Create your own copy of `.env` file and edit it to update with your AWS Account ID and Region:
```bash
   # Make sure you are in aws-blockchain-node-runners/lib/stacks
   cd lib/stacks
   pwd
   cp ./sample-configs/.env-sample-follower .env
   nano .env
```
   **NOTE:** Example configuration parameters are set in the local `.env-sample` file. You can find more examples inside `sample-configs` directory.


4. Deploy common components such as IAM role, and Amazon S3 bucket to store data snapshots

```bash
   pwd
   # Make sure you are in aws-blockchain-node-runners/lib/stacks
   npx cdk deploy stacks-common
```

5. Deploy Sync Node

```bash
   pwd
   # Make sure you are in aws-blockchain-node-runners/lib/stacks
   npx cdk deploy stacks-single-node --json --outputs-file single-node-deploy.json
```

6. After starting the node you need to wait for the initial synchronization process to finish. It may take about 90 minutes and you can use Amazon CloudWatch to track the progress. There is a script that publishes CloudWatch metrics every 5 minutes, where you can watch `stacks_tip_height` and `burn_block_height` metrics. When the node is fully synced the `stacks_tip_height` metric will start to display. To see them:

    - Navigate to [CloudWatch service](https://console.aws.amazon.com/cloudwatch/) (make sure you are in the region you have specified for `AWS_REGION`)
    - Open `Dashboards` and select `stacks-single-node-*` from the list of dashboards.

7. Connect with the RPC API exposed by the node:

```bash
   INSTANCE_ID=$(cat single-node-deploy.json | jq -r '..|.nodeinstanceid? | select(. != null)')
   NODE_INTERNAL_IP=$(aws ec2 describe-instances --instance-ids $INSTANCE_ID --query 'Reservations[*].Instances[*].PublicIpAddress' --output text)
   curl http://$NODE_INTERNAL_IP:20443/v2/info'
```

### Deploy the HA Nodes

1. Configure and deploy multiple HA Nodes

```bash
   pwd
   # Make sure you are in aws-blockchain-node-runners/lib/stacks
   npx cdk deploy stacks-ha-nodes --json --outputs-file ha-nodes-deploy.json
```

2. Give the new RPC nodes about 90 minutes to initialize and then run the following query against the load balancer behind the RPC node created

```bash
    export RPC_ABL_URL=$(cat ha-nodes-deploy.json | jq -r '..|.ALBURL? | select(. != null)')
    echo $RPC_ABL_URL

    curl http://$RPC_ABL_URL:20443' | jq
```

The result should show the status of the blockchain.

**NOTE:** By default and for security reasons the load balancer is available only from within the default VPC in the region where it is deployed. It is not available from the Internet and is not open for external connections. Before opening it up please make sure you protect your RPC APIs.

### Clearing up and undeploy everything

1. Undeploy HA Nodes, Single Nodes and Common stacks

```bash
   # Setting the AWS account id and region in case local .env file is lost
   export AWS_ACCOUNT_ID=<your_target_AWS_account_id>
   export AWS_REGION=<your_target_AWS_region>

   pwd
   # Make sure you are in aws-blockchain-node-runners/lib/stacks

   # Undeploy HA Nodes
   cdk destroy stacks-ha-nodes

   # Undeploy Single Node
   cdk destroy stacks-single-node

   # Delete all common components like IAM role and Security Group
   cdk destroy stacks-common
```

2. Follow steps to delete the Cloud9 instance in [Cloud9 Setup](../../doc/setup-cloud9.md)

### FAQ

1. How to check the logs of the clients running on my sync node?

   **Note:** In this tutorial we chose not to use SSH and use Session Manager instead. That allows you to log all sessions in AWS CloudTrail to see who logged into the server and when. If you receive an error similar to `SessionManagerPlugin is not found`, [install Session Manager plugin for AWS CLI](https://docs.aws.amazon.com/systems-manager/latest/userguide/session-manager-working-with-install-plugin.html)

```bash
   pwd
   # Make sure you are in aws-blockchain-node-runners/lib/stacks

   export INSTANCE_ID=$(cat single-node-deploy.json | jq -r '..|.nodeinstanceid?|select(. != null)' )
   export AWS_REGION=$(cat single-node-deploy.json | jq -r '..|.region?|select(. != null)' )
   echo "INSTANCE_ID=$INSTANCE_ID"
   echo "AWS_REGION=$AWS_REGION"
   aws ssm start-session --target $INSTANCE_ID --region $AWS_REGION
   sudo su -
   tail -f /var/log/stacks/node.log
```

2. How to check the logs from the EC2 user-data script?

```bash
   pwd
   # Make sure you are in aws-blockchain-node-runners/lib/stacks

   export INSTANCE_ID=$(cat single-node-deploy.json | jq -r '..|.nodeinstanceid?|select(. != null)' )
   export AWS_REGION=$(cat single-node-deploy.json | jq -r '..|.region?|select(. != null)' )
   echo "INSTANCE_ID=$INSTANCE_ID"
   echo "AWS_REGION=$AWS_REGION"
   aws ssm start-session --target $INSTANCE_ID --region $AWS_REGION
   sudo cat /var/log/cloud-init-output.log
```

3. How can I restart the Stacks service?

``` bash
   export INSTANCE_ID=$(cat single-node-deploy.json | jq -r '..|.nodeinstanceid?|select(. != null)' )
   export AWS_REGION=$(cat single-node-deploy.json | jq -r '..|.region?|select(. != null)' )
   echo "INSTANCE_ID=$INSTANCE_ID"
   echo "AWS_REGION=$AWS_REGION"
   aws ssm start-session --target $INSTANCE_ID --region $AWS_REGION
   sudo systemctl status stacks
   # Then if the status is bad run the following:
   sudo systemctl restart stacks
```

4.

``` bash
   export INSTANCE_ID=$(cat single-node-deploy.json | jq -r '..|.nodeinstanceid?|select(. != null)' )
   export AWS_REGION=$(cat single-node-deploy.json | jq -r '..|.region?|select(. != null)' )
   echo "INSTANCE_ID=$INSTANCE_ID"
   echo "AWS_REGION=$AWS_REGION"
   aws ssm start-session --target $INSTANCE_ID --region $AWS_REGION
   sudo systemctl status stacks
   # Then if the status is bad run the following:
   sudo systemctl restart stacks
```

## Upgrades

When nodes need to be upgraded or downgraded, [use blue/green pattern to do it](https://aws.amazon.com/blogs/devops/performing-bluegreen-deployments-with-aws-codedeploy-and-auto-scaling-groups/). This is not yet automated and contributions are welcome!
