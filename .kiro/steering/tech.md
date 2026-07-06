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

Versions are intentionally **not** listed here — they are tracked in the package
manifests, which are the single source of truth. See the root `package.json` and
`package-lock.json` (CDK app) and `website/package.json` (docs site) for the
current, authoritative versions. This section only names the key dependencies and
their roles.

Runtime dependencies (CDK app):
- **aws-cdk-lib** - Core CDK v2 library
- **constructs** - CDK constructs framework
- **dotenv** - Environment variable management
- **source-map-support** - Source maps for stack traces

Build / test toolchain (devDependencies):
- **aws-cdk** (CLI) - CDK CLI for synth/deploy
- **typescript** - TypeScript compiler
- **ts-node** - TypeScript execution for the CDK app entrypoint
- **cdk-nag** - Security and compliance validation
- **jest** / **ts-jest** - Unit testing
- **@types/node** / **@types/jest** - Type definitions

> The `aws-cdk` CLI and `aws-cdk-lib` are version-coupled: the CLI must be new
> enough to read the cloud-assembly schema emitted by the library, so bump them
> together (the "Validate CDK synthesis" CI check enforces this). Keep
> `@types/node`'s major aligned with the Node.js runtime you target rather than
> chasing its latest release.

## Development Standards
- Strict TypeScript configuration with null checks
- Jest for unit testing with coverage requirements
- Pre-commit hooks for code quality
- Security scanning with git-secrets and semgrep
- CDK Nag validation for AWS best practices
