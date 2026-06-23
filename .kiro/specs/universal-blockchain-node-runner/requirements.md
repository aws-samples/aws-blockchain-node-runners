# Requirements Document

## Introduction

This document outlines the requirements for refactoring the AWS Blockchain Node Runners application from multiple separate CDK applications into a single universal CDK application. The goal is to simplify the development process for developers new to CDK and AWS and enable easier addition of new blockchain protocols using GenAI tools. The universal application will use a configuration-driven approach where different blockchain protocols are supported through user-data scripts and environment configurations specified in .env files. The application will support two primary deployment modes: single-node and high-availability (HA) configurations, eliminating the need for separate common stack deployments.

## Glossary

- **Universal_CDK_Application**: The single consolidated CDK application that supports multiple blockchain protocols through configuration
- **Configuration_Loader**: Component that loads and validates protocol configurations and environment settings
- **User_Data_Manager**: Component that manages user data scripts and injects variables for EC2 instance initialization
- **Assets_Manager**: Component that uploads common and protocol-specific scripts to S3
- **Stack_Factory**: Component that creates appropriate CDK stacks based on deployment configuration
- **SingleNodeConstruct**: CDK construct that deploys a single EC2 instance for blockchain node
- **HANodesConstruct**: CDK construct that deploys multiple nodes with load balancing and auto-scaling
- **MonitoringConstruct**: CDK construct that creates CloudWatch dashboards for node monitoring
- **Protocol**: A blockchain network type (e.g., Ethereum, Solana, BSC)
- **Deployment_Mode**: Configuration setting that determines single-node or HA deployment
- **Default_VPC**: The default Virtual Private Cloud automatically created in each AWS region
- **Blueprint_Package**: An NPM package that contains a complete blockchain protocol blueprint. All protocol configuration (ports, storage, instance types, etc.) is declared inside the `"aws-blockchain-node-runner"` field of the package's `package.json`. Built-in and external blueprints use this identical structure.
- **Built_In_Blueprint**: A blueprint that ships inside the core repository under the `blueprints/` directory (ethereum, solana, dummy). Each built-in blueprint is a local NPM package referenced via a `file:` path in the root `package.json`, so it is installed into `node_modules/` alongside external blueprints on `npm install`.
- **External_Blueprint**: A blueprint delivered as an NPM package added to the root `package.json` dependencies by the user, pointing to either the NPM registry or a GitHub URL.
- **AWS_AZ**: Optional `.env` field holding an AWS Availability Zone identifier (e.g. `us-east-1a`) used to pin single-node placement. (Requirement 23)
- **RAID_Array**: A Linux software RAID 0 array created with `mdadm` from instance store NVMe drives. **Single_RAID_Mode** uses one array (one `instance-store` entry); **Dual_RAID_Mode** uses two arrays (two `instance-store` entries, e.g. Solana `/data` + `/accounts`). (Requirement 24)
- **Instance_Store_Volume**: A `.env` data volume entry with `TYPE="instance-store"`, identifying an ephemeral NVMe drive that participates in RAID assembly. (Requirement 24)
- **Frankendancer**: A hybrid Firedancer/Agave Solana validator client run via a single `fdctl` binary, configured by a TOML file and requiring root for AF_XDP networking (drops to `bcuser` via the TOML `user` field). **System_Initialization** is its `fdctl configure init all` step. (Requirement 25)
- **Website**: The Docusaurus 3.x documentation site in `website/`. **Generic_Docs** are the root `docs/` files; **Protocol_README** is a `blueprints/{protocol}/README.md`. (Requirement 26)
- **Staging_Volume**: A temporary gp3 EBS volume created when `SNAPSHOT_STAGING_VOL_SIZE > 0` to hold the compressed snapshot archive during download, kept off the `/data` volume and deleted after extraction. The **staging helper** is the shared `assets/common/snapshot-staging.sh` exposing `staging_mount()` and `staging_cleanup()`. (Requirement 27)

## Requirements

### Requirement 1: Single Universal CDK Application

**User Story:** As a developer, I want to deploy any supported blockchain node using a single CDK application, so that I don't need to navigate between different directories and applications.

#### Acceptance Criteria

1. WHEN a user creates a .env configuration file with blockchain node settings THEN THE Universal_CDK_Application SHALL deploy the appropriate infrastructure for that protocol
2. WHEN a user runs `cdk deploy` THEN THE Universal_CDK_Application SHALL automatically detect the blockchain type from the configuration and deploy the correct resources
3. WHEN multiple blockchain protocols are configured THEN THE Universal_CDK_Application SHALL support deploying multiple different blockchain nodes from the same application

### Requirement 2: Configuration-Driven Protocol Addition

**User Story:** As a developer new to CDK and AWS, I want to add support for a new blockchain protocol by providing configuration files and user-data scripts, so that I can extend the application without understanding complex CDK patterns.

#### Acceptance Criteria

1. WHEN a developer adds a new protocol package with an `"aws-blockchain-node-runner"` field in its `package.json` THEN THE Configuration_Loader SHALL automatically recognize and support the new protocol
2. WHEN a developer provides user-data scripts for a new protocol THEN THE User_Data_Manager SHALL load and inject variables into those scripts during deployment using CDK's Fn.sub() function
3. WHEN a developer needs common functionality THEN THE Assets_Manager SHALL provide reusable scripts for tasks such as storage setup, variable parsing, and CloudFormation helper setup
4. WHEN deploying any blockchain protocol THEN THE Universal_CDK_Application SHALL use Ubuntu 24.04 LTS as the default operating system with support for both x86_64 and ARM_64 architectures
5. WHEN a developer defines custom protocol-specific environment variables THEN THE Configuration_Loader SHALL parse and inject them using the customEnvVarsNamePrefix and customEnvVars properties in the `"aws-blockchain-node-runner"` field of `package.json`, storing them in the CUSTOM_VARIABLES field of EnvironmentConfig
6. WHEN using GenAI tools to generate new protocol support THEN THE Universal_CDK_Application SHALL follow the standardized folder structure with `package.json`, `user-data/`, and `configurations/` directories

### Requirement 3: Single-Node and HA Deployment Modes

**User Story:** As a DevOps engineer, I want the universal application to support both single-node and highly-available deployment modes for any blockchain protocol, so that I can choose the appropriate architecture for my use case.

#### Acceptance Criteria

