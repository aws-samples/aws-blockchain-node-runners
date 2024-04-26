# Sample AWS Blockchain Node Runner app for Starknet Nodes

| Contributed by |
|:--------------------:|
| [@wojciechos](https://github.com/wojciechos) |

[Starknet](https://docs.starknet.io/documentation/) is a "Layer 2" scaling solution for Ethereum leveraging zero knowledge proofs. This blueprint helps to deploy Starknet nodes (Juno) on AWS as RPC nodes. It is meant to be used for development, testing or Proof of Concept purposes.

## Overview of Deployment Architectures for Single Node setups

### Single node setup

![Single Node Deployment](./doc/assets/Architecture-SingleNode.png)

1.	A Starknet node deployed in the [Default VPC](https://docs.aws.amazon.com/vpc/latest/userguide/default-vpc.html) continuously synchronizes with the [Sequencer](https://docs.starknet.io/documentation/architecture_and_concepts/Network_Architecture/starknet_architecture_overview/) through [Internet Gateway](https://docs.aws.amazon.com/vpc/latest/userguide/VPC_Internet_Gateway.html).
2.	The Starknet node is used by dApps or development tools internally from within the Default VPC. JSON RPC API is not exposed to the Internet directly to protect nodes from unauthorized access.
3. You will need access to a fully-synced Ethereum RPC endpoint before running Juno.
4. The Starknet node sends various monitoring metrics for both EC2 and Starknet nodes to Amazon CloudWatch.


## Hardware Requirements

**Minimum for Starknet node**

- Instance type [m6a.large](https://aws.amazon.com/ec2/instance-types/m6a/).
- 250GB EBS gp3 storage with at least 3000 IOPS.

**Recommended for Starknet node**

- Instance type [m6a.2xlarge](https://aws.amazon.com/ec2/instance-types/m6a/).
- 250GB EBS gp3 storage with at least 3000 IOPS.`

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

   > NOTE:
   > You may see the following error if the default VPC already exists: `An error occurred (DefaultVpcAlreadyExists) when calling the CreateDefaultVpc operation: A Default VPC already exists for this account in this region.`. That means you can just continue with the following steps.

3. Configure your setup

    Create your own copy of `.env` file and edit it to update with your AWS Account ID and Region:
    ```bash
   # Make sure you are in aws-blockchain-node-runners/lib/starknet
   cd lib/starknet
   npm install
   pwd
   cp ./sample-configs/.env-sample-full .env
   nano .env
    ```
   > NOTE:
   > Example configuration parameters are set in the local `.env-sample` file. You can find more examples inside `sample-configs` directory.

4. Deploy common components such as IAM role

   ```bash
   pwd
   # Make sure you are in aws-blockchain-node-runners/lib/starknet
   npx cdk deploy starknet-common
   ```

   > IMPORTANT:
   > All AWS CDK v2 deployments use dedicated AWS resources to hold data during deployment. Therefore, your AWS account and Region must be [bootstrapped](https://docs.aws.amazon.com/cdk/v2/guide/bootstrapping.html) to create these resources before you can deploy. If you haven't already bootstrapped, issue the following command:
   > ```bash
   > cdk bootstrap aws://ACCOUNT-NUMBER/REGION
   > ```


5. Deploy Starknet Full Node

   ```bash
   pwd
   # Make sure you are in aws-blockchain-node-runners/lib/starknet
   npx cdk deploy starknet-single-node --json --outputs-file single-node-deploy.json
   ```
   After starting the node you will need to wait for the initial synchronization process to finish. To see the progress, you may use SSM to connect into EC2 first and watch the log like this:

   ```bash
   export INSTANCE_ID=$(cat single-node-deploy.json | jq -r '..|.nodeinstanceid? | select(. != null)')
   echo "INSTANCE_ID="$INSTANCE_ID
   export AWS_REGION=us-east-1
   aws ssm start-session --target $INSTANCE_ID --region $AWS_REGION
   tail -f /var/log/starknet/error.log
   ```

7. Test Starknet RPC API
   Use curl to query from within the node instance:
   ```bash
   export INSTANCE_ID=$(cat single-node-deploy.json | jq -r '..|.node-instance-id? | select(. != null)')
   echo "INSTANCE_ID=" $INSTANCE_ID
   export AWS_REGION=us-east-1
   aws ssm start-session --target $INSTANCE_ID --region $AWS_REGION

   curl --location 'http://localhost:6060' \
   --header 'Content-Type: application/json' \
   --data '{
      "jsonrpc":"2.0",
      "method":"starknet_chainId",
      "params":[],
      "id":1
   }'
   ```

### Monitoring
A script on the Starknet node publishes current block and blocks behind metrics to CloudWatch metrics every 5 minutes. When the node is fully synced the blocks behind metric should get to 0.To see the metrics:

- Navigate to CloudWatch service (make sure you are in the region you have specified for AWS_REGION)
- Open Dashboards and select `starknet-single-node` from the list of dashboards.

## Clear up and undeploy everything

1. Undeploy all Nodes and Common stacks

   ```bash
   # Setting the AWS account id and region in case local .env file is lost
   export AWS_ACCOUNT_ID=<your_target_AWS_account_id>
   export AWS_REGION=<your_target_AWS_region>

   pwd
   # Make sure you are in aws-blockchain-node-runners/lib/starknet

   # Undeploy Single Node
   npx cdk destroy starknet-single-node


   # Delete all common components like IAM role and Security Group
   npx cdk destroy starknet-common
   ```

2. Follow steps to delete the Cloud9 instance in [Cloud9 Setup](../../doc/setup-cloud9.md)

## FAQ

1. How to check the logs of the clients running on my Starknet node?

   **Note:** In this tutorial we chose not to use SSH and use Session Manager instead. That allows you to log all sessions in AWS CloudTrail to see who logged into the server and when. If you receive an error similar to `SessionManagerPlugin is not found`, [install Session Manager plugin for AWS CLI](https://docs.aws.amazon.com/systems-manager/latest/userguide/session-manager-working-with-install-plugin.html)

   ```bash
   pwd
   # Make sure you are in aws-blockchain-node-runners/lib/starknet

   export INSTANCE_ID=$(cat single-node-deploy.json | jq -r '..|.nodeinstanceid? | select(. != null)')
   echo "INSTANCE_ID=" $INSTANCE_ID
   export AWS_REGION=us-east-1
   aws ssm start-session --target $INSTANCE_ID --region $AWS_REGION
   sudo journalctl -o cat -fu starknet
   ```
2. How to check the logs from the EC2 user-data script?

   ```bash
   pwd
   # Make sure you are in aws-blockchain-node-runners/lib/starknet

   export INSTANCE_ID=$(cat single-node-deploy.json | jq -r '..|.nodeinstanceid? | select(. != null)')
   echo "INSTANCE_ID=" $INSTANCE_ID
   export AWS_REGION=us-east-1
   aws ssm start-session --target $INSTANCE_ID --region $AWS_REGION
   sudo cat /var/log/cloud-init-output.log
   ```

3. How can I restart the Starknet service?

   ``` bash
   export INSTANCE_ID=$(cat single-node-deploy.json | jq -r '..|.nodeinstanceid? | select(. != null)')
   echo "INSTANCE_ID=" $INSTANCE_ID
   export AWS_REGION=us-east-1
   aws ssm start-session --target $INSTANCE_ID --region $AWS_REGION
   sudo systemctl status starknet.service
   sudo systemctl restart starknet.service
   ```
4. Where to find the key juno directories?

   - The directory with binaries is `/home/ubuntu/juno-source`.
   - The data directory of juno agent is `/home/ubuntu/juno-source/juno-datadir`
