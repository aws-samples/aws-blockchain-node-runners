# AWS Blockchain Node Runners

This repository contains sample [AWS Cloud Development Kit (CDK)](https://aws.amazon.com/cdk/) applications (Node Runner blueprints) to deploy on AWS self-service blockchain nodes for various protocols. For more information see [Introducing AWS Blockchain Node Runners](https://aws-samples.github.io/aws-blockchain-node-runners/docs/intro).

### Documentation
For deployment instructions see [AWS Blockchain Node Runners Blueprints](https://aws-samples.github.io/aws-blockchain-node-runners/docs/Blueprints/intro)

### Contributing
See [CONTRIBUTING](./CONTRIBUTING.md) for more information.

### Directory structure

- `docs` - General documentation applicable to all Node Runner blueprints (CDK applications within the `./lib` directory)
- `lib` - The place for all Node Runner blueprints and shared re-usable [CDK constructs](https://docs.aws.amazon.com/cdk/v2/guide/constructs.html)
- `lib/constructs` - [CDK constructs](https://docs.aws.amazon.com/cdk/v2/guide/constructs.html) used in Node Runner blueprints
- `lib/your-chain` - Node Runner blueprint for a specific chain
- `lib/your-chain/doc` - Documentation specific to the Node Runner blueprint
- `lib/your-chain/lib` - Place for CDK stacks and other blueprint assets
- `lib/your-chain/sample-configs` - Place for sample configurations to deploy Node Runner blueprint to your environment
- `lib/your-chain/test` - Place for unit tests to verify the Node Runner blueprint creates all necessary infrastructure
- `website` - Content for the project web site built with [Docusaurus](https://docusaurus.io/)
- `website/docs` - Place for the new blueprint deployment instructions. (If you are adding a new blueprint, use on of the existing examples to refer to the `README.md` file within your Node Runner blueprint directory inside `lib`).

### License
This repository uses MIT License. See more in [LICENSE](./LICENSE)