1. WHEN configuring single-node deployment THEN THE Universal_CDK_Application SHALL deploy a single EC2 instance with the specified blockchain protocol in the Default_VPC using SingleNodeConstruct
2. WHEN configuring highly-available deployment THEN THE Universal_CDK_Application SHALL deploy multiple nodes behind an Application Load Balancer with auto-scaling capabilities in the Default_VPC using HANodesConstruct
3. WHEN switching between deployment modes THEN THE Universal_CDK_Application SHALL use the same configuration format with a DEPLOYMENT_MODE parameter set to "single-node" or "ha-nodes"
4. WHEN deploying in either mode THEN THE Universal_CDK_Application SHALL support the same instance types and storage options, with storage volumes configured via DATA_VOL_* environment variables
5. WHEN deploying either mode THEN THE Universal_CDK_Application SHALL integrate all necessary shared resources directly into the stack without requiring separate common stack deployment and SHALL use the Default_VPC
6. WHEN deploying in single-node mode THEN THE Universal_CDK_Application SHALL use CloudFormation signals for instance initialization with a LOGICAL_RESOURCE_ID
7. WHEN deploying in HA mode THEN THE Universal_CDK_Application SHALL use Auto Scaling Group lifecycle hooks for graceful node startup with LIFECYCLE_HOOK_NAME and ASG_NAME variables

### Requirement 4: Functional Parity with Original Applications

**User Story:** As a DevOps engineer, I want the universal application to maintain all existing functionality from the separate applications, so that current deployments and features are not lost.

#### Acceptance Criteria

1. WHEN deploying in single-node mode THEN THE Universal_CDK_Application SHALL support the same instance types and storage options as the original single-node applications and SHALL use the Default_VPC
2. WHEN deploying in HA mode THEN THE Universal_CDK_Application SHALL support auto-scaling groups, load balancers, and health checks as in the original HA applications and SHALL use the Default_VPC
3. WHEN monitoring nodes THEN THE MonitoringConstruct SHALL provide CloudWatch dashboards and metrics as in the original applications
4. WHEN deploying either single-node or HA mode THEN THE Universal_CDK_Application SHALL NOT require a separate common stack deployment

### Requirement 5: CloudWatch Monitoring

**User Story:** As a system administrator, I want comprehensive CloudWatch monitoring for every deployed blockchain node, so that I can monitor the health and performance of the blockchain infrastructure.

#### Acceptance Criteria

1. WHEN deploying any blockchain node THEN THE MonitoringConstruct SHALL create a CloudWatch dashboard with protocol-specific and infrastructure metrics
2. WHEN monitoring blockchain health THEN THE MonitoringConstruct SHALL include protocol-specific metrics such as block height, sync status, and slots behind in the dashboard
3. WHEN monitoring infrastructure health THEN THE MonitoringConstruct SHALL include CPU utilization, memory usage, disk I/O, network traffic, and storage utilization metrics in the dashboard
4. WHEN viewing metrics THEN THE MonitoringConstruct SHALL provide real-time and historical views with appropriate time periods and aggregations
5. WHEN troubleshooting issues THEN THE MonitoringConstruct SHALL include disk latency, I/O wait times, and storage device-specific metrics in the dashboard
6. WHEN managing multiple nodes THEN THE MonitoringConstruct SHALL create a dashboard for each node with instance-specific identification
7. WHEN deploying in single-node mode THEN THE MonitoringConstruct SHALL use the single-node dashboard template with instance-specific metrics including CPU, memory, disk I/O, network traffic, and protocol-specific metrics
8. WHEN deploying in HA mode THEN THE Universal_CDK_Application SHALL NOT create a default monitoring dashboard as users should create custom dashboards based on their specific monitoring needs

### Requirement 6: Standardized Configuration Interface

**User Story:** As a developer, I want a standardized configuration interface across all blockchain protocols, so that I can easily understand and modify settings for any supported blockchain.

#### Acceptance Criteria

1. WHEN configuring any blockchain protocol THEN THE Universal_CDK_Application SHALL use a consistent .env file structure with generic parameters and standardized uppercase naming conventions
2. WHEN protocol-specific settings are needed THEN THE Configuration_Loader SHALL use the customEnvVarsNamePrefix and customEnvVars properties in the `"aws-blockchain-node-runner"` field of `package.json` to define protocol-specific variables, which are extracted and stored in the CUSTOM_VARIABLES field
3. WHEN validating configurations THEN THE Configuration_Loader SHALL provide clear error messages for invalid or missing settings, including validation of required fields
4. WHEN documenting configurations THEN THE Universal_CDK_Application SHALL provide sample .env templates in the `{blueprint}/samples/` directory
5. WHEN configuring storage volumes THEN THE Configuration_Loader SHALL support up to 6 data volumes per instance with properties TYPE, SIZE, IOPS, THROUGHPUT, MOUNT_PATH, DEVICE_NAME, and FILESYSTEM
6. WHEN configuring HA deployments THEN THE Configuration_Loader SHALL require HA_CONFIG properties including HA_NUMBER_OF_NODES, HA_ALB_HEALTHCHECK_PORT, HA_ALB_HEALTHCHECK_PATH, and related health check and lifecycle parameters

### Requirement 7: Security and Compliance

**User Story:** As a system administrator, I want the universal application to support the same security and compliance features as the original applications, so that production deployments remain secure.

#### Acceptance Criteria

1. WHEN deploying nodes THEN THE Universal_CDK_Application SHALL use encrypted EBS volumes and secure networking configurations
2. WHEN accessing nodes THEN THE Universal_CDK_Application SHALL support Systems Manager sessions instead of SSH access
3. WHEN applying security policies THEN THE Universal_CDK_Application SHALL integrate with CDK Nag for security compliance checking
4. WHEN managing secrets THEN THE Universal_CDK_Application SHALL support AWS Secrets Manager integration where applicable

### Requirement 8: Asset Management

**User Story:** As a system administrator, I want efficient asset management for both common and protocol-specific scripts, so that deployments are fast and reliable.

#### Acceptance Criteria

