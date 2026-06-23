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
- **aws-cdk-lib**: ^2.189.1 - Core CDK library
- **constructs**: ^10.3.0 - CDK constructs framework
- **dotenv**: ^16.4.5 - Environment variable management
- **cdk-nag**: ^2.36.18 - Security and compliance validation

## Development Standards
- Strict TypeScript configuration with null checks
- Jest for unit testing with coverage requirements
- Pre-commit hooks for code quality
- Security scanning with git-secrets and semgrep
- CDK Nag validation for AWS best practices
