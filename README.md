# AWS Blockchain Node Runners

A universal, AI-friendly AWS CDK application for rapidly testing and iterating on blockchain node infrastructure configurations. Experiment with different instance types, storage options, and deployment modes using natural language prompts.

## Overview

The AWS Blockchain Node Runners provides a single, unified infrastructure-as-code solution for blockchain node deployment on AWS. Built with AI-first design principles, it enables rapid experimentation and optimization of infrastructure configurations through natural language interactions with AI assistants.

📖 **Full Documentation:** [aws-samples.github.io/aws-blockchain-node-runners](https://aws-samples.github.io/aws-blockchain-node-runners)

### Key Features

- **AI-Guided Infrastructure Selection**: Get recommendations on instance types, storage, and configuration based on protocol requirements
- **Rapid Deployment & Iteration**: Deploy, test, modify, and redeploy infrastructure configurations in minutes
- **AI-Assisted Optimization**: Use healthcheck and troubleshooting workflows to tune performance with AI guidance
- **Universal Architecture**: One CDK app supports different blockchain protocols through configuration
- **Two Deployment Modes**: Single-node for testing, HA for evaluating production-like scenarios
- **Extensible**: Add new protocols without modifying CDK code
- **Ubuntu 24.04 LTS**: Consistent platform across all deployments (x86_64 and ARM_64)

### Supported Protocols

- **Ethereum** — execution and consensus clients
- **Solana** — Agave and Frankendancer validator/RPC clients
- **Base** — OP Stack Layer 2
- **BNB Chain** — BNB Smart Chain nodes
- **Bitcoin** — Bitcoin network nodes
- **Dummy** — reference implementation for testing and development

### Pluggable Blueprint System

Blockchain protocols are delivered as NPM packages (blueprints). Six built-in blueprints ship with the repository — **Ethereum**, **Solana** (Agave and Frankendancer), **Base**, **BNB Chain**, **Bitcoin**, and **Dummy** (reference implementation). External blueprints can be installed from the NPM registry or GitHub:

```bash
# Install an external blueprint
npm install aws-bnr-blueprint-polygon --legacy-peer-deps

# Or from GitHub
npm install github:owner/aws-bnr-blueprint-polygon#v1.0.0 --legacy-peer-deps
```

The `--legacy-peer-deps` flag is required: blueprints declare a peer dependency on the `aws-blockchain-node-runners` framework, which is not published to the npm registry, so npm's default (strict) peer resolution would otherwise fail.

After installing, set `BLOCKCHAIN_PROTOCOL` in your `.env` to the protocol name and deploy. See [Adding New Protocols](./docs/ageai-add-protocol-prompt.md) for how to create your own blueprint package.

## Prerequisites

Before getting started, ensure you have the following installed and configured.

### 1. Node.js (v20 or later)

AWS CDK v2 requires an actively supported Node.js LTS version. Node.js 18 reached end-of-life in April 2025 and CDK support for it ended November 2025, so use Node.js 20 LTS or later.

Verify your version:
```bash
node --version
# Expected: v20.x.x or later
```

Install via [nodejs.org](https://nodejs.org/) or a version manager like [nvm](https://github.com/nvm-sh/nvm):
```bash
# Using nvm
nvm install 20
nvm use 20
```

### 2. AWS CLI

The AWS CLI is needed for CDK bootstrap and credential management.

Install following the [official guide](https://docs.aws.amazon.com/cli/latest/userguide/getting-started-install.html), or:
```bash
# macOS (Homebrew)
brew install awscli

# Verify
aws --version
```

### 3. AWS Account and Credentials

You need an AWS account with permissions to create EC2, VPC, IAM, EBS, CloudWatch, and (for HA deployments) ALB resources.

Configure credentials using one of these methods:

**Option A: Environment variables**
```bash
export AWS_ACCESS_KEY_ID=<your-access-key>
export AWS_SECRET_ACCESS_KEY=<your-secret-key>
export AWS_REGION=us-east-1
```

**Option B: AWS CLI named profiles**
```bash
# Configure a profile
aws configure --profile my-blockchain-profile

# Then tell CDK which profile to use
export AWS_PROFILE=my-blockchain-profile
```

When using Kiro CLI, pass the profile via the environment variable before starting a session:
```bash
export AWS_PROFILE=my-blockchain-profile
kiro-cli
```

For more details, see [AWS CDK prerequisites](https://docs.aws.amazon.com/cdk/v2/guide/prerequisites.html).

### 4. Kiro CLI (optional, recommended)

Kiro CLI enables the AI-driven workflows described in this README (deploy, healthcheck, troubleshoot).

**macOS:**
```bash
curl -fsSL https://cli.kiro.dev/install | bash
```

**Linux:**
```bash
curl -fsSL https://cli.kiro.dev/install | bash
```

After installation, authenticate:
```bash
kiro-cli auth login
```

See the [Kiro CLI installation guide](https://kiro.dev/docs/cli/installation/) for other platforms and options.

### 5. Python and uv (optional, for MCP servers)

This project ships with pre-configured [MCP servers](https://kiro.dev/docs/cli/) in `.kiro/settings/mcp.json` that give Kiro access to AWS documentation and CDK guidance. They run via `uvx`, which requires `uv` (a Python package manager).

Install `uv`:
```bash
# macOS (Homebrew)
brew install uv

# Or via the official installer (macOS/Linux)
curl -LsSf https://astral.sh/uv/install.sh | sh
```

See the [uv installation guide](https://docs.astral.sh/uv/getting-started/installation/) for other methods.

Once `uv` is installed, no further setup is needed — `uvx` will automatically download and run the MCP servers when Kiro starts:
- `awslabs.aws-documentation-mcp-server` — search and read AWS documentation
- `awslabs.cdk-mcp-server` — CDK guidance, construct patterns, and CDK Nag rules

### Quick Verification

Run these commands to confirm everything is ready:
```bash
node --version    # v20.x.x or later
npm --version     # 10.x.x or later
aws --version     # aws-cli/2.x.x
aws sts get-caller-identity  # Should return your account info
```

## AI-Driven Quick Start

The fastest way to test blockchain node infrastructure is using AI assistance. This repository includes specialized prompts for experimentation workflows. A few examples:

```
@deploy an Ethereum mainnet RPC node configuration in us-east-1
```

```
@healthcheck my node's performance and identify bottlenecks
```

```
@troubleshoot my node is syncing slowly, what infrastructure changes should I try?
```

The AI recommends infrastructure options, generates your configuration, deploys the stack, runs a healthcheck, and helps you iterate in minutes.

For the full step-by-step walkthrough, see the [Getting Started guide](https://aws-samples.github.io/aws-blockchain-node-runners/docs/getting-started/quickstart).

## Manual Deployment

Prefer to deploy without AI assistance? You can clone the repo, configure a `.env`, and run the standard CDK commands yourself.

See the [Deployment Guide](https://aws-samples.github.io/aws-blockchain-node-runners/docs/guides/deployment-guide) for the complete manual deployment walkthrough.

## Documentation

Full documentation is published on the website: **[aws-samples.github.io/aws-blockchain-node-runners](https://aws-samples.github.io/aws-blockchain-node-runners)**

- **[Getting Started](https://aws-samples.github.io/aws-blockchain-node-runners/docs/getting-started/quickstart)** — prerequisites through your first deployment
- **[Blueprints](https://aws-samples.github.io/aws-blockchain-node-runners/docs/blueprints/about)** — per-protocol deployment guides (Ethereum, Solana, Base, BNB Chain, Bitcoin, Dummy)
- **Guides** — [Configuration Reference](https://aws-samples.github.io/aws-blockchain-node-runners/docs/guides/configuration-reference), [Deployment Guide](https://aws-samples.github.io/aws-blockchain-node-runners/docs/guides/deployment-guide), [Troubleshooting](https://aws-samples.github.io/aws-blockchain-node-runners/docs/guides/troubleshooting), [Snapshot Staging](https://aws-samples.github.io/aws-blockchain-node-runners/docs/guides/snapshot-staging), [Traffic Shaping](https://aws-samples.github.io/aws-blockchain-node-runners/docs/guides/traffic-shaping), [Testing](https://aws-samples.github.io/aws-blockchain-node-runners/docs/guides/testing)
- **AI Prompts** — [Deploy with AI](https://aws-samples.github.io/aws-blockchain-node-runners/docs/ai-prompts/deploy-with-ai), [Add Protocol with AI](https://aws-samples.github.io/aws-blockchain-node-runners/docs/ai-prompts/add-protocol-with-ai), [Healthcheck with AI](https://aws-samples.github.io/aws-blockchain-node-runners/docs/ai-prompts/healthcheck-with-ai), [Security Review with AI](https://aws-samples.github.io/aws-blockchain-node-runners/docs/ai-prompts/security-review-with-ai)

For contributors, the canonical source files are in `docs/` (Markdown documentation) and `.kiro/` (specs, steering, and AI prompts). The website mirrors these sources.

## Contributing

We welcome contributions! See [CONTRIBUTING.md](./CONTRIBUTING.md) for guidelines.

New protocols are added through the **pluggable NPM blueprint system** — each blueprint is a self-contained NPM package with an `"aws-blockchain-node-runner"` field in its `package.json`, so you can add support for a new chain without modifying the CDK code. See [About Blueprints](https://aws-samples.github.io/aws-blockchain-node-runners/docs/blueprints/about) for the package structure and conventions, and use `blueprints/dummy/` as a reference implementation.

Community-published blueprints live outside this repository and are surfaced through the **Community Blueprints Catalog** on the website. You can discover them with `npm search aws-bnr-blueprint` and install them like any other blueprint. Community blueprints are not reviewed or verified by the core maintainers — always run a [security review](https://aws-samples.github.io/aws-blockchain-node-runners/docs/ai-prompts/security-review-with-ai) before deploying one.

### Areas for Contribution

- Adding new blockchain protocols as blueprints
- Improving AI prompts and experimentation workflows
- Enhancing monitoring and performance analysis
- Infrastructure optimization patterns
- Documentation improvements

## License

This repository uses MIT License. See [LICENSE](./LICENSE) for details.

## Support

- **Issues**: Report bugs and request features via [GitHub Issues](https://github.com/aws-samples/aws-blockchain-node-runners/issues)
- **Documentation**: See [docs/](./docs/) for detailed guides
- **Website**: Visit [AWS Blockchain Node Runners](https://aws-samples.github.io/aws-blockchain-node-runners/)

## Acknowledgments

This universal architecture builds upon the original AWS Blockchain Node Runners blueprints, consolidating multiple protocol-specific implementations into a single, maintainable, AI-friendly solution optimized for rapid infrastructure experimentation and optimization.
