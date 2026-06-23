# AWS Blockchain Node Runners

Universal AWS CDK application for deploying blockchain node infrastructure through a pluggable blueprint system.

## Project Context

Read all files in `.kiro/steering/` to understand the project structure, technology stack, conventions, and documentation practices.

## GenAI Workflow Prompts

When a user asks to deploy a node, perform a healthcheck, add a protocol, or review a blueprint's security, read the relevant `docs/ageai-*.md` file and follow its step-by-step workflow.

## Key References

- **Architecture and design**: `.kiro/specs/universal-blockchain-node-runner/`
- **Configuration variables**: `docs/configuration-reference.md`
- **Troubleshooting**: `docs/troubleshooting.md`
- **Protocol reference implementation**: `blueprints/dummy/`
