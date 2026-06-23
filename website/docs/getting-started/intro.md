---
sidebar_label: About Node Runners
sidebar_position: 1
---

# AWS Blockchain Node Runners

AI-driven blockchain node infrastructure experimentation on AWS.

## What is AWS Blockchain Node Runners?

AWS Blockchain Node Runners is a universal AWS CDK application for rapidly testing and iterating on blockchain node infrastructure configurations. Built with AI-first design principles, it enables you to deploy, experiment with, and optimize blockchain node infrastructure using natural language interactions with AI assistants.

Rather than manually configuring instance types, storage options, and networking, you describe what you need and let AI guide you through infrastructure selection, deployment, and performance tuning.

## Key Concepts

### Universal Architecture

A single CDK application supports multiple blockchain protocols through configuration alone. Instead of maintaining separate infrastructure code for each protocol, Node Runners uses one unified framework that adapts to any supported blockchain through a pluggable blueprint system.

### Pluggable Blueprint System

Blockchain protocols are delivered as **blueprints** — NPM packages that define protocol-specific configuration, node software setup, and healthcheck logic. The repository ships with built-in blueprints and supports installing external ones:

- **Base** — OP Stack L2 nodes (op-geth, op-reth, Nethermind)
- **Bitcoin** — Bitcoin Core nodes
- **BNB** — BNB Smart Chain nodes
- **Ethereum** — Ethereum execution and consensus clients
- **Solana** — Solana validator and RPC nodes
- **Dummy** — A testing/development blueprint for validating infrastructure changes

Adding a new protocol means creating a blueprint package — no changes to the core CDK code required.

### AI-Guided Workflows

Node Runners includes specialized AI workflow prompts for common tasks:

- **Deploy** — AI recommends infrastructure options, estimates costs, generates configuration, and deploys
- **Healthcheck** — AI analyzes node performance metrics and identifies bottlenecks
- **Add Protocol** — AI guides you through creating a new blueprint for an unsupported protocol
- **Security Review** — AI reviews blueprint configurations for security best practices

### Two Deployment Modes

Every blueprint supports two deployment modes:

- **Single Node** — One EC2 instance for development, testing, and experimentation
- **High Availability (HA)** — Multiple nodes behind a load balancer for evaluating production-like scenarios

## Next Steps

- [Prerequisites](/docs/getting-started/prerequisites) — Set up your environment for deployment
- [Explore Blueprints](/docs/blueprints/about) — Learn about the blueprint system and supported protocols
- [Deploy with AI](/docs/ai-prompts/deploy-with-ai) — Deploy your first node using AI assistance
