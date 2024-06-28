# Sample AWS Blockchain Node Runner app for Allora Worker Nodes

| Contributed by |
|:--------------------:|
| [@clementupshot](https://github.com/clementupshot), [@allora-rc](https://github.com/allora-rc) |

[Allora](https://www.allora.network/) is a self-improving decentralized Artificial Intelligence (AI) network. The primary goal of the network is to be the marketplace for intelligence. In other words, Allora aims to incentivize data scientists (workers) to provide high-quality inferences as requested by consumers. Inferences include predictions of arbitrary future events or difficult computations requiring specialized knowledge.

The Allora Network brings together:

  - [Consumers](https://docs.allora.network/devs) who pay for and acquire inferences or expertise to be revealed
  - [Workers](https://v2.docs.allora.network/datasci) who reveal inferences
  - [Reputers](https://docs.allora.network/nops) who determine how accurate workers are after a ground truth is revealed
  - [Validators](https://docs.allora.network/nops) who secure protocol state, history, and reward distributions

With these ingredients, the Allora Network is able to continuously learn and improve itself over time producing inferences that are more accurate than the most accurate participant.

Allora Worker nodes are the interfaces between data scientists' models and the Allora Network. A worker node is a machine-intelligent application registered on the Allora chain that provides inference/prediction on a particular topic it's subscribed to and gets rewarded based on the inference quality.

This blueprint is designed to assist in deploying a single Allora [Worker Node](https://v2.docs.allora.network/datasci) on AWS. It is intended for use in development, testing, or Proof of Concept (PoC) environments.

## Overview of Deployment Architecture

### Single Worker Node Setup
![Single Worker Node Deployment](./doc/assets/Architecture-Single-Allora-Worker-Node.png)

The AWS Cloud Development Kit (CDK) is used to deploy a single Allora Worker Node. The CDK application deploys the following infrastructure:
   
  - Virtual Private Cloud (VPC)
  - Internet Gateway (IGW) to allow inbound requests for inferences from consumers and outbound responses from the worker node revealing inferences
  - Public subnet that has a direct route to the IGW
  - Security Group (SG) with TCP Port 9010 open inbound allowing requests for inferences to be routed to the Allora Worker Node
  - Single Amazon Elastic Compute Cloud (EC2) instance (the Allora Worker Node) assigned to the public subnet
  - Elastic IP Address (EIP) associated with the EC2 instance to maintain consistent IP addressing across instance restarts

The Allora Worker Node is accessed by the user internally and is not exposed to the Internet to protect the node from unauthorized access. A user can gain access to the EC2 Instance using AWS Session Manager. 

Multiple processes run on the Allora Worker Node (EC2 instance):

  - Docker container with the worker node logic that handles communnication bet
  - Docker container running the model server that reveal inferences to consumers

Allora Public Head Nodes publish the Allora chain requests (requests for inferences from consumers) to Allora worker nodes. When a worker node is initialized, it starts with an environment variable called BOOT_NODES, which helps handle the connection and communications between worker nodes and the head nodes.

The worker node (docker container) will call the function that invokes custom logic that handles. The request-response is a bidirectional flow from the Allora chain (inference requests from consumers) to the public head nodes to the worker node and finally to the model server that reveals inferences. 


## Worker Node System Requirements

- Operating System: Any modern Linux operating system
- CPU: Minimum of 1/2 core
- Memory: 2 to 4 GB
- Storage: SSD or NVMe with at least 5GB of space

## Setup Instructions

### Setup Cloud9

We will use AWS Cloud9 to execute the subsequent commands. Follow the instructions in [Cloud9 Setup](../../docs/setup-cloud9.md).

### Clone this repository and install dependencies

```bash
   git clone https://github.com/aws-samples/aws-blockchain-node-runners.git
   cd aws-blockchain-node-runners
   npm install
```

### Deploy single worker node

1. Make sure you are in the root directory of the cloned repository

2. Configure your setup

    Create your own copy of `.env` file and edit it to update with your AWS Account ID and Region:
    ```bash
   # Make sure you are in aws-blockchain-node-runners/lib/allora
   cd lib/allora
   npm install
   pwd
   cp ./sample-configs/.env-sample-full .env
   nano .env
    ```
   > NOTE:
   > Example configuration parameters are set in the local `.env-sample` file. You can find more examples inside `sample-configs` directory.

   > IMPORTANT:
   > All AWS CDK v2 deployments use dedicated AWS resources to hold data during deployment. Therefore, your AWS account and Region must be [bootstrapped](https://docs.aws.amazon.com/cdk/v2/guide/bootstrapping.html) to create these resources before you can deploy. If you haven't already bootstrapped, issue the following command:
   > ```bash
   > cdk bootstrap aws://ACCOUNT-NUMBER/REGION
   > ```

3. Deploy Allora Worker Node

   ```bash
   pwd
   # Make sure you are in aws-blockchain-node-runners/lib/allora
   npx cdk deploy allora-single-node --json --outputs-file single-node-deploy.json
   ```

## Clear up and undeploy everything

1. Undeploy worker node and common components

   ```bash
   # Setting the AWS account id and region in case local .env file is lost
   export AWS_ACCOUNT_ID=<your_target_AWS_account_id>
   export AWS_REGION=<your_target_AWS_region>

   pwd
   # Make sure you are in aws-blockchain-node-runners/lib/allora

   # Undeploy Single Node
   npx cdk destroy allora-single-node
   ```

2. Follow these steps to delete the Cloud9 instance in [Cloud9 Setup](../../docs/setup-cloud9.md)

   Navigate to the AWS Cloud9 service in your Management Console, then select the environment you have created. On the top right, click **Delete** button and  follow the instructions.

3. Delete the instance profile and IAM role

```bash
aws iam delete-instance-profile --instance-profile-name Cloud9-Developer-Access
aws iam delete-role --role-name Cloud9-Developer-Access
```