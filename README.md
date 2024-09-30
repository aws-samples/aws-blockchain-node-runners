# AWS Blockchain Node Runners

This repository contains sample [AWS Cloud Development Kit (CDK)](https://aws.amazon.com/cdk/) applications (Node Runner Blueprints) to deploy on AWS self-service blockchain nodes for various protocols. For more information, see [Introducing AWS Blockchain Node Runners](https://aws-samples.github.io/aws-blockchain-node-runners/docs/intro).

### Documentation
For deployment instructions, see [AWS Blockchain Node Runners Blueprints](https://aws-samples.github.io/aws-blockchain-node-runners/docs/Blueprints/intro).

### Adding blueprints for new nodes

If you'd like propose a Node Runner Blueprint for your node, see [Adding new Node Runner Blueprints](./docs/adding-new-nodes.md).

### Directory structure

- `docs` - General documentation applicable to all Node Runner Blueprints (CDK applications within the `./lib` directory)
- `lib` - The place for all Node Runner Blueprints and shared re-usable [CDK constructs](https://docs.aws.amazon.com/cdk/v2/guide/constructs.html)
- `lib/constructs` - [CDK constructs](https://docs.aws.amazon.com/cdk/v2/guide/constructs.html) used in Node Runner Blueprints
- `lib/your-chain` - Node Runner Blueprint for a specific chain
- `website` - Content for the project web site built with [Docusaurus](https://docusaurus.io/)
- `website/docs` - Place for the new blueprint deployment instructions. (If you are adding a new blueprint, use on of the existing examples to refer to the `README.md` file within your Node Runner Blueprint directory inside `lib`).

### License
This repository uses MIT License. See more in [LICENSE](./LICENSE).

### Contributing
See [CONTRIBUTING](./CONTRIBUTING.md) for more information.
