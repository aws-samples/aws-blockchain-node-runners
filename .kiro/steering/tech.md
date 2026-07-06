# Technology Stack

## Core Technologies
- **AWS CDK v2**: Infrastructure as Code framework using TypeScript
- **TypeScript**: Primary language for all CDK constructs and stacks
- **Node.js**: Runtime environment (ES2020 target)
- **AWS Services**: EC2, EBS, CloudWatch, IAM, VPC, ALB

## Build System & Tools
- **TypeScript Compiler**: `tsc` for compilation
- **Jest**: Testing framework with coverage reporting
- **CDK Nag**: Security and best practices validation
- **Pre-commit hooks**: Code quality and security scanning
- **Git Secrets**: AWS credential scanning
- **Semgrep**: Static analysis security scanning

## Common Commands
```bash
# Build the project
npm run build

# Run tests
npm run test
npm run test:watch
npm run test:coverage

# Security scanning
npm run scan-repo-git-secrets
npm run scan-semgrep
npm run run-pre-commit

# CDK operations (within blueprint directories)
npx cdk synth
npx cdk deploy
npx cdk destroy
```

## Dependencies

The root `package.json` (and `package-lock.json`) is the source of truth for
versions; the list below is a summary and may lag. Update it when the core
dependencies change.

Runtime dependencies:
- **aws-cdk-lib**: ^2.261.0 - Core CDK v2 library
- **constructs**: ^10.4.3 - CDK constructs framework
- **dotenv**: ^17.2.3 - Environment variable management
- **source-map-support**: ^0.5.21 - Source maps for stack traces

Build / test toolchain (devDependencies):
- **aws-cdk** (CLI): ^2.1129.0 - CDK CLI for synth/deploy
- **typescript**: ~6.0.3 - TypeScript compiler
- **ts-node**: ^10.9.2 - TypeScript execution for the CDK app entrypoint
- **cdk-nag**: ^2.37.55 - Security and compliance validation
- **jest**: ^30.2.0 / **ts-jest**: ^29.4.11 - Unit testing
- **@types/node**: ^24.10.1 / **@types/jest**: ^30.0.0 - Type definitions

> The `aws-cdk` CLI and `aws-cdk-lib` are version-coupled: the CLI must be new
> enough to read the cloud-assembly schema emitted by the library. Bump them
> together (the "Validate CDK synthesis" CI check enforces this). Keep
> `@types/node`'s major aligned with the Node.js runtime you target rather than
> chasing its latest release.

## Development Standards
- Strict TypeScript configuration with null checks
- Jest for unit testing with coverage requirements
- Pre-commit hooks for code quality
- Security scanning with git-secrets and semgrep
- CDK Nag validation for AWS best practices