1. WHEN deploying any blockchain protocol THEN THE Assets_Manager SHALL upload common scripts to S3 using CDK's Asset construct and provide the S3 URI to instances via COMMON_ASSETS_S3_PATH variable
2. WHEN deploying protocol-specific configurations THEN THE Assets_Manager SHALL upload protocol assets separately using CDK's Asset construct and provide the S3 URI via PROTOCOL_ASSETS_S3_PATH variable
3. WHEN instances start THEN THE Universal_CDK_Application SHALL download both common and protocol-specific assets from their respective S3 locations and extract them to /opt directory
4. WHEN parsing custom variables THEN THE User_Data_Manager SHALL process protocol-specific environment variables from the CUSTOM_VARIABLES JSON object
5. WHEN assets are uploaded THEN THE Assets_Manager SHALL cache CDK Asset objects to avoid redundant uploads for the same protocol or common assets
6. WHEN validating assets THEN THE Assets_Manager SHALL verify that required files exist for common assets and protocol assets

### Requirement 9: Documentation and Examples

**User Story:** As a contributor, I want comprehensive documentation and examples for the universal application architecture, so that I can understand and contribute to the codebase effectively.

#### Acceptance Criteria

1. WHEN onboarding new contributors THEN THE Universal_CDK_Application SHALL provide clear architecture documentation explaining the Configuration_Loader, User_Data_Manager, Assets_Manager, and Stack_Factory components
2. WHEN adding new protocols THEN THE Universal_CDK_Application SHALL provide step-by-step guides showing how to create a blueprint `package.json`, user-data scripts, and configuration templates
3. WHEN troubleshooting issues THEN THE Universal_CDK_Application SHALL provide debugging guides and common problem solutions
4. WHEN using GenAI tools THEN THE Universal_CDK_Application SHALL provide prompts and templates that AI can use to generate new protocol support following the standardized structure

### Requirement 11: CDK-Managed vs Environment Variables

**User Story:** As a developer, I want clear separation between CDK-managed variables and environment configuration variables, so that I understand which values are injected by the infrastructure code versus user-provided configuration.

#### Acceptance Criteria

1. WHEN deploying any stack THEN THE User_Data_Manager SHALL inject CDK-managed variables through CFNandCDKUserDataConfig interface including STACK_NAME, LOGICAL_RESOURCE_ID, ASG_NAME, LIFECYCLE_HOOK_NAME, COMMON_ASSETS_S3_PATH, and PROTOCOL_ASSETS_S3_PATH
2. WHEN deploying in single-node mode THEN THE User_Data_Manager SHALL set LOGICAL_RESOURCE_ID to the CloudFormation logical ID and set ASG_NAME and LIFECYCLE_HOOK_NAME to "none"
3. WHEN deploying in HA mode THEN THE User_Data_Manager SHALL set ASG_NAME and LIFECYCLE_HOOK_NAME to actual values and set LOGICAL_RESOURCE_ID to "none"
4. WHEN injecting variables into user data scripts THEN THE User_Data_Manager SHALL use CDK's Fn.sub() function with ${VARIABLE_NAME} syntax
5. WHEN processing variables THEN THE User_Data_Manager SHALL stringify first-level parameters and convert objects to JSON format
6. WHEN user data scripts execute THEN THE Universal_CDK_Application SHALL make all injected variables available in /etc/cdk_environment file for protocol-specific scripts to source

### Requirement 12: Stack Factory Interface

**User Story:** As a developer, I want the Stack Factory to provide a consistent interface for creating stacks with all necessary resources, so that I can easily deploy different blockchain protocols without worrying about infrastructure details.

#### Acceptance Criteria

1. WHEN creating any stack THEN THE Stack_Factory SHALL accept DeploymentConfig, stackName, and StackAssetResources parameters
2. WHEN StackAssetResources are provided THEN THE Stack_Factory SHALL include userDataScriptPath as required, and dashboardTemplatePath and vpc as optional
3. WHEN creating a single-node stack THEN THE Stack_Factory SHALL use SingleNodeConstruct with the provided protocol and deployment configurations
4. WHEN creating an HA stack THEN THE Stack_Factory SHALL use HANodesConstruct with the provided protocol and deployment configurations
5. WHEN creating any stack THEN THE Stack_Factory SHALL create a MonitoringConstruct with appropriate dashboard configuration
6. WHEN stack creation is complete THEN THE Universal_CDK_Application SHALL output CloudFormation exports for key resources

### Requirement 13: GenAI Deployment Assistance

**User Story:** As a user deploying a blockchain node, I want GenAI assistance to guide me through configuration selection, cost estimation, and deployment, so that I can deploy with confidence and make informed decisions.

#### Acceptance Criteria

1. WHEN a user requests to deploy a blockchain node THEN THE GenAI_Tool SHALL read the protocol's README.md, `package.json` blueprint configuration, and sample `.env` files to understand available options
2. WHEN analyzing user requirements THEN THE GenAI_Tool SHALL recommend the most appropriate configuration based on node type (archive, pruned, RPC), network, and use case
3. WHEN generating a .env file THEN THE GenAI_Tool SHALL use the protocol's sample .env files as templates and customize with user's AWS account ID and region
4. WHEN cost estimation is requested THEN THE GenAI_Tool SHALL use `aws pricing get-products` to calculate monthly costs for compute, storage, and network transfer
5. WHEN presenting costs THEN THE GenAI_Tool SHALL provide a detailed breakdown showing compute, storage, and network costs separately with total monthly estimate
6. WHEN costs are high THEN THE GenAI_Tool SHALL suggest cost optimization alternatives with trade-offs explained
7. WHEN ready to deploy THEN THE GenAI_Tool SHALL present a confirmation prompt showing configuration and costs and SHALL NOT proceed without explicit user confirmation ("yes")
8. WHEN deployment completes THEN THE GenAI_Tool SHALL extract outputs from deploy-output.json and provide monitoring guidance including CloudWatch dashboard URL and key metrics to watch
9. WHEN deployment completes THEN THE GenAI_Tool SHALL provide connection guidance showing how to connect applications to the node including RPC endpoint, security group configuration, and code examples
10. WHEN user requests ongoing assistance THEN THE GenAI_Tool SHALL offer help with monitoring, troubleshooting, scaling, and cost optimization
11. WHEN deployment fails THEN THE GenAI_Tool SHALL analyze errors, provide troubleshooting steps, and offer to retry or adjust configuration

### Requirement 14: Dynamic Traffic Shaping

**User Story:** As a system administrator deploying RPC nodes, I want dynamic traffic shaping to optimize outbound data transfer costs, so that I can reduce network costs by up to 85% while maintaining node synchronization.

#### Acceptance Criteria

