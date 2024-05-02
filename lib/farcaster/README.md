# Sample AWS Blockchain Node Runner app for Farcaster Nodes

[Farcaster](https://docs.farcaster.xyz/) is a decentralized social network built on Ethereum. It is a public social network similar to Twitter and Reddit. Users can create profiles, post "casts" and follow others. They own their accounts and relationships with other users and are free to move between different apps. 
This blueprint helps to deploy Hubble on AWS, which is an implementation of the Farcaster Hub Protocol, written in TypeScript and Rust. Hubble creates a private instance of Farcaster on your machine. It peers with other instances and downloads a copy of the entire network. Messages uploaded to your Hubble instance will be broadcast to the network. This blueprint uses [Amazon Managed Blockchain Access Ethereum](https://docs.aws.amazon.com/managed-blockchain/latest/ethereum-dev/ethereum-concepts.html) node for "Layer 1". It is meant to be used for development, testing or Proof of Concept purposes.

## Hardware Requirements

**Recommended for Farcaster node**

- Instance type [m5.xlarge](https://aws.amazon.com/ec2/instance-types/m6a/).
- At least 40GB EBS gp3 storage.`

**Amazon Managed Blockchain Ethereum L1**

- Minimum instance type: [bc.m5.xlarge](https://aws.amazon.com/managed-blockchain/instance-types/)
- Recommended instance type: [bc.m5.2xlarge](https://aws.amazon.com/managed-blockchain/instance-types/)

## Additional Requirements

- Ports 2281 - 2283 exposed
- RPC endpoints for Ethereum and Optimism Mainnet (This blueprint uses RPC endpoint provided by AMB Ethereum node)

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

    Create your own copy of `.env` file and edit it to update with your:
     1. AWS Account ID
     2. AWS Region
     3. Optimism Mainnet RPC endpoint
     4. Farcaster Hub ID
    ```bash
   # Make sure you are in aws-blockchain-node-runners/lib/Farcaster
   cd lib/Farcaster
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
   # Make sure you are in aws-blockchain-node-runners/lib/Farcaster
   npx cdk deploy hubble-nodes-common
   ```

   > IMPORTANT:
   > All AWS CDK v2 deployments use dedicated AWS resources to hold data during deployment. Therefore, your AWS account and Region must be [bootstrapped](https://docs.aws.amazon.com/cdk/v2/guide/bootstrapping.html) to create these resources before you can deploy. If you haven't already bootstrapped, issue the following command:
   > ```bash
   > cdk bootstrap aws://ACCOUNT-NUMBER/REGION
   > ```

5. Deploy Amazon Managed Blockchain (AMB) Access Ethereum node and wait about 35-70 minutes for the node to sync

   ```bash
   pwd
   # Make sure you are in aws-blockchain-node-runners/lib/Farcaster
   npx cdk deploy hubble-amb-ethereum-single-node --json --outputs-file hubble-amb-ethereum-single-node.json
   ```
   To watch the progress, open the [AMB Web UI](https://console.aws.amazon.com/managedblockchain/home), click the name of your target network from the list (Mainnet, Goerly, etc.) and watch the status of the node to change from `Creating` to `Available`.

6. Deploy Farcaster Full Node and wait for another 10-20 minutes for it to sync

   ```bash
   pwd
   # Make sure you are in aws-blockchain-node-runners/lib/Farcaster
   npx cdk deploy hubble-single-node --json --outputs-file hubble-single-node.json
   ```
   After starting the node you will need to wait for the initial synchronization process to finish.To see the progress, you may use SSM to connect into EC2 first and watch the log like this:

   ```bash
   export INSTANCE_ID=$(cat hubble-single-node.json | jq -r '..|.node-instance-id? | select(. != null)')
   echo "INSTANCE_ID=" $INSTANCE_ID
   export AWS_REGION=us-east-1
   aws ssm start-session --target $INSTANCE_ID --region $AWS_REGION
   tail -f /var/log/hubble/error.log
   ```

## Clear up and undeploy everything

1. Undeploy all Nodes and Common stacks

   ```bash
   # Setting the AWS account id and region in case local .env file is lost
   export AWS_ACCOUNT_ID=<your_target_AWS_account_id>
   export AWS_REGION=<your_target_AWS_region>

   pwd
   # Make sure you are in aws-blockchain-node-runners/lib/Farcaster

   # Undeploy Single Node
   npx cdk destroy hubble-single-node

   # Undeploy AMB Etheruem node
   npx cdk destroy hubble-ethereum-l1-node

   # Delete all common components like IAM role and Security Group
   npx cdk destroy hubble-common
   ```

2. Follow steps to delete the Cloud9 instance in [Cloud9 Setup](../../doc/setup-cloud9.md)

## FAQ

1. How to check the logs of the clients running on my Farcaster node?

   **Note:** In this tutorial we chose not to use SSH and use Session Manager instead. That allows you to log all sessions in AWS CloudTrail to see who logged into the server and when. If you receive an error similar to `SessionManagerPlugin is not found`, [install Session Manager plugin for AWS CLI](https://docs.aws.amazon.com/systems-manager/latest/userguide/session-manager-working-with-install-plugin.html)

   ```bash
   pwd
   # Make sure you are in aws-blockchain-node-runners/lib/Farcaster

   export INSTANCE_ID=$(cat single-node-deploy.json | jq -r '..|.node-instance-id? | select(. != null)')
   echo "INSTANCE_ID=" $INSTANCE_ID
   export AWS_REGION=us-east-1
   aws ssm start-session --target $INSTANCE_ID --region $AWS_REGION
   sudo journalctl -o cat -fu Farcaster
   ```
2. How to check the logs from the EC2 user-data script?

   ```bash
   pwd
   # Make sure you are in aws-blockchain-node-runners/lib/Farcaster

   export INSTANCE_ID=$(cat single-node-deploy.json | jq -r '..|.node-instance-id? | select(. != null)')
   echo "INSTANCE_ID=" $INSTANCE_ID
   export AWS_REGION=us-east-1
   aws ssm start-session --target $INSTANCE_ID --region $AWS_REGION
   sudo cat /var/log/cloud-init-output.log
   ```

3. How can I restart the Farcaster service?

   ``` bash
   export INSTANCE_ID=$(cat single-node-deploy.json | jq -r '..|.node-instance-id? | select(. != null)')
   echo "INSTANCE_ID=" $INSTANCE_ID
   export AWS_REGION=us-east-1
   aws ssm start-session --target $INSTANCE_ID --region $AWS_REGION
   sudo systemctl status Farcaster.service
   sudo systemctl restart Farcaster.service
   ```