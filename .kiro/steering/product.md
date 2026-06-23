# AWS Blockchain Node Runners

AWS Blockchain Node Runners is a collection of CDK applications (Node Runner Blueprints) that deploy self-service blockchain nodes on AWS infrastructure for various blockchain protocols.

## Key Features
- **Multi-Protocol Support**: Supports various blockchain BC_NETWORKS including Ethereum, Solana, BSC, Stacks, Tezos, XRP, and more
- **Deployment Modes**: Single node and high-availability (HA) multi-node configurations
- **AWS Native**: Built using AWS CDK with best practices for security, monitoring, and scalability
- **Self-Service**: Enables developers to deploy and manage their own blockchain infrastructure

## Target Users
- Blockchain developers needing reliable node infrastructure
- Organizations requiring private blockchain node access
- Teams building dApps that need dedicated node endpoints

## Architecture
Each blueprint provides infrastructure-as-code templates for deploying blockchain nodes with:
- EC2 instances optimized for blockchain workloads
- EBS storage for blockchain data
- CloudWatch monitoring and dashboards
- Security groups and IAM roles
- Optional load balancing for HA deployments
