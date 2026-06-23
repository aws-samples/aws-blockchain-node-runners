# Testing Guide

This guide explains how to run tests for the Universal Blockchain Node Runner.

## Overview

The project uses Jest as the testing framework with comprehensive unit and integration tests. Tests use the actual `blueprints/dummy` configuration to ensure realistic testing scenarios.

## Running Tests

### Run All Tests

```bash
npm test
```

### Run Tests with Coverage

```bash
npm run test:coverage
```

This generates a coverage report in the `coverage/` directory.

### Run Specific Test File

```bash
npm test -- configuration-loader.test.ts
```

### Run Tests in Watch Mode

```bash
npm run test:watch
```

### Run Tests for Specific Directory

```bash
npm test -- test/unit/core/
```

### Run Tests Matching Pattern

```bash
npm test -- --testNamePattern="should load protocol config"
```

## Test Structure

```
test/
├── unit/                        # Unit tests
│   ├── common/                 # CDK constructs tests
│   ├── core/                   # Core components tests
│   ├── interfaces/             # Interface tests
│   ├── security/               # Security compliance tests
│   └── stacks/                 # CDK stacks tests
└── integration/                 # Integration tests
```

**Note**: Tests use the real `blueprints/dummy` configuration instead of mock fixtures to ensure tests reflect actual deployment scenarios.

## Common Issues

### Issue: Tests Fail After Configuration Change

**Solution**: Update `blueprints/dummy` configuration to match new structure, as tests use the real dummy protocol configuration

### Issue: CDK Assertions Fail

**Solution**: Use `Template.fromStack(stack).toJSON()` to see actual CloudFormation template

### Issue: Timeout Errors

**Solution**: Increase Jest timeout:
```typescript
jest.setTimeout(30000);  # 30 seconds
```

## Testing Checklist

Before submitting code:

- [ ] All tests pass: `npm test`
- [ ] Coverage meets threshold: `npm run test:coverage`
- [ ] No console errors or warnings
- [ ] Tests are descriptive and clear
- [ ] Security tests pass (CDK Nag)

## Continuous Integration

Tests run automatically on:
- Push to any branch
- Pull request creation
- Pull request updates

GitHub Actions workflow runs:
```bash
npm install
npm run build
npm test
npm run test:coverage
```

## See Also

- [Configuration Reference](/docs/guides/configuration-reference) - Configuration documentation
- [Contributing](https://github.com/aws-samples/aws-blockchain-node-runners/blob/main/CONTRIBUTING.md) - Contribution guidelines
- [Troubleshooting](/docs/guides/troubleshooting) - Common issues
- [Design Document](https://github.com/aws-samples/aws-blockchain-node-runners/blob/main/.kiro/specs/universal-blockchain-node-runner/design.md) - System architecture and design decisions
