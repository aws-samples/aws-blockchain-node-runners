---
sidebar_position: 1
sidebar_label: About blueprints
---

# Node Runners Blueprints

The Node Runner Blueprints are TypeScript applications built using the [AWS Cloud Development Kit (CDK)](https://aws.amazon.com/cdk/). These blueprints implement the infrastructure-as-code (IaC) paradigm, allowing you to deploy your own blockchain nodes on AWS in various configurations, including solo nodes and highly available setups, for development, testing, or proof-of-concept purposes.

Most of the applications in the Node Runner Blueprints suite rely on an `.env` file located in the root directory to retrieve input parameters. These parameters determine the compute resources, storage options, and node setup configurations to be used during the deployment process.

👈 Use navigation bar on the left for the setup guides for different protocols.

## Adding new Node Runner Blueprints

First of all, THANK YOU! The easier it is to run a blockchain node on AWS the simpler it is for the ecosystem to build with it. Here are the major steps to contribute a Node Runner Blueprint:

1. Check with our list of [Issues](https://github.com/aws-samples/aws-blockchain-node-runners/issues) if someone is already working on the node type you are after. If yes - join the forces! If no, go to the next step.
2. Create a new issue to propose a new node type to let everyone know that you are going ot work on it. Use `Feature request` template for that.
3. [Fork this repository](https://help.github.com/articles/fork-a-repo/).
4. Use one of the existing blueprints as a baseline. Choose the one that has architecture closest to the one you want to create.
5. Once you are happy with how your blueprint works, follow our [Contribution Guide](https://github.com/aws-samples/aws-blockchain-node-runners/blob/main/CONTRIBUTING.md) to create a [pull request](https://help.github.com/articles/creating-a-pull-request/) for our team to review it.
6. Once merged, let your community know that the new Node Runner Blueprint is ready for them to use!

### Recommended directory and file structure for a Node Runner Blueprint

- `lib/your-chain/doc/` - Documentation specific to the Node Runner Blueprint
- `lib/your-chain/lib/` - Place for CDK stacks and other blueprint assets
- `lib/your-chain/lib/assets/` - Place for everything that needs to be within the provisioned EC2 instance (user-data scripts, docker-compose files, etc.)
- `lib/your-chain/lib/config/` - Your version of the config reader to parse values from `.env` file
- `lib/your-chain/lib/constructs/` - All CDK constructs specific to this  Node Runner Blueprint
- `lib/your-chain/lib/*-stack.ts` - All [CDK stacks](https://docs.aws.amazon.com/cdk/v2/guide/stacks.html) for this Node Runner Blueprint
- `lib/your-chain/sample-configs/` - Place for sample configurations to deploy Node Runner Blueprint to your environment
- `lib/your-chain/test/` - Place for unit tests to verify the Node Runner Blueprint creates all necessary infrastructure
- `lib/your-chain/.env-sample` - A sample configuration file
- `lib/your-chain/app.ts` - Entry point to your AWS CDK application
- `lib/your-chain/cdk.json` - Config file for [feature flags](https://docs.aws.amazon.com/cdk/v2/guide/featureflags.html) for your AWS CDK application
- `lib/your-chain/jest.config.json` - [Configuration file for Jest](https://jestjs.io/docs/configuration)
- `lib/your-chain/README.md` - All information and usage instructions for your Node Runner Blueprint

### Reusable imports and CDK constructs for stacks in Node Runner Blueprints

- `lib/constructs/config.interface.ts` - Interface classes to implement your own configuration module. Compatible with `ha-rpc-nodes-with-alb` and `single-node` constructs (see below).
- `lib/constructs/constants.ts` - Useful constants to use in configuration files and to set up infrastructure.
- `lib/constructs/ha-rpc-nodes-with-alb.ts` - Provisions up to 4 identical EC2 instances to run nodes managed by an Auto Scaling Group and behind an Application Load Balancer.
- `lib/constructs/single-node.ts` - Creates a single EC2 instance to run a blockchain node.
- `lib/constructs/snapshots-bucket.ts` - Creates an S3 bucket to store a copy of blockchain node state to speed up syncing process.
- `lib/constructs/amb-ethereum-single-node.ts` - Creates a single Ethereum node with [Amazon Managed Blockchain Access](https://docs.aws.amazon.com/managed-blockchain/latest/ethereum-dev/ethereum-concepts.html).
