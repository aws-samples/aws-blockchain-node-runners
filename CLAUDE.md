# AWS Blockchain Node Runners

Universal AWS CDK application for deploying blockchain node infrastructure through a pluggable blueprint system.

## Project Context

Read all files in `.kiro/steering/` to understand the project structure, technology stack, conventions, and documentation practices.

## GenAI Workflow Prompts

When a user asks to deploy a node, perform a healthcheck, add a protocol, update a client version, review a blueprint's security, or set up the maintenance crew, read the relevant `docs/ageai-*.md` file and follow its step-by-step workflow.

## Maintenance crew

`.kiro/agents/bnr-*.json` and `.kiro/skills/bnr-*/SKILL.md` define a Kiro Crew maintenance crew (`docs/maintenance-crew.md`). They are instructions other agents execute: treat changes to them as high risk, never weaken an approval gate or a permission rule in them, and never give the crew a GitHub write path (its GitHub access is read-only by design; pull-request actions are the maintainer's).

## Key References

- **Architecture and design**: `.kiro/specs/universal-blockchain-node-runner/`
- **Configuration variables**: `docs/configuration-reference.md`
- **Troubleshooting**: `docs/troubleshooting.md`
- **Protocol reference implementation**: `blueprints/dummy/`