1. WHEN traffic shaping is enabled THEN THE Universal_CDK_Application SHALL configure nftables rules to mark packets destined for public IPs while excluding internal AWS traffic (10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16, 169.254.0.0/16)
2. WHEN traffic shaping is enabled THEN THE Universal_CDK_Application SHALL configure tc (traffic control) with token bucket filter to limit outbound bandwidth to the specified rate in Mbit/s
3. WHEN a node is fully synchronized THEN THE Traffic_Shaping_System SHALL automatically apply the configured bandwidth limit to reduce data transfer costs
4. WHEN a node falls behind by more than the configured threshold THEN THE Traffic_Shaping_System SHALL automatically remove bandwidth limits until the node catches up
5. WHEN traffic shaping is configured THEN THE Universal_CDK_Application SHALL provide net-rules-start.sh script to enable traffic shaping with configurable bandwidth limits
6. WHEN traffic shaping is configured THEN THE Universal_CDK_Application SHALL provide net-rules-stop.sh script to disable all traffic shaping rules
7. WHEN traffic shaping is configured THEN THE Universal_CDK_Application SHALL provide net-rules.service systemd service to manage traffic shaping lifecycle
8. WHEN traffic shaping is configured THEN THE Universal_CDK_Application SHALL provide protocol-specific syncchecker.sh script to monitor node synchronization status, trigger traffic shaping on/off, and report block height and blocks behind metrics to CloudWatch
9. WHEN traffic shaping is enabled THEN THE Configuration_Loader SHALL parse TRAFFIC_SHAPING_ENABLED, TRAFFIC_SHAPING_RATE_MBIT, TRAFFIC_SHAPING_CHECK_INTERVAL_SEC, and TRAFFIC_SHAPING_MAX_SLOTS_BEHIND environment variables
10. WHEN deploying with traffic shaping THEN THE Universal_CDK_Application SHALL upload traffic shaping scripts to protocol assets and make them available to instances
11. WHEN traffic shaping is enabled THEN THE User_Data_Manager SHALL configure systemd timer or cron job to run syncchecker.sh at the specified interval
12. WHEN traffic shaping is not applicable THEN THE Universal_CDK_Application SHALL allow protocols to disable traffic shaping via the `trafficShaping.supported` property in the `"aws-blockchain-node-runner"` field of `package.json`
13. WHEN traffic shaping is enabled for consensus nodes THEN THE Universal_CDK_Application SHALL log a warning that traffic shaping is not recommended for consensus nodes and may impact performance

### Requirement 15: Systemd Service Logs in CloudWatch

**User Story:** As a system administrator, I want systemd service logs (node.service, syncchecker.service, net-rules.service) to be available in CloudWatch Logs, so that I can troubleshoot issues without SSH access to instances.

#### Acceptance Criteria

1. WHEN deploying any blockchain node THEN THE Universal_CDK_Application SHALL rely on Ubuntu's default rsyslog configuration which automatically forwards all systemd service logs to /var/log/syslog
2. WHEN CloudWatch agent is configured THEN THE Universal_CDK_Application SHALL configure the agent to upload /var/log/syslog to CloudWatch Logs
3. WHEN logs are uploaded to CloudWatch THEN THE Universal_CDK_Application SHALL create a log group named /aws/ec2/blockchain-nodes/systemd-services
4. WHEN viewing logs in CloudWatch THEN THE system administrator SHALL be able to view logs from node.service, syncchecker.service, net-rules.service, and other systemd services
5. WHEN troubleshooting deployment issues THEN THE system administrator SHALL be able to use CloudWatch Logs Insights to query and filter systemd service logs

### Requirement 16: Blueprint as NPM Package

**User Story:** As a blueprint developer, I want to publish a blockchain blueprint as an NPM package, so that I can share my blueprint with the community without requiring changes to the core repository.

#### Acceptance Criteria

1. WHEN a developer creates a Blueprint_Package THEN the package's `package.json` SHALL include a top-level `"aws-blockchain-node-runner"` field containing only blueprint-specific protocol configuration that has no equivalent in standard `package.json` fields: `BLOCKCHAIN_PROTOCOL` (unique protocol identifier), `supportedDeploymentModes`, `defaultConfiguration`, `availableConfigurations`, `BC_NETWORKS`, `defaultInstanceTypes`, `requiredPorts`, `monitoring`, `storage`, `customEnvVarsNamePrefix`, and optionally `customEnvVars`, `snapshot`, and `trafficShaping`. Fields already present in standard `package.json` (such as `name`, `version`, `description`) SHALL NOT be duplicated inside the `"aws-blockchain-node-runner"` field and SHALL be read from the top-level `package.json` fields instead. Version compatibility SHALL be declared via standard `peerDependencies` on the core package (e.g., `"aws-blockchain-node-runners": ">=2.0.0"`).
2. WHEN a Blueprint_Package is published THEN it SHALL contain a `user-data/` directory with at minimum a `node.sh` script
3. WHEN a Blueprint_Package is published THEN it SHALL contain a `samples/` directory with at least one sample `.env` file
4. WHEN a Blueprint_Package omits optional directories (`configurations/`, `monitoring/`) THEN THE Configuration_Loader SHALL treat them as empty and proceed without error
5. WHEN a Blueprint_Package is published to the NPM registry or referenced via a GitHub URL in the project's `package.json` THEN THE Configuration_Loader SHALL discover and load it using the same mechanism as built-in blueprints
6. THE `"aws-blockchain-node-runner"` field in `package.json` SHALL be the single source of truth for all protocol configuration, eliminating the need for a separate `config.json` file

### Requirement 17: Single npm install for All Blueprints

**User Story:** As a user of the universal application, I want all blueprints — both built-in and external — to be available after a single `npm install`, so that there is no separate setup step to use any blueprint.

#### Acceptance Criteria

1. WHEN a user runs `npm install` THEN the root `package.json` SHALL install all built-in blueprints as local NPM packages via `file:blueprints/<name>` path references, making them available in `node_modules/` alongside any external blueprints
2. WHEN a user adds an external Blueprint_Package to `dependencies` in the root `package.json` and runs `npm install` THEN THE Configuration_Loader SHALL automatically discover and register that blueprint on the next `cdk synth` or `cdk deploy` without any additional configuration steps
3. WHEN THE Configuration_Loader resolves blueprints from `node_modules/` THEN it SHALL identify Blueprint_Packages solely by the presence of the `"aws-blockchain-node-runner"` field in their `package.json`, with no distinction between built-in and external packages
4. WHEN a user sets `BLOCKCHAIN_PROTOCOL` in their `.env` file THEN THE Configuration_Loader SHALL load the protocol configuration from the matching package's `"aws-blockchain-node-runner"` field in `node_modules/`
5. WHEN two installed packages declare the same `BLOCKCHAIN_PROTOCOL` value THEN THE Configuration_Loader SHALL throw an error identifying both conflicting packages, requiring the user to explicitly remove one
6. WHEN a Blueprint_Package is installed from a GitHub repository URL (e.g., `"my-blueprint": "github:owner/repo#tag"`) THEN THE Configuration_Loader SHALL discover and load it using the same `node_modules/` resolution mechanism as registry-published packages

