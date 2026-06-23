---
sidebar_label: Prerequisites
sidebar_position: 2
---

# Prerequisites

Before deploying blockchain nodes with AWS Blockchain Node Runners, ensure you have the following tools installed and your environment configured.

## Node.js (v20 or later)

AWS CDK v2 requires an actively supported Node.js LTS version.

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

## AWS CLI

The AWS CLI is needed for CDK bootstrap and credential management.

Install following the [official guide](https://docs.aws.amazon.com/cli/latest/userguide/getting-started-install.html), or:

```bash
# macOS (Homebrew)
brew install awscli

# Verify
aws --version
```

## AWS Account and Credentials

You need an AWS account with permissions to create the following resources:

- EC2 instances and security groups
- VPC networking
- IAM roles and policies
- EBS volumes
- CloudWatch logs and metrics
- Auto Scaling groups and Application Load Balancers (for HA deployments)

### Configure Credentials

Set up AWS credentials using one of these methods:

**Option A: Environment variables**

```bash
export AWS_ACCESS_KEY_ID=<your-access-key>
export AWS_SECRET_ACCESS_KEY=<your-secret-key>
export AWS_REGION=<your-preferred-region>
```

**Option B: AWS CLI named profiles**

```bash
# Configure a profile
aws configure --profile my-blockchain-profile

# Tell CDK which profile to use
export AWS_PROFILE=my-blockchain-profile
```

Verify your credentials are working:

```bash
aws sts get-caller-identity
```

For more details, see [AWS CDK prerequisites](https://docs.aws.amazon.com/cdk/v2/guide/prerequisites.html).

## Quick Verification

Run these commands to confirm everything is ready:

```bash
node --version    # v20.x.x or later
npm --version     # 10.x.x or later
aws --version     # aws-cli/2.x.x
aws sts get-caller-identity  # Should return your account info
```

## Kiro CLI

Kiro CLI enables AI-driven deployment, healthcheck, and troubleshooting workflows.

```bash
# Install
curl -fsSL https://cli.kiro.dev/install | bash

# Authenticate
kiro-cli auth login
```
## Optional

### AWS CloudShell

[AWS CloudShell](https://docs.aws.amazon.com/cloudshell/latest/userguide/welcome.html) is a browser-based shell that comes pre-configured with AWS CLI, Node.js, and all necessary tools at no cost. Open it from the AWS Console to get started without any local installation.

## Next Steps

With your environment ready, continue to the [Quickstart](/docs/getting-started/quickstart) to clone the repository, bootstrap CDK, and deploy your first node. For the full manual deployment walkthrough, see the [Deployment Guide](/docs/guides/deployment-guide), and if you hit any issues, the [Troubleshooting Guide](/docs/guides/troubleshooting).
