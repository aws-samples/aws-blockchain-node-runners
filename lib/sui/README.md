# Sample AWS Blockchain Node Runner app for Sui Full Node

| Contributed by |
|:--------------------:|
| [@yinalaws](https://github.com/yinalaws), [@effraga](https://github.com/effraga) |

## Architecture Overview

This blueprint has step by step guides to set up a single Sui Full Node.


### Sui Full Node setup
![SingleNodeSetup](./doc/assets/Architecture-Single.png)

This setup is for PoC or development environments and it supports Devnet, Testnet and Mainnet. It deploys a single EC2 instance with Sui client. The RPC port is exposed only to internal IP range of the VPC, while P2P ports allow external access to keep the client synced.

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

### Prepare to deploy nodes

1. Make sure you are in the root directory of the cloned repository

2. If you have deleted or don't have the default VPC, create default VPC

```bash
    aws ec2 create-default-vpc
   ```

   **NOTE:** You may see the following error if the default VPC already exists: `An error occurred (DefaultVpcAlreadyExists) when calling the CreateDefaultVpc operation: A Default VPC already exists for this account in this region.`. That means you can just continue with the following steps.

   **NOTE:** The default VPC must have at least two public subnets in different Availability Zones, and public subnet must set `Auto-assign public IPv4 address` to `YES`

3. Configure  your setup

Create your own copy of `.env` file and edit it:
```bash
   # Make sure you are in aws-blockchain-node-runners/lib/Sui
   cd lib/sui
   pwd
   cp ./sample-configs/.env-sample-full .env
   nano .env
```
   **NOTE:** You can find more examples inside the `sample-configs` directory.


4. Deploy common components such as IAM role, and Amazon S3 bucket to store data snapshots

```bash
   pwd
   # Make sure you are in aws-blockchain-node-runners/lib/sui
   npx cdk deploy sui-common
```

### Deploy Sui Full-Node

1. Deploy JSON_RPC Full Node

```bash
   pwd
   # Make sure you are in aws-blockchain-node-runners/lib/sui
   npx cdk deploy sui-single-node --json --outputs-file single-node-deploy.json
```
   **NOTE:** The default VPC must have at least two public subnets in different Availability Zones, and public subnet must set `Auto-assign public IPv4 address` to `YES`.

   The EC2 instance will deploy, initialize the node and start the first sync. In Cloudformation the instance will show as successful once the node is running. From that point it still takes a while until the node is synced to the blockchain. You can check the sync status with the REST call below in step 4. If the `curl cannot connect to the node on port 8732, then the node is still importing. Once that's done, the curl command works. 

2. After starting the node you need to wait for the inital syncronization process to finish. It may take from an hour to half a day depending on the the state of the network. You can use Amazon CloudWatch to track the progress. To see them:

    - Navigate to [CloudWatch service](https://console.aws.amazon.com/cloudwatch/) (make sure you are in the region you have specified for `AWS_REGION`)
    - Open `Dashboards` and select `tz-single-node-<type>-<network>` from the list of dashboards.

4. Once the initial synchronization is done, you should be able to access the RPC API of that node from within the same VPC. The RPC port is not exposed to the Internet. Check if the JSON-RPC port is open and working — run the following command from a terminal:

```bash
   INSTANCE_ID=$(cat single-node-deploy.json | jq -r '..|.singleinstanceid? | select(. != null)')
   NODE_INTERNAL_IP=$(aws ec2 describe-instances --instance-ids $INSTANCE_ID --query 'Reservations[*].Instances[*].PrivateIpAddress' --output text)

    # We query if the node is synced to main
    ## replace <your IP address> with your server IP address
curl --location --request POST <your IP address>:9000 \
--header 'Content-Type: application/json' \
--data-raw '{ "jsonrpc":"2.0", "method":"rpc.discover","id":1}'
```

The result should start like like this (the actual balance might change):

```{"jsonrpc":"2.0","result":{"openrpc":"1.2.6","info":{"title":"Sui JSON-RPC","description":"Sui JSON-RPC API for interaction with Sui Full node. Make RPC calls using https://fullnode.NETWORK.sui.io:443, where NETWORK is the network you want to use (testnet, devnet, mainnet). By default, local networks use port 9000.","contact":{"name":"Mysten Labs","url":"https://mystenlabs.com","email":"build@mystenlabs.com"},"license":{"name":"Apache-2.0","url":"https://raw.githubusercontent.com/MystenLabs/sui/main/LICENSE"},"version":"1.28.2"},"methods
```


### Clearing up and undeploying everything

1. Undeploy RPC Nodes, Sync Nodes and Common components

```bash
   # Setting the AWS account id and region in case local .env file is lost
    export AWS_ACCOUNT_ID=<your_target_AWS_account_id>
    export AWS_REGION=<your_target_AWS_region>

   pwd
   # Make sure you are in aws-blockchain-node-runners/lib/Sui

    # Undeploy Single Fullnode
    cdk destroy sui-single-node


    # You need to manually delete an s3 bucket with a name similar to 'sui-snapshots-$accountid-tz-nodes-common' on the console,firstly empty the bucket,secondly delete the bucket,and then execute
    # Delete all common components like IAM role and Security Group
    cdk destroy dui-common
```

2. Follow steps to delete the Cloud9 instance in [Cloud9 Setup](../../doc/setup-cloud9.md)

### FAQ

1. How to check the logs from the EC2 user-data script?

   **Note:** In this tutorial we chose not to use SSH and use Session Manager instead. That allows you to log all sessions in AWS CloudTrail to see who logged into the server and when. If you receive an error similar to `SessionManagerPlugin is not found`, [install Session Manager plugin for AWS CLI](https://docs.aws.amazon.com/systems-manager/latest/userguide/session-manager-working-with-install-plugin.html)

```bash
   pwd
   # Make sure you are in aws-blockchain-node-runners/lib/Sui

   export INSTANCE_ID=$(cat single-node-deploy.json | jq -r '..|.single-node-instance-id? | select(. != null)')
   echo "INSTANCE_ID=" $INSTANCE_ID
   aws ssm start-session --target $INSTANCE_ID --region $AWS_REGION
   sudo cat /var/log/cloud-init-output.log
```