### Requirement 18: Blueprint Validation

**User Story:** As a core maintainer, I want the Configuration_Loader to validate blueprint packages before use, so that malformed or incompatible packages fail fast with clear error messages rather than causing cryptic deployment failures.

#### Acceptance Criteria

1. WHEN loading any blueprint (built-in or external) THEN THE Configuration_Loader SHALL validate that the `"aws-blockchain-node-runner"` field in `package.json` contains all required protocol configuration fields and that their types conform to the ProtocolConfig schema
2. WHEN a blueprint's `package.json` contains an `"aws-blockchain-node-runner"` field that is missing any required field THEN THE Configuration_Loader SHALL throw a descriptive error identifying the package name and the specific missing or invalid field
3. WHEN a blueprint's `peerDependencies` declares a version range incompatible with the installed core version THEN `npm install` SHALL warn (or error with `--strict-peer-deps`) about the incompatibility at install time, before any deployment is attempted
4. WHEN a blueprint's `"aws-blockchain-node-runner"` field references a `defaultConfiguration` that does not exist in `availableConfigurations` THEN THE Configuration_Loader SHALL throw a validation error
5. WHEN a blueprint's `user-data/node.sh` file is missing THEN THE Configuration_Loader SHALL throw an error because this file is required for deployment
6. WHEN blueprint validation fails THEN THE Configuration_Loader SHALL report all validation errors together rather than stopping at the first error, so that blueprint authors can fix all issues in one pass
7. WHEN two installed packages declare the same `BLOCKCHAIN_PROTOCOL` value THEN THE Configuration_Loader SHALL throw an error identifying both conflicting package names before any deployment proceeds

### Requirement 19: Migrate Built-In Blueprints

**User Story:** As a built-in blueprint maintainer, I want the existing blueprints (ethereum, solana, dummy) to be migrated to the new `package.json`-based structure, so that built-in and external blueprints use a single unified interface.

#### Acceptance Criteria

1. WHEN the pluggable blueprint system is introduced THEN each built-in blueprint in `blueprints/` SHALL be given its own `package.json` with the `"aws-blockchain-node-runner"` field containing the full protocol configuration previously held in `config.json`
2. WHEN migration is complete THEN the `config.json` files in built-in blueprint directories SHALL be removed
3. WHEN migration is complete THEN the root `package.json` SHALL reference each built-in blueprint as a `file:` path dependency (e.g., `"aws-bnr-blueprint-ethereum": "file:blueprints/ethereum"`) so they are installed into `node_modules/` on `npm install`
4. WHEN THE Configuration_Loader loads built-in blueprints THEN it SHALL use the same `node_modules/` resolution logic as for external blueprints, with no special-case handling for the `blueprints/` directory
5. WHEN listing available protocols THEN THE Configuration_Loader SHALL include all installed blueprints in the output, clearly indicating the source package name of each

### Requirement 20: Stable Blueprint Interface Contract

**User Story:** As a developer building an external blueprint package, I want a clear and stable interface contract documented in the core repository, so that my package continues to work across core version upgrades without unexpected breakage.

#### Acceptance Criteria

1. WHEN a developer consults the core repository documentation THEN it SHALL document the complete Blueprint_Package interface contract including the full `"aws-blockchain-node-runner"` field schema, the required directory structure, and the required files
2. WHEN the Blueprint_Package interface contract changes in a breaking way THEN THE Universal_CDK_Application SHALL increment its major version number and document the migration path
3. WHEN a blueprint author declares version compatibility via `peerDependencies` in `package.json` THEN `npm install` SHALL enforce the constraint using standard NPM semver resolution, and no custom runtime version checking is needed
4. THE Universal_CDK_Application SHALL provide the `blueprints/dummy` built-in blueprint as the canonical reference implementation that external blueprint authors can copy as a starting template
5. WHEN a blueprint author runs `BLOCKCHAIN_PROTOCOL=<protocol> npx cdk synth` THEN THE Universal_CDK_Application SHALL validate the blueprint's interface contract and report any violations before attempting synthesis, giving authors fast feedback during development


### Requirement 22: GenAI Blueprint Discovery and Security Review

**User Story:** As a user of the universal application, I want the GenAI assistant to help me discover available blueprints and review their security before deploying, so that I can make informed decisions about which blueprints to trust and use.

#### Acceptance Criteria

1. WHEN a user asks which blueprints are available THEN THE GenAI_Tool SHALL read the root `package.json` to identify currently installed blueprints and clearly distinguish built-in blueprints (referenced via `file:blueprints/` paths) from externally installed ones
2. WHEN a user asks to discover community blueprints THEN THE GenAI_Tool SHALL run `npm search aws-bnr-blueprint` to find packages following the naming convention and present the results with package name, description, and version
3. WHEN presenting search results THEN THE GenAI_Tool SHALL remind the user that community blueprints are not reviewed or verified by the core repository maintainers and that the user assumes responsibility for any blueprint they install
4. WHEN a user installs a new external blueprint THEN THE GenAI_Tool SHALL proactively offer to run a security review before the user proceeds to deployment
5. WHEN a security review is requested for an installed blueprint THEN THE GenAI_Tool SHALL guide the user through reviewing the blueprint's `user-data/node.sh` and any other scripts in `user-data/` for potentially dangerous operations such as data exfiltration, unexpected outbound connections, credential access, or destructive commands
6. WHEN a security review is requested THEN THE GenAI_Tool SHALL check that the blueprint's `"aws-blockchain-node-runner"` field in `package.json` requests only the ports and IAM permissions consistent with its stated purpose
7. WHEN a security review is requested THEN THE GenAI_Tool SHALL summarize findings as a risk assessment with any identified concerns highlighted, and SHALL NOT proceed to deployment guidance until the user explicitly acknowledges the review
8. WHEN a security review finds no concerns THEN THE GenAI_Tool SHALL confirm this clearly and offer to proceed with deployment guidance

