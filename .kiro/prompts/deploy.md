# Deploy Blockchain Node

Deploy a blockchain node on AWS using the Universal Blockchain Node Runner.

## What This Does

This prompt guides you through deploying a blockchain node with:
- Infrastructure recommendations based on protocol requirements
- Cost estimation (using AWS cli)
- Configuration generation
- Deployment execution
- Post-deployment healthcheck (after 5 minutes)

## Instructions

Read the file `docs/ageai-deploy-prompt.md` and follow the step-by-step workflow to deploy a blockchain node on AWS.

## Prerequisites

- AWS account with appropriate permissions
- AWS CDK bootstrapped in target region
- Protocol name and network (mainnet/testnet)

## Expected Outcome

A fully deployed and initialized blockchain node with:
- EC2 instance running the node software
- EBS volumes configured for blockchain data
- CloudWatch monitoring and logs enabled
- Initial healthcheck completed
