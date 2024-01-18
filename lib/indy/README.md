# Sample AWS Blockchain Node Runner app for Hyperledger Indy

[View this page in Japanese (日本語)](./README_ja.md)

## Architecture Overview

![Architecture](./doc/assets/Architecture.png)

This is a sample of building a Hyperledger Indy network on AWS.
The overall architecture is shown below, processing itself is performed by 4 Stewards (Validator Nodes), and network management is performed with Trustee. It consists of 4 EC2 instances for Steward and 1 EC2 instance for Trustee.

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

### Deploy Indy Nodes

Indy Network is built using 4 EC2 instances for Steward and 1 EC2 instance for Trustee. Various information such as DID is acquired in the following procedure, copied by referring to [this community spreadsheet](https://docs.google.com/spreadsheets/d/1LDduIeZp7pansd9deXeVSqGgdf0VdAHNMc7xYli3QAY/edit#gid=0).

#### Building resources

1. Install npm dependency packages

```bash
cd lib/indy
pwd
# Make sure you are in aws-blockchain-node-runners/lib/indy
npm install
```

2. Setting up initial AWS Cloud Development Kit (CDK)

The following command is executed only when using AWS CDK for the first time in the region where the deployment will be carried out.

```bash
npx cdk bootstrap
```

3. Deploying resources with CDK

```bash
npx cdk deploy

Outputs:
IndyNodeStack.Node1InstanceId = i-xxxxxxxxxxxxxxxxx
IndyNodeStack.Node2InstanceId = i-xxxxxxxxxxxxxxxxx
IndyNodeStack.Node3InstanceId = i-xxxxxxxxxxxxxxxxx
IndyNodeStack.Node4InstanceId = i-xxxxxxxxxxxxxxxxx
IndyNodeStack.TrusteeInstanceId = i-xxxxxxxxxxxxxxxxx
```

**NOTE:** User data for the Steward instance is created by referring to [the Community Docs](https://github.com/hyperledger/indy-node/blob/main/docs/source/install-docs/AWS-NodeInstall-20.04.md).

#### Setting up Trustee

Log in to the Trustee instance via Session Manager from the EC2 (or Systems Manager) console and generate Trustee/Steward DIDs.
​

```bash
cd /
./indy-cli-rs
​
# Perform the following commands 3 times for Trustee and 4 times for Steward
wallet create <WALLET_NAME> key=<KEY>
wallet open <WALLET_NAME> key=<KEY>
did new seed=<SEED>
wallet close
```

#### Setting up Steward

Log in to the Steward instance via Session Manager from the EC2 (or Systems Manager) console and generate Validator verkey, BLS key, and BLS POP.

```bash
sudo init_indy_node <ALIAS> <NODE_IP> 9701 <CLIENT_IP> 9702 <SEED>
```

**NOTE:** Here, Steward represents Validator Node ([reference information](https://github.com/pSchlarb/indy-node/blob/documentationUpdate/docs/source/installation-and-configuration.md#32-validator-node-installation)).

#### Generating Genesis files

1. Download each sheet (Stewards, Trustees) containing the information generated in the steps so far
   - File → Download → .csv
2. Save `trustees.csv` and `stewards.csv` to Trustee instance

**NOTE:** To transfer a locally downloaded CSV file via Session Manager, use the Session Manager Plugin in addition to the AWS CLI to transfer it with the following command ([reference information](https://dev.classmethod.jp/articles/ssm-session-manager-support-for-tunneling-ssh-scp-on-windows10/)).

```bash
scp -i <PATH_TO_PEM> <PATH_TO_CSV> ec2-user@<i-xxxxxxxx>:~/
```

​
3. Generate Genesis files

Using the above two CSV files, generate Genesis files (`pool_transactions_genesis`, `domain_transactions_genesis`) with `genesis_from_files.py`

```bash
cd ~/
wget -nc https://raw.githubusercontent.com/sovrin-foundation/steward-tools/master/create_genesis/genesis_from_files.py
​
chmod +x genesis_from_files.py
./genesis_from_files.py --stewards stewards.csv --trustees trustees.csv

DEBUG:root:new line check for file: ./pool_transactions_genesis
INFO:root:Starting ledger...
INFO:root:Recovering tree from transaction log
INFO:root:Recovered tree in 0.00010979999979099375 seconds
DEBUG:root:new line check for file: ./domain_transactions_genesis
INFO:root:Starting ledger...
INFO:root:Recovering tree from transaction log
INFO:root:Recovered tree in 8.670999977766769e-05 seconds
```

#### Setting up Nodes

Start up each Validator Node (Steward)

1. Download Genesis files and set permissions

Download or copy Genesis files to Node instance. Then, set the permissions for all files under `/var/lib/indy/` to `indy` ([reference information](https://github.com/pSchlarb/indy-node/blob/documentationUpdate/docs/source/NewNetwork/NewNetwork.md#iv-create-and-distribute-genesis-transaction-files)​).

```bash
cd  /var/lib/indy/sample-network

# Save domain_transactions_genesis and pool_transactions_genesis
# sudo curl -o domain_transactions_genesis <URL_TO_THE_RAW_DOMAIN_TRANSACTIONS_GENESIS_FILE>
# sudo curl -o pool_transactions_genesis  <URL_TO_THE_RAW_POOL_TRANSACTIONS_GENESIS_FILE>

sudo chown -R indy:indy ../
```

**NOTE:** The directory name of `/var/lib/indy/sample-network` is `NETWORK_NAME` set in `lib/indy/lib/assets/user-data/steward.sh`.

2. Start indy-node and check status

```bash
sudo systemctl start indy-node
sudo systemctl status indy-node
sudo systemctl enable indy-node
​
sudo validator-info
```

**NOTE:** [reference information](https://github.com/pSchlarb/indy-node/blob/documentationUpdate/docs/source/installation-and-configuration.md#35-add-node-to-a-pool)

#### reference information

- [Buidling Indy Network](https://github.com/pSchlarb/indy-node/blob/documentationUpdate/docs/source/NewNetwork/NewNetwork.md)
- [Setting up EC2 instances for Indy Node](https://github.com/hyperledger/indy-node/blob/main/docs/source/install-docs/AWS-NodeInstall-20.04.md)
- [Setting up Indy Node](https://github.com/pSchlarb/indy-node/blob/documentationUpdate/docs/source/installation-and-configuration.md)
​

### Considerations

Matters to be examined in additional development etc. when using this sample are described.

- Change the instance type to M
  - Currently, it is a T instance, but in production environments, it is recommended to change to M
- Fix the security group for Node NICs attached to Steward (Validator Node)
  - Limit source IPs to node IPs of other nodes (currently open within VPC and can also be accessed by clients)
  - Fix Node's private IP
- If necessary, change the subnet to which the node belongs to a public subnet
- Make Steward and Node separate instances