### Requirement 23: Availability Zone Configuration

**User Story:** As a blockchain node operator, I want to specify an availability zone in my `.env` file, so that I can deploy my single-node node in an AZ where my chosen EC2 instance type is available.

(Merged from the former `availability-zone-configuration` spec. Glossary additions: **AWS_AZ** — an optional `.env` field holding an AWS Availability Zone identifier such as `us-east-1a`.)

#### Acceptance Criteria

1. THE EnvironmentConfig interface SHALL include an optional `AWS_AZ` field of type string.
2. WHEN the `AWS_AZ` environment variable is not set (or is empty/whitespace) in the `.env` file THEN THE Configuration_Loader SHALL leave the `AWS_AZ` field undefined in the parsed EnvironmentConfig.
3. WHEN the `AWS_AZ` environment variable is set to a non-empty string THEN THE Configuration_Loader SHALL store the trimmed value in the `AWS_AZ` field.
4. WHEN the `AWS_AZ` field is set THEN THE Configuration_Loader SHALL validate that the value matches the pattern of a valid AWS availability zone identifier (a region code followed by a single lowercase letter, e.g. `us-east-1a`), returning a validation error describing the expected format if it does not match.
5. WHEN the `AWS_AZ` field is set THEN THE Configuration_Loader SHALL validate that the AZ value starts with the configured `AWS_REGION` value, returning a validation error if it does not belong to the configured region.
6. WHEN the `AWS_AZ` field is set in single-node mode THEN THE SingleNodeConstruct SHALL use the specified AZ value as the availability zone for both the EC2 instance and all attached EBS data volumes.
7. WHEN the `AWS_AZ` field is not set THEN THE SingleNodeConstruct SHALL select an availability zone using the existing default selection logic.
8. WHILE the deployment mode is `ha-nodes` THEN THE HANodesConstruct SHALL ignore the `AWS_AZ` field and continue to use the Auto Scaling Group's default multi-AZ placement strategy, and THE Configuration_Loader SHALL produce a validation warning indicating that `AWS_AZ` is ignored for HA deployments.
9. THE `.env` samples for each blueprint SHALL include a commented-out `AWS_AZ` variable in the AWS Configuration section, placed after `AWS_REGION`, with a descriptive comment and a region-appropriate example value.

### Requirement 24: Instance Store RAID Volumes

**User Story:** As a node operator, I want multiple instance store NVMe drives combined into one or two RAID 0 arrays based on my `.env` configuration, so that I get maximum storage capacity and throughput without manual RAID setup.

(Merged from the former `instance-store-raid-volumes` spec. Glossary additions: **RAID_Array** — a Linux software RAID 0 array created with `mdadm` from instance store NVMe drives; **Single_RAID_Mode** / **Dual_RAID_Mode** — one or two RAID arrays selected by the count of `instance-store` volume entries.)

#### Acceptance Criteria

1. WHEN the `.env` configuration contains exactly one `instance-store` volume entry THEN THE setup-storage.sh script SHALL assemble all detected NVMe drives into a single RAID 0 array (`/dev/md0`) and mount it at the configured mount path (Single_RAID_Mode).
2. WHEN the configuration contains exactly two `instance-store` volume entries THEN THE setup-storage.sh script SHALL operate in Dual_RAID_Mode, splitting available NVMe drives between two RAID 0 arrays (`/dev/md0`, `/dev/md1`) and mounting each at its respective configured mount path.
3. IF the configuration contains more than two `instance-store` volume entries THEN THE setup-storage.sh script SHALL log an error and exit with a non-zero status code.
4. WHEN the configuration contains zero `instance-store` entries THEN THE setup-storage.sh script SHALL skip RAID assembly and process only EBS volumes using the existing `setup_volume` function.
5. WHEN assembling any RAID array THEN THE setup-storage.sh script SHALL discover all unmounted, unpartitioned NVMe drives larger than 100 GB, install `mdadm` if absent, create the RAID 0 array, format it with the configured filesystem, mount it, add it to `/etc/fstab` (with `nofail`), set ownership to `bcuser:bcuser`, and persist the array via `mdadm --detail --scan` to `/etc/mdadm/mdadm.conf` for reassembly on reboot.
6. WHEN operating in Dual_RAID_Mode with four or more drives THEN THE script SHALL allocate drives to the two arrays proportionally using the relative `DATA_VOL_{N}_SIZE` values (`first_count = max(1, round(N × S1 / (S1 + S2)))`), ensuring both arrays have at least one drive, and assign the first `instance-store` entry to `/dev/md0` and the second to `/dev/md1`.
7. WHEN operating in Dual_RAID_Mode with two or three drives THEN THE script SHALL partition each drive into two partitions sized by the `S1:S2` ratio and assemble all first partitions into `/dev/md0` and all second partitions into `/dev/md1`.
8. IF fewer than one drive (single mode) or fewer than two drives (dual mode) are discovered THEN THE script SHALL log an error and exit with a non-zero status code.
9. WHEN any RAID assembly step begins, discovers drives, creates an array, or completes THEN THE script SHALL log the RAID mode, drive count and paths, RAID device/member/mount details, and final `lsblk` output; on failure it SHALL log the failing step and error details before exiting.
10. THE MonitoringConstruct SHALL assign CloudWatch `diskio` dashboard device IDs as `md{K}` (zero-based index among `instance-store` entries) for instance-store volumes and `nvme{N}n1` (one-based volume index) for EBS volumes, so dashboard widgets reference the correct block device name.
11. THE CDK constructs SHALL continue to skip `instance-store` volume entries when creating EBS volumes (existing behavior preserved), and EBS-only configurations SHALL continue to work unchanged.
12. THE Solana samples SHALL retain their two `instance-store` entries (`/data`, `/accounts`) now assembled as Dual_RAID_Mode, and non-Solana samples using `instance-store` SHALL contain exactly one entry assembled as Single_RAID_Mode.

### Requirement 25: Solana Frankendancer Support

**User Story:** As a Solana node operator, I want the Solana blueprint to support the Frankendancer client alongside Agave, so that I can run a high-performance Firedancer-based RPC node using the same blueprint, networks, monitoring, and deployment modes.

