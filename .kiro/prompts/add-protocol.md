# Add New Blockchain Protocol

Add support for a new blockchain protocol to the Universal Blockchain Node Runner.

## What This Does

This prompt automates the creation of all necessary files for a new protocol:
- Protocol directory structure
- package.json with infrastructure requirements (in `"aws-blockchain-node-runner"` field)
- Sample .env files for different networks
- Configuration scripts or docker-compose files
- User data initialization scripts
- Comprehensive README with cost estimates
- CloudWatch dashboard (optional)
- Traffic shaping support (if applicable)

## Instructions

Read the file `docs/ageai-add-protocol-prompt.md` and follow the step-by-step workflow to add a new blockchain protocol.

## Prerequisites

- URL to the protocol's official RPC node documentation
- Basic understanding of the protocol
- (Optional) Access to protocol's GitHub repository or snapshots

## Expected Outcome

A complete blueprint package in `node_modules/aws-bnr-blueprint-{protocol-name}/` including:
- All required configuration files
- `package.json` with `"aws-blockchain-node-runner"` field
- Sample deployments for mainnet and testnet
- Documentation with accurate cost estimates
- Ready for testing and deployment

## Note

This workflow is for RPC node deployments only. Validator or consensus nodes have different requirements and are not covered.
