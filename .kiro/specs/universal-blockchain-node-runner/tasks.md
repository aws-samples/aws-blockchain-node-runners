# Implementation Plan

## Current Status Summary

**Completed Phases:**
- ✅ Phase 1: Foundation and Core Interfaces (100%)
- ✅ Phase 2: Configuration Management (100%)
- ✅ Phase 3: Script and Asset Management (100%)
- ✅ Phase 4: Universal Assets and Scripts (100%)
- ✅ Phase 5: CDK Constructs (100%)
- ✅ Phase 6: CDK Stacks (100%)
- ✅ Phase 7: Dummy Protocol Configuration (100%)
- ✅ Phase 8: Application Entry Point (100%)
- ✅ Phase 9: Validation and Error Handling (100%)
- ✅ Phase 10: Security and Compliance (100%)
- ✅ Phase 11: Documentation (100%)
- ✅ Phase 12: Integration and Final Testing (100%)
- ✅ Phase 13: Traffic Shaping Implementation (100%)
- ✅ Phase 14: Real Protocol Implementations (100%)
- ✅ Phase 15: Pluggable NPM Blueprint System (100%)
- ✅ Phase 16: Availability Zone Configuration (merged) — implementation complete; optional property/unit tests pending
- ✅ Phase 17: Instance Store RAID Volumes (merged) — implementation complete; optional bats/CDK tests pending
- 🔄 Phase 18: Solana Frankendancer Support (merged) — in progress (node.sh client detection task 53 underway)
- ✅ Phase 19: Website Restructure (merged) — implementation complete
- ✅ Phase 20: Snapshot Staging Volume (merged) — implementation complete; optional CDK/lifecycle tests (77) and reboot-recovery E2E (79.2) pending

**Merged Feature Specs:**
The following standalone specs were consolidated into this universal spec (Requirements 23–27, matching design sections, and Phases 16–20):
- `availability-zone-configuration` → Requirement 23 / Phase 16
- `instance-store-raid-volumes` → Requirement 24 / Phase 17
- `solana-frankendancer-support` → Requirement 25 / Phase 18
- `website-restructure` → Requirement 26 / Phase 19
- `base-snapshot-disk-overflow-fix` + `snapshot-staging-cleanup-fix` → Requirement 27 / Phase 20 (combined: staging mechanism + hardened cleanup)

**Implementation Status:**
- All core infrastructure is complete and tested (277+ tests passing)
- Documentation is comprehensive and up-to-date
- Dummy protocol serves as working reference implementation
- Ethereum and Solana real protocols implemented; Solana Frankendancer client support in progress
- Optional property-based tests (marked `*`) across merged phases require `fast-check`/bats-core; installing `fast-check` needs user approval per workspace dependency rules

---

## Overview

This plan implements the Universal Blockchain Node Runner from scratch, building a configuration-driven CDK application that consolidates all blockchain-specific implementations into a single universal application. Each task builds incrementally, with testing integrated throughout.

## Tasks

## Phase 1: Foundation and Core Interfaces

- [x] 1. Set up project structure and core TypeScript interfaces
  - Create directory structure: lib/interfaces/, lib/core/, lib/common/, lib/stacks/, test/unit/, test/integration/, test/fixtures/
  - Create lib/interfaces/index.ts as central export point
  - Define enums in lib/interfaces/enums.ts (DeploymentMode, CpuType)
  - Define ProtocolConfig interface in lib/interfaces/protocol-config.ts
  - Define EnvironmentConfig interface in lib/interfaces/environment-config.ts
  - Define DeploymentConfig interface in lib/interfaces/deployment-config.ts
  - Define ValidationResult interface in lib/interfaces/deployment-config.ts
  - Create test/fixtures/ directory structure with blueprints/ and env/ subdirectories
  - _Requirements: 1.1, 1.2, 6.1_

## Phase 2: Configuration Management

- [x] 2. Implement Configuration Loader component
  - Create IConfigurationLoader interface in lib/interfaces/configuration-loader.ts
  - Create ConfigurationLoader class in lib/core/configuration-loader.ts
  - Implement loadProtocolConfig() method to read and parse protocol config.json files
  - Implement loadEnvironmentConfig() method to parse .env files with dotenv
  - Implement parseDataVolumes() method to extract storage volume configurations
  - Implement parseHAConfig() method to extract HA-specific settings
  - Implement validateConfiguration() method with comprehensive validation rules
  - Implement validateProtocolConfiguration() method for protocol compatibility checks
  - Implement extractProtocolCustomEnvVars() method to parse custom variables
  - Create test fixtures: test/fixtures/blueprints/dummy/config.json
  - Create test fixtures: test/fixtures/env/single-node.env and ha-nodes.env
  - Write unit tests in test/unit/core/configuration-loader.test.ts
  - _Requirements: 2.1, 6.1, 6.2, 6.3_

## Phase 3: Script and Asset Management

- [x] 3. Implement User Data Manager component
  - Create IUserDataManager interface in lib/interfaces/user-data-manager.ts
  - Create UserDataManager class in lib/core/user-data-manager.ts
  - Implement loadUniversalUserDataScript() method to read template from assets/common/
  - Implement injectVariables() method with placeholder replacement logic
  - Implement generateUserDataScript() method combining load and inject
  - Create test fixtures with mock user data scripts
  - Write unit tests in test/unit/core/user-data-manager.test.ts
  - Write integration tests in test/unit/core/user-data-manager-integration.test.ts
  - _Requirements: 2.2, 2.5_

- [x] 4. Implement Assets Manager component
  - Create IAssetsManager interface in lib/interfaces/assets-manager.ts
  - Create AssetsManager class in lib/core/assets-manager.ts using aws-cdk-lib/aws-s3-assets
  - Implement uploadAssets() method to package and upload assets/common/
  - Implement uploadProtocolAssets() method to package and upload protocol-specific assets
  - Implement validateAssets() method to check required files exist
  - Implement validateProtocolAssets() method for protocol-specific validation
  - Implement getAssetsPath() and getProtocolAssetssPath() helper methods
  - Create test fixtures in test/fixtures/assets/common/
  - Write unit tests in test/unit/core/assets-manager.test.ts
  - _Requirements: 8.1, 8.2, 8.3_

## Phase 4: Universal Assets and Scripts

- [x] 5. Create universal assets and scripts
  - [x] Create assets/common/ directory structure
  - [x] Implement assets/common/setup-storage.sh for EBS volume formatting and mounting
  - [x] Create assets/common/cfn-hup-setup.sh for CloudFormation helper installation
  - [x] Copy assets/common/cw-agent.json from existing implementation
  - [x] Implement assets/common/user-data-ubuntu.sh as universal template with placeholders
  - [x] Add variable injection placeholders: ${BLOCKCHAIN_PROTOCOL}, ${DEPLOYMENT_MODE}, etc.
  - [x] Include CloudWatch agent installation and configuration logic
  - [x] Add CloudFormation signaling for single-node mode
  - [x] Add ASG lifecycle hook signaling for HA mode
  - [x] Custom variables are injected directly via UserDataManager (no separate parse script needed)
  - _Requirements: 1.3, 2.3, 3.1, 8.4_
  - _Note: parse-custom-variables.sh is NOT needed - custom variables are injected directly by UserDataManager.injectVariables()_

