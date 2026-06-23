# Testing Patterns and Best Practices

## Configuration Loading in Tests

### Use Real Protocol Configurations Instead of Mocks

**Pattern**: Always use `ConfigurationLoader` with the real `blueprints/dummy` configuration instead of creating hard-coded mock objects or test fixtures.

**Why**: This approach provides:
- Consistency across test files
- Realistic test scenarios using actual protocol configuration
- Easier maintenance when configuration structures change
- Validation that ConfigurationLoader works correctly
- Tests reflect real deployment scenarios

**Example Setup**:
```typescript
// ✅ Good - Use ConfigurationLoader with real dummy protocol
beforeEach(() => {
  configLoader = new ConfigurationLoader('protocols');
  
  protocolConfig = configLoader.loadProtocolConfig('dummy');
  
  const testEnvPath = path.join(__dirname, '../../blueprints/dummy/samples/.env-testnet-ha-nodes');
  const environmentConfig = configLoader.loadEnvironmentConfig(testEnvPath);
  
  deploymentConfig = {
    protocol: protocolConfig,
    environment: environmentConfig
  };
});

// ❌ Avoid - Hard-coded mock objects
const mockProtocolConfig = {
  BLOCKCHAIN_PROTOCOL: 'ethereum',
  // ... hard-coded values
};
```

### Test Configuration Organization

**Structure**: Use the real dummy protocol for testing:
- `blueprints/dummy/package.json` - Real protocol configuration used in tests (in `"aws-blockchain-node-runner"` field)
- `blueprints/dummy/samples/.env-testnet-single-node` - Single-node test configuration
- `blueprints/dummy/samples/.env-testnet-ha-nodes` - HA deployment test configuration

**Configuration Selection**: Choose configurations that match your test scenario:
- Use `dummy` protocol for all tests (supports both single-node and ha-nodes)
- Use `.env-testnet-single-node` for single-node deployment tests
- Use `.env-testnet-ha-nodes` for HA deployment tests

### Test Expectations Alignment

**Pattern**: Always align test expectations with the actual dummy protocol configuration data, not arbitrary values.

**Process**:
1. First load the configuration from blueprints/dummy
2. Examine the dummy protocol files to understand expected values
3. Write test assertions based on actual configuration content
4. Update tests when dummy protocol configuration changes

**Example**:
```typescript
// ✅ Good - Expectations match dummy protocol configuration
template.hasResourceProperties('AWS::AutoScaling::AutoScalingGroup', {
  DesiredCapacity: '3', // From .env-testnet-ha-nodes
  MaxSize: '6', // 2x desired capacity
});

template.hasResourceProperties('AWS::ElasticLoadBalancingV2::Listener', {
  Port: 8545, // From dummy protocol package.json
  Protocol: 'HTTP',
});

// ❌ Avoid - Arbitrary expectations
template.hasResourceProperties('AWS::AutoScaling::AutoScalingGroup', {
  DesiredCapacity: '2', // Doesn't match configuration
});
```

### Mock VPC Handling

**Pattern**: Create mock VPCs consistently but don't over-use them:
```typescript
beforeEach(() => {
  // Create a mock VPC for testing
  const vpcStack = new cdk.Stack(app, 'VpcStack');
  mockVpc = new ec2.Vpc(vpcStack, 'MockVPC', {
    maxAzs: 2,
  });
});

// Use mockVpc only when explicitly testing VPC functionality
// Let stacks use default VPC lookup for most tests
```

## Common Pitfalls to Avoid

### 1. Hard-Coded Values
- Avoid magic numbers in test assertions
- Reference dummy protocol configuration to understand expected values

### 2. Missing Imports
- Always import `path` when loading configuration files
- Import `ConfigurationLoader` from the correct path

### 3. Unused Variables
- Remove unused mock variables after refactoring
- Clean up variable declarations that are no longer needed

## Test Configuration Maintenance

### When to Update Dummy Protocol
- When changing configuration structure
- When adding new deployment modes
- When updating default values

### Configuration Validation
- Ensure dummy protocol represents realistic configurations
- Keep dummy protocol in sync with actual deployment requirements
- Validate that dummy protocol works with ConfigurationLoader
- Document any special configuration requirements