(Merged from the former `solana-frankendancer-support` spec. Glossary additions: **Frankendancer** — a hybrid Firedancer/Agave validator client run via a single `fdctl` binary, configured by a TOML file and requiring root for AF_XDP networking; **System_Initialization** — the `fdctl configure init all` step. Target version: v0.819.30111. Reference: Firedancer docs at https://docs.firedancer.io/.)

#### Acceptance Criteria

1. WHEN `CLIENT_CONFIG` references a Frankendancer configuration THEN THE Solana blueprint's `build-frankendancer.sh` SHALL clone the Firedancer repository at the `CLIENT_VERSION` tag with `--recurse-submodules`, build `fdctl` and `solana` via `deps.sh` + `make -j fdctl solana`, install binaries to `/home/bcuser/bin/` owned by `bcuser:bcuser` (755), clean up the build directory, and exit non-zero on failure.
2. WHEN a Frankendancer configuration script executes THEN it SHALL generate a TOML config at `/home/bcuser/config/frankendancer.toml` with top-level `user = "bcuser"` and sections `[gossip]`, `[consensus]`, `[rpc]`, `[ledger]`, `[layout]`, `[reporting]`; bind `[rpc]` to the EC2 internal IP on port 8899 with `private = true`; set `[ledger].path = /data/data/ledger`, `accounts_path = /accounts`; set `[consensus].identity_path = /home/bcuser/config/validator-keypair.json` and `no_voting = true`; and select network-specific entrypoints, genesis hash, and known validators for `mainnet-beta`, `testnet`, and `devnet` (exiting non-zero for unsupported networks).
3. THE blueprint SHALL include `frankendancer-0.819.30111-rpc-base.sh` (full_api=true, transaction_history=true, extended_tx_metadata_storage=false) and `frankendancer-0.819.30111-rpc-extended.sh` (extended_tx_metadata_storage=true plus `account_indexes` = spl-token-owner, program-id, spl-token-mint with the two high-volume exclude keys), both of which run `fdctl configure init all --config <path>` (System_Initialization) before `fdctl run --config <path>`, with root privileges.
4. WHEN `CLIENT_CONFIG` starts with `frankendancer` THEN `node.sh` SHALL invoke `build-frankendancer.sh` and create a `node.service` systemd unit with NO `User=` directive (runs as root) and `LimitMEMLOCK=infinity`; WHEN it starts with `agave` THEN `node.sh` SHALL invoke `build-solana.sh` and create the unit with `User=bcuser` and `LimitMEMLOCK=2000000000`; an unrecognized prefix SHALL exit non-zero. Both units SHALL set `LimitNOFILE=1000000`, `Restart=always`, `RestartSec=10`, and `EnvironmentFile=/etc/cdk_environment`.
5. THE Solana `package.json` `"aws-blockchain-node-runner"` field SHALL add both Frankendancer configurations (version `v0.819.30111`) to `availableConfigurations`, add port 8003/UDP (public, shred/Turbine) to `requiredPorts` while NOT adding ports 9001/9007 (transaction ingestion not needed for RPC-only nodes), and add "Frankendancer" to `monitoring.clientNames`, retaining all existing Agave entries unchanged.
6. THE blueprint SHALL include Frankendancer sample `.env` files (`.env-mainnet-beta-frankendancer-rpc-base`, `.env-mainnet-beta-frankendancer-rpc-extended`, `.env-mainnet-beta-frankendancer-rpc-base-ha`, `.env-testnet-frankendancer-rpc-base`) using the same two-volume storage pattern (`/data`, `/accounts`) and `SOLANA_NODE_IDENTITY_SECRET_ARN="none"` as the Agave samples.
7. THE existing `syncchecker.sh` SHALL work unchanged for Frankendancer nodes, querying `getBlockHeight`/`getHealth` on port 8899, reporting `c1_block_height`/`c1_blocks_behind` to the CWAgent namespace, and controlling `net-rules.service` traffic shaping identically to Agave nodes.
8. THE blueprint SHALL preserve all existing Agave configurations, scripts, samples, `package.json` entries, and deployment workflows without modification, and SHALL document Frankendancer in the README (configuration table, Agave-vs-Frankendancer comparison, troubleshooting for hugetlbfs/AF_XDP/`fdctl configure` failures, hardware requirements, and a FAQ entry).

### Requirement 26: Website Restructure

**User Story:** As a documentation reader, I want the Docusaurus website restructured to reflect the universal, AI-first architecture, so that I can find accurate deployment guides, configuration references, AI workflows, and blueprint docs without broken links.

(Merged from the former `website-restructure` spec. Glossary additions: **Website** — the Docusaurus 3.x site in `website/`; **Generic_Docs** — root `docs/` files; **Protocol_README** — `blueprints/{protocol}/README.md`.)

#### Acceptance Criteria

1. THE landing page (`website/src/pages/index.js`) SHALL use the tagline "AI-driven blockchain node infrastructure experimentation on AWS", present feature cards for AI-Guided Deployment, Rapid Experimentation, and Universal Architecture, and include a primary CTA to Getting Started and a secondary CTA to the Blueprints section.
2. THE sidebar SHALL contain the top-level categories in order: "Getting Started", "Guides", "AI Workflows", "Blueprints".
3. THE "Guides" section SHALL render content imported from `docs/deployment-guide.md`, `docs/configuration-reference.md`, `docs/troubleshooting.md`, `docs/testing.md`, `docs/traffic-shaping.md`, and `docs/snapshot-staging.md`.
4. THE "AI Workflows" section SHALL render content imported from `docs/ageai-deploy-prompt.md`, `docs/ageai-add-protocol-prompt.md`, `docs/ageai-healthcheck-prompt.md`, and `docs/ageai-blueprint-security-review.md`.
5. THE "Blueprints" section SHALL include an "About Blueprints" overview describing the `blueprints/{protocol}/` structure and pluggable NPM package system, followed by protocol pages importing from `blueprints/base/README.md`, `blueprints/bitcoin/README.md`, `blueprints/bnb/README.md`, `blueprints/ethereum/README.md`, and `blueprints/solana/README.md`.
6. THE Website SHALL remove legacy blueprint pages for protocols not present in `blueprints/` (Besu-private, BSC, Polygon, Scroll, Stacks, Starknet, Sui, Tezos, Theta, Vechain, Wax, XRP) and the broken `setup.md`/`docs/setup-cloud9.md` reference.
7. THE navbar SHALL link to Getting Started, Guides, AI Workflows, Blueprints, and GitHub; THE footer SHALL link to Documentation home, GitHub, Contribution guide, and Configuration Reference; THE site title SHALL be "AWS Blockchain Node Runners" and the navbar title "▣-▣-▣ Node Runners".
8. THE Docusaurus config SHALL set `onBrokenLinks` and `onBrokenMarkdownLinks` to `'throw'`, and THE website SHALL build successfully with `npm run build` after all changes.

### Requirement 27: Snapshot Staging Volume

**User Story:** As a node operator restoring a large snapshot, I want the compressed archive downloaded to a temporary EBS staging volume (kept off `/data`) and reliably cleaned up afterward, so that the download does not fill the data volume and no orphaned billable volumes are left behind.

(Merged from the former `base-snapshot-disk-overflow-fix` spec — which introduced the staging mechanism — and the `snapshot-staging-cleanup-fix` spec — which hardened cleanup. This requirement describes the final, correct end-state. Glossary additions: **Staging_Volume** — a temporary gp3 EBS volume that holds the compressed snapshot archive during download; **staging helper** — the shared `assets/common/snapshot-staging.sh` exposing `staging_mount()` and `staging_cleanup()`.)

**Motivation:** When `SNAPSHOT_ENABLED=true` and `compressed_archive_size + extracted_size > available /data space`, the download-then-extract approach fills the disk to 100% and the node never starts (e.g. Base mainnet op-reth: ~4.86 TB archive + ~9-10 TB extracted exceeds ~10.5 TB usable NVMe). Streaming extraction is not viable because the CDN drops connections frequently and `wget -c` / aria2c resume requires the archive to persist on disk.

#### Acceptance Criteria

1. THE EnvironmentConfig interface SHALL include an optional `SNAPSHOT_STAGING_VOL_SIZE` field (integer, GiB) defaulting to `0`, and THE Configuration_Loader SHALL parse it from the `.env` file. When `0` or omitted, the existing behavior (download directly to `/data`) SHALL be preserved.
2. WHEN `SNAPSHOT_STAGING_VOL_SIZE > 0` AND `SNAPSHOT_ENABLED = true` in single-node mode THEN THE SingleNodeConstruct SHALL create an encrypted gp3 staging volume (size from config, 1000 MB/s throughput, 16000 IOPS, `RemovalPolicy.DESTROY`, tagged `Purpose=snapshot-staging`), attach it at `/dev/xvdz` via `CfnVolumeAttachment`, and pass its volume ID to user data via `SNAPSHOT_STAGING_VOL_ID`.
3. WHEN `SNAPSHOT_STAGING_VOL_SIZE > 0` AND `SNAPSHOT_ENABLED = true` in HA mode THEN THE HANodesConstruct SHALL grant the instance role IAM permissions to self-manage the staging volume (`ec2:CreateVolume`, `ec2:AttachVolume`, `ec2:DetachVolume`, `ec2:DeleteVolume`, `ec2:DescribeVolumes`) scoped by `aws:RequestedRegion`, and the staging helper SHALL create and attach the volume at runtime (since the ASG launches instances dynamically).
4. THE single-node IAM grant for `ec2:DetachVolume`/`ec2:DeleteVolume` SHALL authorize against BOTH the staging volume ARN AND the instance ARN, because `DetachVolume` authorizes against the instance as well as the volume; granting only the volume ARN causes detach to be denied and the volume to be orphaned.
5. THE shared staging helper (`assets/common/snapshot-staging.sh`) SHALL expose `staging_mount()` (format-if-needed + mount at `/mnt/snapshot-staging`, exporting `STAGING_DOWNLOAD_PATH` and `STAGING_ENABLED`; resolving the device via `/dev/disk/by-id/` symlink matching the volume ID, with a `/dev/xvdz` fallback for non-Nitro instances) and `staging_cleanup()`. Each blueprint's `download-snapshot.sh` SHALL source the helper, download to `$STAGING_DOWNLOAD_PATH`, extract to `/data`, and invoke cleanup via a non-masking `EXIT` trap.
6. WHEN `staging_mount()` fails THEN the download script SHALL fall back to downloading to `/data` (preserving legacy behavior), and WHEN the snapshot is already present (sentinel/existing data) THEN it SHALL skip the download early and still clean up any pre-created staging volume.
7. WHEN a staging volume was created and the snapshot is successfully extracted THEN `staging_cleanup()` SHALL unmount, detach, and delete the volume, and SHALL confirm via `describe-volumes` that the volume no longer exists before reporting success (treating `InvalidVolume.NotFound`/empty as success for idempotency/race-safety).
8. WHEN any AWS call inside `staging_cleanup()` fails (missing permission, throttling, stalled detach, unreachable IMDS) THEN the function SHALL log a greppable `ERROR:` line including the failing operation and volume ID, and SHALL return non-zero — it SHALL NOT report success while the volume still exists.
9. WHEN the instance reboots or the script re-runs and `SNAPSHOT_STAGING_VOL_ID` is not in the current shell THEN cleanup SHALL recover the volume ID from `/etc/cdk_environment` and, failing that, by discovering the `Purpose=snapshot-staging` volume attached to the instance via `describe-volumes`, so the volume is still deleted; if no ID can be resolved it SHALL log an error and return non-zero (not silently succeed).
10. WHEN the instance terminates or the CloudFormation stack is deleted before in-instance cleanup completes THEN the staging volume SHALL still be removed via CloudFormation ownership (`RemovalPolicy.DESTROY`, single-node) so no orphan remains.
11. THE staging mechanism SHALL be adopted by the Base and BNB blueprints' `download-snapshot.sh` with identical lifecycle behavior, and any blueprint SHALL be able to opt in by sourcing the shared helper and setting `SNAPSHOT_STAGING_VOL_SIZE`. Sample `.env` files for large-snapshot configs SHALL set `SNAPSHOT_STAGING_VOL_SIZE` to ~1.1x the compressed archive size.
12. THE Dummy blueprint SHALL provide a fast, low-cost debug path (`blueprints/dummy/user-data/common/download-snapshot.sh` driven by a small `SNAPSHOT_STAGING_VOL_SIZE`, e.g. 10 GiB, and a synthetic archive) that exercises the real mount → download → extract → unmount → detach → delete lifecycle and logs `STAGING DEBUG: PASS` or `STAGING DEBUG: FAIL (orphaned volume <id>)`, so the cleanup contract can be regression-tested without a multi-TB download.