- [x] 5.1 Configure CloudWatch agent to collect systemd service logs from syslog
  - [x] Update assets/common/cw-agent.json to collect /var/log/syslog (Ubuntu's rsyslog automatically forwards systemd logs to syslog)
  - [x] Configure CloudWatch log group as /aws/ec2/blockchain-nodes/systemd-services
  - [x] Test that systemd service logs (node.service, syncchecker.service, net-rules.service) appear in CloudWatch
  - [x] Write integration tests for systemd log forwarding to CloudWatch
  - _Requirements: 15.1, 15.2, 15.3, 15.4, 15.5_
  - _Note: Ubuntu's default rsyslog configuration automatically forwards all systemd service logs to /var/log/syslog, so no additional rsyslog configuration is needed_

## Phase 5: CDK Constructs

- [x] 6. Implement SingleNodeConstruct
  - Create SingleNodeConstruct class in lib/common/single-node-construct.ts
  - Define SingleNodeProps interface with protocol and deployment configs
  - Implement VPC lookup using ec2.Vpc.fromLookup() for default VPC
  - Implement security group creation based on protocol.requiredPorts
  - Implement IAM role creation with SSM and CloudWatch permissions
  - Implement EC2 instance creation with configurable instance type
  - Implement EBS volume creation and attachment based on storage config
  - Implement user data injection with CDK-managed variables
  - Add CloudFormation outputs for instance ID and public IP
  - Create test fixtures for single-node scenarios
  - Write unit tests in test/unit/common/single-node-construct.test.ts
  - _Requirements: 1.4, 2.4, 3.2, 3.5_

- [x] 7. Implement HANodesConstruct
  - Create HANodesConstruct class in lib/common/ha-nodes-construct.ts
  - Define HANodesProps interface with HA-specific configuration
  - Implement VPC lookup using ec2.Vpc.fromLookup() for default VPC
  - Implement security group creation for ALB and instances
  - Implement IAM role creation with ASG lifecycle hook permissions
  - Implement Application Load Balancer with target group
  - Implement Auto Scaling Group with launch template
  - Implement lifecycle hooks for graceful node startup/shutdown
  - Configure health checks based on protocol monitoring config
  - Add CloudFormation outputs for ALB DNS name and target group ARN
  - Create test fixtures for HA scenarios
  - Write unit tests in test/unit/common/ha-nodes-construct.test.ts
  - _Requirements: 1.5, 2.5, 3.3, 3.5_

- [x] 8. Implement MonitoringConstruct
  - Create MonitoringConstruct class in lib/common/monitoring-construct.ts
  - Define MonitoringProps interface with dashboard template path
  - Implement CloudWatch dashboard creation from JSON templates
  - Implement variable substitution for instance IDs and resource names
  - Support single-node monitoring configurations
  - Add protocol-specific metrics based on template
  - Add infrastructure metrics (CPU, memory, disk, network)
  - Create test fixtures with sample dashboard templates
  - Write unit tests in test/unit/common/monitoring-construct.test.ts
  - Note: HA deployments do not include default monitoring dashboards
  - _Requirements: 1.6, 2.6, 3.4, 5.7_

## Phase 6: CDK Stacks

- [x] 9. Implement Stack Factory component
  - Create IStackFactory interface in lib/interfaces/stack-factory.ts
  - Create StackFactory class in lib/core/stack-factory.ts
  - Implement createSingleNodeStack() method
  - Implement createHANodesStack() method
  - Implement createStack() method with mode-based routing
  - Integrate with ConfigurationLoader, UserDataManager, and AssetsManager
  - Write unit tests in test/unit/core/stack-factory.test.ts
  - _Requirements: 1.7, 2.7, 3.5_

- [x] 10. Implement SingleNodeStack
  - Create SingleNodeStack class in lib/stacks/single-node-stack.ts
  - Extend cdk.Stack with proper stack props
  - Integrate SingleNodeConstruct with configuration
  - Integrate MonitoringConstruct with dashboard template
  - Use VPC lookup for default VPC
  - Ensure stack is self-contained with all necessary resources
  - Add CloudFormation outputs for deployment information
  - Create test fixtures for single-node stack scenarios
  - Write unit tests in test/unit/stacks/single-node-stack.test.ts
  - _Requirements: 1.4, 2.4, 3.2, 3.5, 4.4_

- [x] 11. Implement HANodesStack
  - Create HANodesStack class in lib/stacks/ha-nodes-stack.ts
  - Extend cdk.Stack with proper stack props
  - Integrate HANodesConstruct with configuration
  - Integrate MonitoringConstruct with dashboard template
  - Use VPC lookup for default VPC
  - Ensure stack is self-contained with all necessary resources
  - Add CloudFormation outputs for ALB endpoint and scaling information
  - Create test fixtures for HA stack scenarios
  - Write unit tests in test/unit/stacks/ha-nodes-stack.test.ts
  - _Requirements: 1.5, 2.5, 3.3, 3.5, 4.4_

## Phase 7: Dummy Protocol Configuration

- [x] 12. Create Dummy protocol configuration for testing
  - Create blueprints/dummy/ directory structure
  - Create blueprints/dummy/config.json with minimal valid configuration
  - Set customEnvVarsNamePrefix to "DUMMY"
  - Define customEnvVars with sample protocol-specific variables
  - Create blueprints/dummy/samples/.env-testnet sample configuration
  - Create blueprints/dummy/user-data/node.sh with basic node startup and mock metrics
  - Implement simple mock node that sends test metrics to CloudWatch
  - Create blueprints/dummy/monitoring/single-node-dashboard-template.json
  - Update test fixtures to use dummy protocol
  - Write integration tests in test/integration/dummy-configuration.test.ts
  - _Requirements: 2.1, 2.6, 6.2, 6.4_

## Phase 8: Application Entry Point and Testing with Dummy Protocol

- [x] 13. Implement main CDK application entry point
  - Create app.ts in project root as universal CDK application
  - Implement environment variable loading with dotenv
  - Detect BLOCKCHAIN_PROTOCOL from environment
  - Instantiate ConfigurationLoader with blueprints directory path
  - Load protocol and environment configurations
  - Instantiate UserDataManager and generate user data script
  - Instantiate AssetsManager and upload assets
  - Instantiate StackFactory and create appropriate stack
  - Add comprehensive error handling with clear messages
  - Add validation before stack creation
  - Create cdk.json pointing to app.ts
  - Write integration tests in test/integration/app-integration.test.ts using Dummy protocol
  - _Requirements: 1.7, 2.7, 3.5_

## Phase 9: Validation and Error Handling

- [x] 14. Enhance validation system
  - Extend ConfigurationLoader with comprehensive validation
  - Add protocol existence validation
  - Add required environment variable validation
  - Add instance type validation against AWS offerings
  - Add storage configuration validation (size, IOPS, throughput limits)
  - Add port configuration validation
  - Add HA configuration validation (node count, health check settings)
  - Add network configuration validation
  - Implement clear error messages with suggested fixes
  - Write unit tests for all validation scenarios in configuration-loader.test.ts
  - _Requirements: 1.8, 2.8, 3.6_

- [x] 15. Implement comprehensive error handling
  - Add try-catch blocks throughout all components
  - Implement custom error classes for different error types
  - Add structured logging using console with log levels
  - Implement graceful degradation where possible
  - Create error message templates with troubleshooting hints
  - Add stack trace preservation for debugging
  - Implement validation error aggregation
  - Write unit tests for error handling in test/unit/core/error-handling.test.ts
  - _Requirements: 1.8, 2.8, 3.6_

## Phase 10: Security and Compliance

- [x] 16. Implement CDK Nag security compliance
  - [x] Add cdk-nag import to app.ts
  - [x] Apply AwsSolutionsChecks to CDK app with appropriate configuration
  - [x] Add NagSuppressions where necessary with clear justifications
  - [x] Implement encryption for EBS volumes in SingleNodeConstruct
  - [x] Implement encryption for EBS volumes in HANodesConstruct
  - [x] Implement least-privilege IAM policies for EC2 instances
  - [x] Implement least-privilege IAM policies for ASG lifecycle hooks
  - [x] Add security group rules with principle of least privilege
  - [x] Implement S3 bucket encryption for assets
  - [x] Write security compliance tests in test/unit/security/cdk-nag.test.ts

  - _Requirements: 1.10, 2.10, 3.8, 7.1, 7.3_

## Phase 11: Documentation

- [x] 17. Create comprehensive documentation
  - [x] Update root README.md with universal architecture overview and quick start guide
  - [x] Document architecture and design decisions for universal application
  - [x] Create docs/ directory if it doesn't exist
  - [x] Create docs/adding-new-protocols.md with step-by-step guide for adding new blockchain protocols
  - [x] Include GenAI prompts and templates for protocol generation in docs/adding-new-protocols.md
  - [x] Document configuration options and all environment variables in docs/configuration-reference.md
  - [x] Create docs/troubleshooting.md guide with common issues and solutions
  - [x] Add comprehensive JSDoc comments to all public interfaces and classes
  - [x] Create example .env files for each protocol in blueprints/{protocol}/samples/
  - [x] Document testing approach and how to run tests in docs/testing.md
  - [x] Create docs/deployment-guide.md for different deployment scenarios
  - [x] Add architecture diagrams showing universal application flow
  - _Requirements: 1.11, 2.11, 3.9, 9.1, 9.2, 9.3, 9.4_

- [x] 17.1 Update troubleshooting documentation for CloudWatch systemd logs
  - [x] Update docs/troubleshooting.md to replace journalctl commands with CloudWatch Logs commands
  - [x] Document how to view node.service logs in CloudWatch Logs console
  - [x] Document how to view syncchecker.service logs in CloudWatch Logs console
  - [x] Document how to view net-rules.service logs in CloudWatch Logs console
  - [x] Add CloudWatch Logs Insights query examples for common troubleshooting scenarios
  - [x] Document the log group name: /aws/ec2/blockchain-nodes/systemd-services
  - [x] Add examples of filtering logs by service name in CloudWatch
  - [x] Document how to check service status using CloudWatch Logs instead of SSH
  - [x] Update deployment guide with information about systemd log access via CloudWatch
  - _Requirements: 15.5, 15.6_

- [x] 18. Update protocol-specific documentation
  - [x] Update blueprints/dummy/README.md as template for new protocols
  - [x] Include deployment architecture diagrams in blueprints/dummy/README.md
  - [x] Document setup instructions and configuration options for dummy protocol
  - [x] Add FAQ section with common issues for dummy protocol
  - [x] Create protocol documentation template that can be copied for new protocols
  - _Requirements: 10.1, 10.2, 10.3, 10.4, 10.5, 10.6, 10.7_

## Phase 12: Integration and Final Testing with Dummy Protocol

- [x] 19. Create comprehensive integration tests with Dummy protocol
  - Write end-to-end test for Dummy single-node deployment
  - Write end-to-end test for Dummy HA deployment
  - Implement CDK synthesis tests for all stack types using Dummy protocol
  - Test configuration validation with invalid inputs
  - Test error handling with malformed configurations
  - Create mock AWS environment for testing
  - Ensure all tests pass with good coverage
  - _Requirements: 1.9, 2.9, 3.7_

- [x] 20. Final integration and validation with Dummy protocol
  - Run complete test suite and ensure all tests pass
  - Verify CDK synthesis succeeds for Dummy protocol in both single-node and HA modes
  - Validate that no TypeScript compilation errors exist
  - Run CDK Nag checks and ensure compliance
  - Test with actual .env files for Dummy protocol
  - Validate CloudFormation templates are correct
  - Verify all CloudFormation outputs are present
  - Test asset upload and download mechanisms
  - Validate user data scripts are correctly generated
  - Perform code review and cleanup
  - _Requirements: 1.12, 2.12, 3.10_

## Phase 13: Traffic Shaping Implementation

- [x] 21. Implement traffic shaping configuration support
  - Add TrafficShapingConfig interface to lib/interfaces/protocol-config.ts
  - Add traffic shaping fields to EnvironmentConfig interface in lib/interfaces/environment-config.ts
  - Update ConfigurationLoader to parse TRAFFIC_SHAPING_* environment variables
  - Add validation for traffic shaping configuration in ConfigurationLoader
  - Update UserDataManager to inject traffic shaping variables into user data scripts
  - Write unit tests for traffic shaping configuration parsing
  - Write unit tests for traffic shaping validation
  - _Requirements: 14.9, 14.10_

- [x] 22. Create universal traffic shaping scripts
  - [x] Create assets/common/network/ directory for universal traffic shaping scripts
  - [x] Implement assets/common/network/net-rules-start.sh with nftables and tc configuration
  - [x] Implement assets/common/network/net-rules-stop.sh to remove all traffic shaping rules
  - [x] Create assets/common/network/net-rules.service systemd service definition
  - [x] Test net-rules-start.sh creates correct nftables rules and tc filters
  - [x] Test net-rules-stop.sh removes all rules cleanly
  - [x] Update AssetsManager to upload common/network/ scripts as part of common assets
  - _Requirements: 14.1, 14.2, 14.5, 14.6, 14.7_

- [x] 23. Integrate traffic shaping with user data scripts
  - Update assets/common/user-data-ubuntu.sh to include traffic shaping setup logic
  - Add conditional logic to copy universal traffic shaping scripts from common assets when TRAFFIC_SHAPING_ENABLED=true
  - Add logic to copy protocol-specific syncchecker.sh from protocol assets
  - Add systemd timer setup for syncchecker.sh in user data script
  - Add systemd service installation for net-rules.service in user data script
  - Ensure traffic shaping scripts are executable and have correct permissions
  - Add logging for traffic shaping setup steps
  - Test traffic shaping setup in user data script execution
  - _Requirements: 14.11_

- [x] 24. Add traffic shaping to Dummy protocol
  - Add trafficShaping configuration to blueprints/dummy/config.json
  - Set supported=true, recommendedForRPC=true, recommendedForConsensus=false, defaultRateMbps=40
  - Create blueprints/dummy/user-data/syncchecker.sh with dummy-specific sync checking logic
  - Implement mock sync status API endpoint query in syncchecker.sh
  - Implement traffic shaping control logic (systemctl start/stop net-rules.service)
  - Implement CloudWatch metrics reporting for c1_block_height and c1_blocks_behind
  - Update blueprints/dummy/samples/.env files with traffic shaping configuration examples
  - Update blueprints/dummy/user-data/node.sh to create mock sync status endpoint
  - Write integration tests for traffic shaping with dummy protocol
  - Test traffic shaping enable/disable cycle with dummy protocol
  - Test CloudWatch metrics are reported correctly
  - _Requirements: 14.3, 14.4, 14.8, 14.12_

- [x] 25. Documentation and testing for traffic shaping
  - Update docs/configuration-reference.md with traffic shaping variables
  - Create docs/traffic-shaping.md with short description of how Traffic Shaping solution works (up to 3 paragraphs)
  - Document traffic shaping setup in docs/deployment-guide.md
  - Add traffic shaping troubleshooting to docs/troubleshooting.md
  - Update docs/adding-new-protocols.md with traffic shaping integration steps
  - Add traffic shaping examples to protocol README templates
  - Write basic unit tests for traffic shaping components
  - Write integration tests for traffic shaping lifecycle
  - _Requirements: 14.1, 14.2, 14.3, 14.4, 14.5, 14.6, 14.7, 14.8, 14.9, 14.10, 14.11, 14.12, 14.13_

## Phase 14: Real Protocol Implementations

- [x] 26. Create Ethereum protocol and use docs/ading-new-protocols.md, blueprints/dummy, and old-lib/ethereum as references
  - [x] Create blueprints/ethereum/ directory structure (samples/, configurations/, user-data/, monitoring/)
  - [x] Create blueprints/ethereum/config.json based on design document specifications
  - [x] Set customEnvVarsNamePrefix to "ETH"
  - [x] Define customEnvVars: ETH_CONSENSUS_CHECKPOINT_SYNC_URL
  - [x] Define requiredPorts for JSON RPC (8545), WebSocket (8546), P2P (30303), Consensus (9000)
  - [x] Create blueprints/ethereum/samples/.env-mainnet sample configuration
  - [x] Create blueprints/ethereum/samples/.env-sepolia sample configuration
  - [x] Create blueprints/ethereum/samples/.env-holesky sample configuration
  - [x] Create blueprints/ethereum/configurations/ with Docker compose templates for client combinations
  - [x] Reference old-lib/ethereum/lib/assets/node/ for client combination patterns
  - [x] Create blueprints/ethereum/user-data/node.sh for Docker-based Ethereum node setup
  - [x] Create blueprints/ethereum/user-data/common/ helper scripts (configure-monitoring.sh, download-snapshot.sh)
  - [x] Create blueprints/ethereum/README.md following blueprint structure with deployment instructions
  - [x] Write integration tests in test/integration/ethereum-configuration.test.ts
  - [x] Test single-node deployment with Ethereum protocol
  - [x] Test HA deployment with Ethereum protocol
  - _Requirements: 2.1, 2.6, 6.2, 6.4, 10.1, 10.2, 10.3_

- [x] 27. Create Solana protocol configuration
  - Create blueprints/solana/ directory structure (samples/, configurations/, user-data/, monitoring/)
  - Create blueprints/solana/config.json based on design document specifications
  - Set customEnvVarsNamePrefix to "SOLANA"
  - Define optional customEnvVars: SOLANA_NODE_IDENTITY_SECRET_ARN
  - Define requiredPorts for JSON RPC (8899), WebSocket (8900), Gossip ranges (8001-8020)
  - Create blueprints/solana/user-data/syncchecker.sh with Solana-specific sync checking
  - Implement Solana getHealth RPC endpoint query in syncchecker.sh
  - Extract numSlotsBehind from .error.data.numSlotsBehind JSON path
  - Implement traffic shaping control logic based on slots behind threshold
  - Implement CloudWatch metrics reporting for c1_block_height and c1_blocks_behind
  - Create blueprints/solana/samples/.env-mainnet-beta sample configuration with traffic shaping examples
  - Create blueprints/solana/samples/.env-testnet sample configuration
  - Create blueprints/solana/samples/.env-devnet sample configuration
  - Create blueprints/solana/configurations/ with node config templates (agave-rpc-base, agave-rpc-extended)
  - Reference old-lib/solana/lib/assets/node/ for configuration patterns
  - Create blueprints/solana/user-data/node.sh for native Solana setup with traffic shaping support
  - Create blueprints/solana/user-data/common/ helper scripts (build-solana.sh, setup-configuration.sh, configure-monitoring.sh, download-snapshot.sh)
  - Create blueprints/solana/monitoring/single-node-dashboard-template.json with Solana-specific metrics
  - Create blueprints/solana/monitoring/ha-dashboard-template.json for HA deployments
  - Create blueprints/solana/README.md following blueprint structure with deployment instructions and traffic shaping documentation
  - Write integration tests in test/integration/solana-configuration.test.ts
  - Write integration tests for Solana traffic shaping
  - Test single-node deployment with Solana protocol
  - Test HA deployment with Solana protocol
  - Test traffic shaping with Solana mainnet-beta configuration
  - Test CloudWatch metrics are reported correctly for Solana
  - _Requirements: 2.1, 2.6, 6.2, 6.4, 10.4, 10.5, 10.6, 10.7, 14.3, 14.4, 14.8, 14.13_

## Phase 15: Pluggable NPM Blueprint System

- [x] 28. Migrate built-in blueprints to NPM package structure
  - Add `package.json` to `blueprints/dummy/` with `"aws-blockchain-node-runner"` field containing all fields from `blueprints/dummy/config.json`
  - Add `package.json` to `blueprints/ethereum/` with `"aws-blockchain-node-runner"` field containing all fields from `blueprints/ethereum/config.json`
  - Add `package.json` to `blueprints/solana/` with `"aws-blockchain-node-runner"` field containing all fields from `blueprints/solana/config.json`
  - Add `peerDependencies` on core package to each blueprint `package.json` for version compatibility (e.g., `"aws-blockchain-node-runners": ">=2.0.0"`)
  - Remove `blueprints/dummy/config.json`, `blueprints/ethereum/config.json`, `blueprints/solana/config.json`
  - Add `file:` path dependencies to root `package.json` for all three built-in blueprints: `"aws-bnr-blueprint-ethereum": "file:blueprints/ethereum"`, `"aws-bnr-blueprint-solana": "file:blueprints/solana"`, `"aws-bnr-blueprint-dummy": "file:blueprints/dummy"`
  - Run `npm install` to verify built-in blueprints are correctly symlinked into `node_modules/`
  - _Requirements: 16.1, 16.6, 19.1, 19.2, 19.3_

- [x] 29. Extend ConfigurationLoader to resolve blueprints from node_modules
  - Update `ConfigurationLoader.loadProtocolConfig(protocolName)` to read from `node_modules/<package>/package.json` `"aws-blockchain-node-runner"` field instead of `blueprints/{protocol}/config.json`
  - Implement lookup logic: iterate root `package.json` dependencies, find the package whose `"aws-blockchain-node-runner".BLOCKCHAIN_PROTOCOL` matches the requested protocol name
  - Throw a clear error if no installed dependency declares the requested protocol, listing available protocols
  - Throw an error if two installed packages declare the same `BLOCKCHAIN_PROTOCOL` value, identifying both package names
  - Version compatibility is handled by NPM `peerDependencies` at install time (no custom runtime check needed)
  - Update `ConfigurationLoader.protocolExists(protocolName)` to check `node_modules/` instead of `blueprints/` directory
  - Update `ConfigurationLoader.getAvailableProtocols()` to return protocols from installed packages
  - Update `AssetsManager.getProtocolAssetssPath(protocolName)` to resolve the blueprint package root from `node_modules/` rather than `blueprints/`
  - Update all other path resolutions (dashboard template, user-data script) to use the blueprint package root from `node_modules/`
  - Write unit tests for the new resolution logic with mock `node_modules/` fixtures
  - Write unit tests for conflict detection (two packages with same `BLOCKCHAIN_PROTOCOL`)
  - Write unit tests for version compatibility via `peerDependencies`
  - _Requirements: 17.2, 17.3, 17.4, 18.1, 18.2, 18.3, 18.7, 19.4_

- [x] 30. Add blueprint validation in ConfigurationLoader
  - Validate all required `"aws-blockchain-node-runner"` fields are present and match `ProtocolConfig` schema when loading a blueprint
  - Validate `defaultConfiguration` exists in `availableConfigurations`
  - Validate `user-data/node.sh` file exists in the blueprint package root
  - Collect and report all validation errors together rather than stopping at the first
  - Write unit tests for each validation rule using malformed blueprint fixtures
  - _Requirements: 18.1, 18.2, 18.4, 18.5, 18.6_

- [x] 31. Add listAvailableProtocols and getBlueprintFilePath to ConfigurationLoader
  - Implement `ConfigurationLoader.listAvailableProtocols()` returning `{ BLOCKCHAIN_PROTOCOL, packageName, version, description, isBuiltIn }` for each installed blueprint package
  - `isBuiltIn` is `true` when the root `package.json` dependency value starts with `file:`
  - Implement `ConfigurationLoader.getBlueprintFilePath(protocolName, relativePath)` resolving absolute path to a file within a blueprint package in `node_modules/`
  - Write unit tests for both methods
  - _Requirements: 17.1, 19.5, 22.1_

- [x] 32. Update test fixtures for NPM-based blueprint structure
  - Replace `test/fixtures/blueprints/dummy/config.json` with `test/fixtures/blueprints/dummy/package.json` containing `"aws-blockchain-node-runner"` field
  - Replace `test/fixtures/blueprints/ethereum/config.json` with `test/fixtures/blueprints/ethereum/package.json`
  - Add mock `node_modules/` fixture structure for unit tests that test the new resolution logic
  - Add fixture for a malformed blueprint package (missing required fields) for validation tests
  - Add fixture for a conflicting blueprint package (duplicate `BLOCKCHAIN_PROTOCOL`) for conflict detection tests
  - Update all existing tests that reference `config.json` to use the new `package.json` structure
  - Ensure all 277+ existing tests continue to pass
  - _Requirements: 18.1, 18.2, 18.6, 19.1_

- [x] 33. Create GenAI blueprint security review guide
  - Create `docs/ageai-blueprint-security-review.md` following the workflow defined in the design document
  - Document the blueprint discovery workflow: how to call `listAvailableProtocols()`, distinguish built-in vs external, run `npm search aws-bnr-blueprint`
  - Document the security review checklist: `package.json` field review, `user-data/` script review, red flags to look for
  - Document the deployment gate: assistant must not provide deployment commands until user acknowledges the security review
  - Include the disclaimer that community blueprints are not verified by core maintainers
  - Update `docs/ageai-deploy-prompt.md` to reference the security review guide for external blueprints
  - _Requirements: 20.1, 22.1, 22.2, 22.3, 22.4, 22.5, 22.6, 22.7, 22.8_

- [x] 34. Update documentation for pluggable blueprint system
  - Update `docs/adding-new-protocols.md` (or equivalent) to describe how to create and publish a blueprint as an NPM package
  - Update all documentation files within the `docs` folder to make sure all sample configurations  are now copyied from the NPM package and other important data or disagnostics has to involve the analysis of the NPM package and no longer the local `blueprints/` folder.
  - Document the `"aws-blockchain-node-runner"` field schema with all required and optional fields
  - Document the blueprint package naming convention `aws-bnr-blueprint-<protocol>`
  - Document how to install an external blueprint via `npm install` or GitHub URL
  - Update `README.md` to mention the pluggable blueprint system and link to the guide
  - Update `blueprints/dummy/README.md` as the canonical reference implementation for external blueprint authors
  - _Requirements: 16.7, 20.1, 20.2, 20.4_

## Phase 16: Availability Zone Configuration (merged from availability-zone-configuration)

Add an optional `AWS_AZ` environment variable to pin single-node deployments to a specific AZ. Flows through interface → parsing → validation → construct AZ selection. HA deployments ignore the field. Tasks marked `*` are optional (property/unit tests). `fast-check` is required for property tests and must be installed with user approval per workspace dependency rules.

- [x] 35. Add `AWS_AZ` field to `EnvironmentConfig` interface
  - [x] 35.1 Add optional `AWS_AZ?: string` to `EnvironmentConfig` in `lib/interfaces/environment-config.ts`, after `AWS_REGION`. Do NOT add to `ENVIRONMENT_CONFIG_KEYS` (optional, not required) or `ENVIRONMENT_CONFIG_DEFAULTS`.
    - _Requirements: 23.1_

- [x] 36. Implement `AWS_AZ` parsing in `ConfigurationLoader`
  - [x] 36.1 Add `AWS_AZ` parsing to `parseEnvVars()` in `lib/core/configuration-loader.ts` after the `STACK_NAME_PREFIX` block. Set `config.AWS_AZ` only when present and non-empty after trim; otherwise leave undefined.
    - _Requirements: 23.2, 23.3_
  - [ ]* 36.2 Property test: AZ parsing round-trip — generate valid AZ strings, parse, verify exact preservation. (`fast-check` devDependency requires user approval.)
    - _Validates: 23.3_
  - [ ]* 36.3 Unit tests for parsing: set → value; absent → undefined; empty `""` → undefined; whitespace → undefined. Add to `test/unit/core/configuration-loader.test.ts`.
    - _Requirements: 23.2, 23.3_

- [x] 37. Implement `AWS_AZ` validation in `ConfigurationLoader`
  - [x] 37.1 Add format + region validation to `validateConfiguration()` after the `STACK_NAME_PREFIX` block. Format regex `/^[a-z]{2}-[a-z]+-\d+[a-z]$/` → `errors[]`; region consistency `AWS_AZ.startsWith(AWS_REGION)` → `errors[]` (else-if, only if format valid); when `DEPLOYMENT_MODE === DeploymentMode.HA_NODES` and `AWS_AZ` set → `warnings[]`.
    - _Requirements: 23.4, 23.5, 23.8_
  - [ ]* 37.2 Property test: AZ format validation correctness. _Validates: 23.4_
  - [ ]* 37.3 Property test: AZ region consistency validation. _Validates: 23.5_
  - [ ]* 37.4 Unit tests: valid AZ → no errors; invalid formats (`us-east-1`, `US-EAST-1A`, `us-east-1ab`, `123`) → format error; wrong region → region error; AZ in `ha-nodes` → warning only; AZ not set → none.
    - _Requirements: 23.4, 23.5, 23.8_

- [x] 38. Checkpoint — ensure tests pass; ask the user if questions arise.

- [x] 39. Update `SingleNodeConstruct` AZ selection logic
  - [x] 39.1 In `lib/common/single-node-construct.ts`, set `chosenAvailabilityZone = environment.AWS_AZ || (existing azIndex/default logic)`. The same variable already drives both the EC2 instance and EBS volumes.
    - _Requirements: 23.6, 23.7_
  - [ ]* 39.2 Unit tests: `AWS_AZ` set → instance + EBS volumes use it; not set → default logic. Add to `test/unit/common/single-node-construct.test.ts`.
    - _Requirements: 23.6, 23.7_

- [x] 40. Add commented-out `AWS_AZ` entry to all sample `.env` files
  - [x] 40.1 In the AWS Configuration section of every sample `.env` (after `AWS_REGION`, before `STACK_NAME_PREFIX`), add:
    ```
    # Availability Zone (optional - override automatic AZ selection for single-node deployments)
    # AWS_AZ="<region>a"
    ```
    Use the sample's own region for the example value. Covers all samples across `base`, `bitcoin`, `bnb`, `dummy`, `ethereum`, and `solana` blueprints (including the new Frankendancer samples).
    - _Requirements: 23.9_

- [x] 41. Update documentation for `AWS_AZ`
  - [x] 41.1 Add `AWS_AZ` row to the AWS Configuration table in `docs/configuration-reference.md` with a note that it must match `<region><letter>`, belong to `AWS_REGION`, and is ignored for HA.
  - [x] 41.2 Add optional `AWS_AZ` to the `.env` template/field list in `docs/ageai-add-protocol-prompt.md`.
  - [x] 41.3 Add an `AWS_AZ` tip to `docs/deployment-guide.md` (set it when the instance type is unavailable in the default AZ).
  - [x] 41.4 Add an AZ troubleshooting entry to `docs/troubleshooting.md` including the `aws ec2 describe-instance-type-offerings` check.
    - _Requirements: 23.9_

- [x] 42. Final checkpoint — ensure tests pass; ask the user if questions arise.

## Phase 17: Instance Store RAID Volumes (merged from instance-store-raid-volumes)

Add RAID 0 support for instance store NVMe volumes in `assets/common/setup-storage.sh` plus a monitoring construct device-ID fix. No new `.env` variables. Tasks marked `*` are optional (bats-core/property/CDK tests).

- [x] 43. Add helper functions to `setup-storage.sh`
  - [x] 43.1 Implement `ensure_mdadm` (install `mdadm` via apt if absent, log status), placed above `main()`.
    - _Requirements: 24.5_
  - [x] 43.2 Implement `collect_instance_store_configs` — iterate `DATA_VOL_{N}_*` (1..`DATA_VOLUMES_COUNT`), collect `instance-store` entries into parallel arrays (`IS_MOUNT_PATHS`, `IS_FILESYSTEMS`, `IS_SIZES`), set `IS_COUNT`.
    - _Requirements: 24.1, 24.2, 24.3, 24.4_
  - [ ]* 43.3 Property test: RAID mode detection by instance-store count (none/single/dual/error). _Validates: 24.1–24.4_

- [x] 44. Implement single RAID assembly
  - [x] 44.1 Implement `setup_single_raid <mount_path> <filesystem>` — discover NVMe drives, require ≥1 (else error+exit 1), create `/dev/md0` (RAID 0) with all drives, format, mount, UUID fstab entry (`defaults,nofail` ext4 / `noatime,nodiratime,nodiscard,nofail` xfs), `mdadm --detail --scan >> /etc/mdadm/mdadm.conf`, chown `bcuser:bcuser`, log device/members/mount.
    - _Requirements: 24.1, 24.5, 24.8, 24.9_
  - [ ]* 44.2 Property test: NVMe drive discovery returns only eligible drives. _Validates: 24.5_
  - [ ]* 44.3 Property test: single RAID array includes all discovered drives. _Validates: 24.1_

- [x] 45. Implement dual RAID assembly
  - [x] 45.1 Implement `setup_dual_raid <m1> <fs1> <s1> <m2> <fs2> <s2>` — discover drives, require ≥2 (else error+exit 1); ≥4 drives → split proportionally (`max(1, round(N*S1/(S1+S2)))`, both ≥1); 2–3 drives → `sgdisk` partition each by `s1:s2`; create `/dev/md0` and `/dev/md1`, format/mount each, UUID fstab for both, `mdadm.conf`, chown both, log allocation.
    - _Requirements: 24.2, 24.5, 24.6, 24.7, 24.8, 24.9_
  - [ ]* 45.2 Property test: dual proportional drive allocation (≥4 drives). _Validates: 24.6_
  - [ ]* 45.3 Property test: dual partition-based split (<4 drives). _Validates: 24.7_

- [x] 46. Restructure `main()` and integrate RAID logic
  - [x] 46.1 Call `collect_instance_store_configs()` first; dispatch by `IS_COUNT` (0 skip / 1 `ensure_mdadm`+`setup_single_raid` / 2 `ensure_mdadm`+`setup_dual_raid` / >2 error+exit 1); skip `instance-store` entries in the existing EBS loop; log RAID mode at start and final `lsblk`; preserve EBS-only behavior.
    - _Requirements: 24.1, 24.2, 24.3, 24.4, 24.9, 24.11, 24.12_
  - [ ]* 46.2 Shell unit tests (mock `lsblk`/`mdadm`/`mkfs`/`mount`/`sgdisk`/`apt-get`): all-EBS → no RAID; 1 → single; 2 → dual; 3 → error; mixed; dual 2/3/4/6 drives; ratios 50/50, 80/20, 99/1; zero drives → error.
    - _Requirements: 24.1–24.9, 24.11_

- [x] 47. Checkpoint — verify shell tests pass; ask the user if questions arise.

- [x] 48. Update monitoring construct device-ID mapping
  - [x] 48.1 In the `dataVolumes.forEach` loop of `lib/common/monitoring-construct.ts`, track a `raidIndex`; assign `D{N}_DEVICE_ID = md${raidIndex}` (and increment) for `instance-store`, else `nvme${N}n1`. Keep `D{N}_MOUNT_PATH`/`D{N}_FILESYSTEM` unchanged.
    - _Requirements: 24.10, 24.11_
  - [ ]* 48.2 CDK unit tests: all-EBS → `nvme1n1`/`nvme2n1`; single instance-store → `md0`; two (Solana) → `md0`/`md1`; mixed. Add to `test/unit/common/monitoring-construct.test.ts`.
    - _Requirements: 24.10, 24.11_
  - [ ]* 48.3 Property test: dashboard device ID mapping (`md{K}` for instance-store, `nvme{N}n1` for EBS). _Validates: 24.10_

- [x] 49. Final checkpoint — run `npm run build` and `npm run test`; ensure all shell + CDK tests pass.

## Phase 18: Solana Frankendancer Support (merged from solana-frankendancer-support)

Add Frankendancer (hybrid Firedancer/Agave) client support to `blueprints/solana/`. No CDK TypeScript changes; existing Agave artifacts remain untouched. Reference: https://docs.firedancer.io/. Tasks marked `*` are optional tests.

- [x] 50. Create the Frankendancer build script
  - [x] 50.1 Create `blueprints/solana/user-data/common/build-frankendancer.sh` (pattern of `build-solana.sh`): accept version `$1`; install build deps (GCC 8.5+, Rust, clang, git, make); `git clone --recurse-submodules --branch v${VERSION}`; `./deps.sh` then `make -j$(nproc) fdctl solana`; copy `fdctl`+`solana` to `/home/bcuser/bin/`; chown `bcuser:bcuser`, chmod 755; clean up; `set -e` with stderr logging.
    - _Requirements: 25.1_
  - [ ]* 50.2 Property test: build script exists and is executable. _Validates: 25.1_

- [x] 51. Create Frankendancer configuration scripts
  - [x] 51.1 Create `configurations/frankendancer-0.819.30111-rpc-base.sh` — generate `/home/bcuser/config/frankendancer.toml` (`user`, `[gossip]`, `[consensus]` no_voting=true, `[rpc]` full_api/transaction_history/private=true, extended_tx_metadata_storage=false, port=8899, bind=EC2 IP, `[ledger]` path/accounts_path/limit_size, `[layout]`, `[log]`); network `case` for mainnet-beta/testnet/devnet (exit 1 otherwise); run `fdctl configure init all` then `exec fdctl run`; `set -o errexit/nounset/pipefail`.
    - _Requirements: 25.2, 25.3_
  - [x] 51.2 Create `configurations/frankendancer-0.819.30111-rpc-extended.sh` — base plus `[ledger].account_indexes` (spl-token-owner, program-id, spl-token-mint), `account_index_exclude_keys` (kinX…, Token…), `[rpc].extended_tx_metadata_storage=true`.
    - _Requirements: 25.3_
  - [ ]* 51.3 Property test: TOML structure completeness. _Validates: 25.2_
  - [ ]* 51.4 Property test: network-specific TOML correctness. _Validates: 25.2_
  - [ ]* 51.5 Property test: base vs extended differentiation. _Validates: 25.3_

- [x] 52. Checkpoint — verify new scripts are syntactically valid (shellcheck if available); ask the user if questions arise.

- [-] 53. Modify `node.sh` for client detection and systemd differentiation
  - [x] 53.1 Add `case "$CLIENT_CONFIG"` dispatch (`frankendancer*`/`agave*`/`*`→exit 1). Frankendancer → `build-frankendancer.sh` + systemd unit WITHOUT `User=` (root) + `LimitMEMLOCK=infinity`; Agave → existing behavior (`User=bcuser`, `LimitMEMLOCK=2000000000`). Both: `LimitNOFILE=1000000`, `Restart=always`, `RestartSec=10`, `EnvironmentFile=/etc/cdk_environment`. Shared flow unchanged; update header comment.
    - _Requirements: 25.4_
  - [ ]* 53.2 Property test: client detection routing. _Validates: 25.4_
  - [ ]* 53.3 Property test: systemd privilege model matches client type. _Validates: 25.4_

- [x] 54. Update `package.json` metadata
  - [x] 54.1 Update `blueprints/solana/package.json` `"aws-blockchain-node-runner"`: add both Frankendancer configs (v0.819.30111) to `availableConfigurations`; add port 8003/udp (public, shred) to `requiredPorts` (do NOT add 9001/9007); add "Frankendancer" to `monitoring.clientNames`; update `description`; preserve all Agave entries.
    - _Requirements: 25.5, 25.8_
  - [ ]* 54.2 Property test: Agave artifact preservation. _Validates: 25.8_

- [x] 55. Create Frankendancer sample `.env` files
  - [x] 55.1 `.env-mainnet-beta-frankendancer-rpc-base` (i7i.12xlarge, TRAFFIC_SHAPING_ENABLED=true, 2-volume /data+/accounts, SOLANA_NODE_IDENTITY_SECRET_ARN=none). _Requirements: 25.6_
  - [x] 55.2 `.env-mainnet-beta-frankendancer-rpc-extended` (i7i.24xlarge). _Requirements: 25.6_
  - [x] 55.3 `.env-mainnet-beta-frankendancer-rpc-base-ha` (DEPLOYMENT_MODE=ha-nodes + HA config). _Requirements: 25.6_
  - [x] 55.4 `.env-testnet-frankendancer-rpc-base` (BC_NETWORK=testnet, i7i.4xlarge). _Requirements: 25.6_
  - [ ]* 55.5 Property test: Frankendancer sample env consistency. _Validates: 25.6_

- [x] 56. Checkpoint — verify all new files and modifications; ask the user if questions arise.

- [x] 57. Update README documentation
  - [x] 57.1 Update `blueprints/solana/README.md`: add Frankendancer to Available Configurations table; "Agave vs Frankendancer" comparison; Frankendancer troubleshooting (hugetlbfs, AF_XDP, `fdctl configure`); hardware requirements (same as Agave); port 9001/9007 restriction rationale (RPC-only); FAQ "When to choose Frankendancer"; update architecture diagrams and Quick Start. Follow `.kiro/steering/documentation-consistency.md`.
    - _Requirements: 25.8_

- [x] 58. Final checkpoint — ensure all tests pass; ask the user if questions arise. (syncchecker.sh needs no changes — same RPC API on 8899, validates 25.7.)

## Phase 19: Website Restructure (merged from website-restructure)

Restructure the Docusaurus 3.x site (`website/`) for the universal, AI-first architecture. Wrapper pages import from root `docs/` and `blueprints/` via MDX (3 levels up: `../../../`). No PBT applicable (static site).

- [x] 59. Remove legacy pages and old directory structure
  - [x] 59.1 Delete `website/docs/intro/` (`intro.md`, `setup.md` — the latter imports non-existent `docs/setup-cloud9.md`). _Requirements: 26.6_
  - [x] 59.2 Delete `website/docs/Blueprints/` (legacy pages referencing old `lib/{protocol}/`). _Requirements: 26.6_

- [x] 60. Create Getting Started pages
  - [x] 60.1 Create `website/docs/getting-started/intro.md` (`sidebar_label: Introduction`, AI-first positioning, universal architecture/blueprint system). _Requirements: 26.2_
  - [x] 60.2 Create `website/docs/getting-started/prerequisites.md` (`sidebar_label: Prerequisites`, AWS account, CDK, Node.js, env setup). _Requirements: 26.2_

- [x] 61. Create Guides wrapper pages (import from `../../../docs/*.md`)
  - [x] 61.1 `guides/deployment-guide.md`. _Requirements: 26.3_
  - [x] 61.2 `guides/configuration-reference.md`. _Requirements: 26.3_
  - [x] 61.3 `guides/troubleshooting.md`. _Requirements: 26.3_
  - [x] 61.4 `guides/testing.md`. _Requirements: 26.3_
  - [x] 61.5 `guides/traffic-shaping.md`. _Requirements: 26.3_
  - [x] 61.6 `guides/snapshot-staging.md`. _Requirements: 26.3_

- [x] 62. Create AI Workflows wrapper pages (import from `../../../docs/ageai-*.md`)
  - [x] 62.1 `ai-workflows/deploy-with-ai.md`. _Requirements: 26.4_
  - [x] 62.2 `ai-workflows/add-protocol-with-ai.md`. _Requirements: 26.4_
  - [x] 62.3 `ai-workflows/healthcheck-with-ai.md`. _Requirements: 26.4_
  - [x] 62.4 `ai-workflows/security-review-with-ai.md`. _Requirements: 26.4_

- [x] 63. Create Blueprints pages
  - [x] 63.1 `blueprints/about.md` (inline): new `blueprints/{protocol}/` structure, pluggable NPM package system, link `docs/ageai-add-protocol-prompt.md`, list Base/Bitcoin/BNB/Ethereum/Solana/Dummy. _Requirements: 26.5_
  - [x] 63.2 `blueprints/base.md` (import `../../../blueprints/base/README.md`). _Requirements: 26.5_
  - [x] 63.3 `blueprints/bitcoin.md`. _Requirements: 26.5_
  - [x] 63.4 `blueprints/bnb.md`. _Requirements: 26.5_
  - [x] 63.5 `blueprints/ethereum.md`. _Requirements: 26.5_
  - [x] 63.6 `blueprints/solana.md`. _Requirements: 26.5_

- [x] 64. Checkpoint — verify new content structure; ask the user if questions arise.

- [x] 65. Update sidebar configuration
  - [x] 65.1 Replace `website/sidebars.js` with hybrid config: four explicit categories ("Getting Started", "Guides", "AI Workflows", "Blueprints") each using `{ type: 'autogenerated', dirName }`; ordering via `sidebar_position` frontmatter.
    - _Requirements: 26.2_

- [x] 66. Update Docusaurus configuration
  - [x] 66.1 `docusaurus.config.js` metadata/build: tagline → "AI-driven blockchain node infrastructure experimentation on AWS"; `onBrokenLinks`/`onBrokenMarkdownLinks` → `'throw'`. _Requirements: 26.1, 26.8_
  - [x] 66.2 Navbar items: Getting Started (`getting-started/intro`), Guides (`guides/deployment-guide`), AI Workflows (`ai-workflows/deploy-with-ai`), Blueprints (`blueprints/about`), GitHub. _Requirements: 26.7_
  - [x] 66.3 Footer: "Documentation" (Getting Started, Configuration Reference) and "Community" (GitHub, Contribution Guide); keep copyright. _Requirements: 26.7_

- [x] 67. Update landing page
  - [x] 67.1 `website/src/pages/index.js`: primary CTA "Get Started" → `/docs/getting-started/intro`; secondary CTA "Explore Blueprints" → `/docs/blueprints/about`; layout description update. _Requirements: 26.1_
  - [x] 67.2 `website/src/components/HomepageFeatures/index.js`: three cards — AI-Guided Deployment (🤖), Rapid Experimentation (⚡), Universal Architecture (🏗️). _Requirements: 26.1_

- [x] 68. Checkpoint — build verification
  - Run `cd website && npm run build`; with `onBrokenLinks`/`onBrokenMarkdownLinks` set to `'throw'`, broken references fail the build. Ask the user if questions arise.
  - _Requirements: 26.8_

## Phase 20: Snapshot Staging Volume (merged from base-snapshot-disk-overflow-fix + snapshot-staging-cleanup-fix)

Add a temporary gp3 EBS staging volume for large snapshot downloads (keeps the archive off `/data`) with verifiable cleanup, Base + BNB adoption, and a cheap Dummy debug path. Universal CDK + shared bash helper; existing behavior preserved when disabled. Tasks marked `*` are optional tests.

- [x] 69. Add `SNAPSHOT_STAGING_VOL_SIZE` to config interfaces and parser
  - [x] 69.1 Add `SNAPSHOT_STAGING_VOL_SIZE?: number` to `EnvironmentConfig` (`lib/interfaces/environment-config.ts`) and default `0` in `ENVIRONMENT_CONFIG_DEFAULTS`.
  - [x] 69.2 Parse `SNAPSHOT_STAGING_VOL_SIZE` in `parseEnvVars()` (`lib/core/configuration-loader.ts`).
  - [x] 69.3 Add `SNAPSHOT_STAGING_VOL_ID` to `CFNandCDKUserDataConfig` (`lib/interfaces/cfn-cdk-environment-config.ts`).
    - _Requirements: 27.1_

- [x] 70. Add staging volume creation to `single-node-construct.ts`
  - [x] 70.1 When `SNAPSHOT_STAGING_VOL_SIZE > 0 && SNAPSHOT_ENABLED`, create a gp3 volume (1000 MB/s, 16000 IOPS, encrypted, `RemovalPolicy.DESTROY`, tag `Purpose=snapshot-staging`), attach at `/dev/xvdz` via `CfnVolumeAttachment`, inject `SNAPSHOT_STAGING_VOL_ID`.
  - [x] 70.2 Grant `ec2:DetachVolume`/`ec2:DeleteVolume` against BOTH the staging volume ARN AND the instance ARN (wildcard instance ARN to avoid a CDK dependency cycle) — volume-only scope causes detach denial and orphaning.
    - _Requirements: 27.2, 27.4_

- [x] 71. Add staging volume IAM to `ha-nodes-construct.ts`
  - [x] 71.1 When `SNAPSHOT_STAGING_VOL_SIZE > 0 && SNAPSHOT_ENABLED`, grant `ec2:CreateVolume`/`AttachVolume`/`DetachVolume`/`DeleteVolume`/`DescribeVolumes` scoped by `aws:RequestedRegion` (volume self-managed at runtime).
    - _Requirements: 27.3_

- [x] 72. Inject staging variables in `user-data-ubuntu.sh`
  - [x] 72.1 Echo `SNAPSHOT_STAGING_VOL_SIZE` and `SNAPSHOT_STAGING_VOL_ID` into the `/etc/cdk_environment` Snapshot Configuration block.
    - _Requirements: 27.2, 27.3_

- [x] 73. Create the shared staging helper `assets/common/snapshot-staging.sh`
  - [x] 73.1 `staging_mount()` — no-op→`/data` when size 0; HA self-create+attach when no vol-id; device via `/dev/disk/by-id/` (vol-id) with `/dev/xvdz` fallback; format ext4 if needed; mount `/mnt/snapshot-staging`; export `STAGING_DOWNLOAD_PATH`/`STAGING_ENABLED`.
  - [x] 73.2 `staging_cleanup()` — unmount (lazy fallback) → detach (capture exit) → bounded 3-min wait → delete (capture exit) → **verification gate** `describe-volumes` (NotFound/empty = success) → return 0 only when confirmed; else `_log_err` `ERROR:` line + non-zero. Add `_log_err()` helper.
  - [x] 73.3 Reboot/lost-id recovery: recover vol-id from `/etc/cdk_environment`, then via `describe-volumes` tag filter (`Purpose=snapshot-staging` + instance-id); if none, log error + non-zero (not silent success).
  - [x] 73.4 Preserve graceful fallback to `/data` when mount fails and the disabled no-op path.
    - _Requirements: 27.5, 27.6, 27.7, 27.8, 27.9_

- [x] 74. Adopt staging in Base and BNB `download-snapshot.sh`
  - [x] 74.1 Base: source helper, `staging_mount` before download, download to `$STAGING_DOWNLOAD_PATH`, extract to `/data`, non-masking `EXIT` trap calling `staging_cleanup`, size/skip checks use staging path.
  - [x] 74.2 BNB: same lifecycle (aria2c resume), verify parity with Base, rely on shared `staging_cleanup` (no bespoke detach/delete).
    - _Requirements: 27.11_

- [x] 75. Add the Dummy debug path
  - [x] 75.1 Create `blueprints/dummy/user-data/common/download-snapshot.sh` (source helper, `staging_mount`, synthetic archive via `dd`+`tar`/`zstd`, extract to `/data`, `staging_cleanup`), source it from `blueprints/dummy/user-data/node.sh`; log `STAGING DEBUG: PASS`/`FAIL (orphaned volume <id>)`; no-op when size 0.
  - [x] 75.2 Add `blueprints/dummy/samples/.env-testnet-staging-debug` with `SNAPSHOT_ENABLED=true` and a small `SNAPSHOT_STAGING_VOL_SIZE` (e.g. 10).
    - _Requirements: 27.12_

- [x] 76. Update sample `.env` files
  - [x] 76.1 Base `.env-mainnet-op-reth-op-node-full` → `SNAPSHOT_STAGING_VOL_SIZE="5000"`; large BNB samples (e.g. `.env-mainnet-bsc-reth-full`) → appropriate size; dummy samples document the variable.
    - _Requirements: 27.11_

- [ ]* 77. CDK + lifecycle tests
  - [ ]* 77.1 Jest via `ConfigurationLoader` + real `dummy` protocol + `cdk synth`/`Template`: staging-enabled → gp3 volume (`Purpose=snapshot-staging`), attachment at `/dev/xvdz`, IAM Detach/Delete scoped to volume+instance, `SNAPSHOT_STAGING_VOL_ID` injected; staging-disabled → none; HA grants self-management. _Validates: 27.1–27.4_
  - [ ]* 77.2 `shellcheck -S warning` on modified/new scripts; bash lifecycle via Dummy debug path emitting `STAGING DEBUG: PASS/FAIL`. _Validates: 27.7, 27.8, 27.12_

- [x] 78. Build, synth, and documentation
  - [x] 78.1 Run `npm run build`, `npm run test`, and `npx cdk synth` for staging-enabled AND staging-disabled dummy configs.
  - [x] 78.2 Create `docs/snapshot-staging.md` (overview, architecture, when to use, sizing table, cost, orphan prevention, verified-cleanup + `STAGING DEBUG` notes); add `SNAPSHOT_STAGING_VOL_SIZE` to `docs/configuration-reference.md`; add staging guidance to `docs/deployment-guide.md`, `docs/ageai-add-protocol-prompt.md`, `docs/ageai-deploy-prompt.md`; add disk-full + orphaned-volume entries to `docs/troubleshooting.md`.
    - _Requirements: 27.11, 27.12_

- [ ] 79. End-to-end verification (sandbox account, optional)
  - [x] 79.1 Deploy staging-enabled dummy config, confirm `STAGING DEBUG: PASS`, no `ERROR:` lines, and the `Purpose=snapshot-staging` volume is gone after the run; negative check with size 0; tear down with `npx cdk destroy`. (Single-node detach-IAM instance-ARN bug found and fixed during this run.)
  - [ ] 79.2 Reboot-recovery check (optional): interrupt mid-run and confirm the volume is still cleaned up on the next pass. _Requirements: 27.9_

## Notes

- Tasks marked with `*` are optional (property-based and supplementary unit tests) and can be skipped for a faster MVP.
- Each task references specific requirements for traceability (e.g., `_Requirements: 23.4_` maps to Requirement 23, acceptance criterion 4).
- Checkpoints ensure incremental validation; run `npm run build` and `npm run test` at checkpoints involving TypeScript changes.
- Phases 16–20 were merged from the former standalone specs (`availability-zone-configuration`, `instance-store-raid-volumes`, `solana-frankendancer-support`, `website-restructure`, `base-snapshot-disk-overflow-fix`, `snapshot-staging-cleanup-fix`). Their requirements are 23–27 and their design sections are at the end of `design.md`.
- Property-based tests use `fast-check` (TypeScript) or `bats-core` (shell). Installing `fast-check` as a devDependency requires explicit user approval per the workspace dependency rules in `.kiro/steering/structure.md`.
- The implementation language is TypeScript for CDK code and Bash for instance-side scripts, matching the existing codebase. `HANodesConstruct` needs no AZ change — the ASG handles multi-AZ placement automatically.

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1"] },
    { "id": 1, "tasks": ["2", "3", "4", "5", "5.1"] },
    { "id": 2, "tasks": ["6", "7", "8"] },
    { "id": 3, "tasks": ["9", "10", "11"] },
    { "id": 4, "tasks": ["12", "13"] },
    { "id": 5, "tasks": ["14", "15", "16"] },
    { "id": 6, "tasks": ["17", "17.1", "18"] },
    { "id": 7, "tasks": ["19", "20"] },
    { "id": 8, "tasks": ["21", "22", "23", "24", "25"] },
    { "id": 9, "tasks": ["26", "27"] },
    { "id": 10, "tasks": ["28", "29", "30", "31", "32", "33", "34"] },
    { "id": 11, "tasks": ["35", "36", "37", "38", "39", "40", "41", "42"] },
    { "id": 12, "tasks": ["43", "44", "45", "46", "47", "48", "49"] },
    { "id": 13, "tasks": ["50", "51", "52", "53", "54", "55", "56", "57", "58"] },
    { "id": 14, "tasks": ["59", "60", "61", "62", "63", "64", "65", "66", "67", "68"] },
    { "id": 15, "tasks": ["69", "70", "71", "72", "73", "74", "75", "76", "77", "78", "79"] }
  ]
}
```
