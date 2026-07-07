# Add a New Blockchain Protocol

## Blueprint System Overview

Blockchain protocols are delivered as NPM packages called "blueprints". Each blueprint contains protocol-specific configuration, scripts, and sample files. The `ConfigurationLoader` resolves all blueprints from `node_modules/` — there is no distinction between built-in and external blueprints at runtime.

Blueprint packages follow the naming convention: `aws-bnr-blueprint-<protocol>` (e.g., `aws-bnr-blueprint-ethereum`, `aws-bnr-blueprint-solana`).

Built-in blueprints live in `blueprints/` and are referenced as `file:` path dependencies in the root `package.json`. After `npm install`, they land in `node_modules/` alongside external blueprints. The `ConfigurationLoader` treats them identically.

The `blueprints/dummy/` directory is the canonical reference implementation. Use it as a template when creating new blueprints. See [blueprints/dummy/README.md](https://github.com/aws-samples/aws-blockchain-node-runners/blob/main/blueprints/dummy/README.md) for details.

## Who Is This For?

This workflow supports two paths. The generation steps below are shared — what differs is where the blueprint lives and how it is distributed.

- **Path A: Core Maintainers** — adding a built-in blueprint directly to the `blueprints/` directory of the Node Runners repository, wired as a `file:` path dependency in the root `package.json`. This is the existing flow documented throughout this file.
- **Path B: Community Developers (Recommended)** — creating an external blueprint as a standalone NPM package in your own repository, published independently and installed into a user's `node_modules/` like any other blueprint.

> **Note:** Since the v2 core blueprint lock (Jun 2026), new protocols are added as external community blueprints, not built-in. Path B is the standard contribution model.

Because the `ConfigurationLoader` resolves all blueprints from `node_modules/` identically, the file generation steps (package.json, samples, configuration scripts, user-data, README) are the same for both paths. The "Testing Your External Blueprint Locally" and "Publishing and Listing" sections below cover the Path B specifics.

## PREREQUISITES CHECK

Before starting, confirm you have:
1. URL to the protocol's official RPC node deployment documentation
2. (Optional) Additional resources: GitHub repo, snapshot sources, community guides

IMPORTANT: This workflow is for RPC node deployments only. Validator or consensus nodes have different requirements and are not covered.

At the start, ask the user for:
1. Protocol name
2. URL to official RPC node documentation
3. (Optional) Any special requirements or constraints
4. (Optional) Preferred client software if multiple options exist

## STEP 1: READ CONTEXT FILES

Read these files to understand the project structure and patterns:

Required:
- `blueprints/dummy/` — Complete working example (primary template)
  - `package.json` — Configuration structure (in `"aws-blockchain-node-runner"` field)
  - `samples/.env-*` — Environment configuration examples
  - `configurations/*.sh` — Configuration script patterns
  - `user-data/node.sh` — Generic initialization pattern
  - `README.md` — Documentation template
- `docs/configuration-reference.md` — Environment variable reference
- `docs/troubleshooting.md` — Troubleshooting patterns
- `.kiro/specs/universal-blockchain-node-runner/design.md` — Architecture and interfaces
- `.kiro/steering/*.md` — Project patterns and conventions

## STEP 2: FETCH AND ANALYZE DOCUMENTATION

Using the provided documentation URL:
1. Fetch the protocol's official RPC node documentation
2. Extract key information:
   - Client software name and versions
   - Installation methods (binary, Docker, docker-compose)
   - System requirements (CPU, memory, storage)
   - Network configuration (RPC ports, P2P ports)
   - Snapshot availability and sources

If documentation URL is inaccessible, ask the user to provide documentation as a local file or offer to proceed with available information and iterate.

## STEP 3: RESEARCH INFRASTRUCTURE REQUIREMENTS

Based on the protocol documentation, research and determine:

1. **Instance Type Recommendation**:
   - CPU and memory requirements from protocol docs
   - Recommended EC2 instance types (x86_64 and ARM_64)
   - Justification based on protocol specifications

2. **Storage Type Selection**:
   - Block creation time (seconds per block)
   - If sub-10 second blocks: Recommend io2 or Instance Store
   - If 10+ second blocks: Recommend gp3
   - For long-term deployments: Compare Instance Store with Savings Plans vs EBS costs

3. **Storage Size Requirements**:
   - Current blockchain data size
   - Growth rate (GB per month)
   - Check snapshot size from https://publicnode.com/snapshots
   - Space needed for snapshot download and extraction (2-3x compressed size)
   - Recommended total storage with 12-month projection

4. **Network Traffic Estimation**:
   - Average peer count
   - Block size and block time
   - Estimated monthly outgoing P2P traffic in TB
   - Monthly data transfer cost ($0.09/GB after 100 GB free tier)

5. **Traffic Shaping Assessment**:
   - If block time <10 seconds: Recommend traffic shaping for cost optimization
   - Potential cost savings (up to 85% reduction in data transfer costs)
   - See `docs/traffic-shaping.md` for implementation details

6. **Monthly Cost Estimate**:
   - Compute cost (instance type)
   - Storage cost (type and size)
   - Network transfer cost (with and without traffic shaping if applicable)
   - CloudWatch logs cost (~15% of total or from protocol estimates)
   - Total estimated monthly cost

Present this research as a structured summary for review before proceeding.

## STEP 4: CREATE PROTOCOL DIRECTORY STRUCTURE

Create the following structure for the blueprint package. If contributing to the core repository, place it in `blueprints/{protocol-name}/`. If creating an external package, create a standalone directory:

```
aws-bnr-blueprint-{protocol-name}/
├── package.json
├── README.md
├── samples/
│   ├── .env-{network}-{client}-{type}
│   ├── .env-{network}-{client}-{type}-ha
│   ├── .env-{network}-{client1}-{client2}-{type}       (multi-client)
│   └── .env-{network}-{client1}-{client2}-{type}-ha    (multi-client HA)
├── configurations/
│   └── {client}-{version}-{type}.sh or .yml
├── user-data/
│   ├── node.sh
│   ├── syncchecker.sh (if traffic shaping recommended)
│   └── common/ (optional, shared helper scripts)
└── monitoring/ (optional)
    └── single-node-dashboard-template.json
```

## STEP 5: GENERATE package.json

Create `package.json` with standard NPM fields and an `"aws-blockchain-node-runner"` field.

Standard NPM fields:
- `name`: `"aws-bnr-blueprint-{protocol}"` (naming convention)
- `version`: `"2.0.0"`
- `description`: Human-readable description
- `peerDependencies`: `{ "aws-blockchain-node-runners": ">=2.0.0" }`

The `"aws-blockchain-node-runner"` field contains protocol-specific configuration:
- `BLOCKCHAIN_PROTOCOL`: Lowercase protocol name
- `supportedDeploymentModes`: Array of supported modes
- `defaultConfiguration`: Default configuration file name
- `availableConfigurations`: Array of configuration objects
- `BC_NETWORKS`: Array of supported networks
- `defaultInstanceTypes`: x86_64 and ARM_64 recommendations
- `requiredPorts`: Array of port objects (port, protocol, description, public)
- `monitoring`: Health check and metrics configuration
- `storage`: Default data volumes configuration
- `customEnvVarsNamePrefix`: Prefix for protocol-specific env vars
- `snapshot`: Snapshot configuration (optional)
- `trafficShaping`: Traffic shaping support (optional)

Follow the structure from `blueprints/dummy/package.json` exactly.

## STEP 6: GENERATE SAMPLE .ENV FILES

Create sample .env files for each supported combination.

Single-client protocols (one client binary, e.g. Solana/Agave):
- `.env-{network}-{client}-{type}` (mainnet, single-node, e.g. `.env-mainnet-beta-agave-rpc-base`)
- `.env-{network}-{client}-{type}-ha` (mainnet, HA, e.g. `.env-mainnet-beta-agave-rpc-base-ha`)
- `.env-{network}-{client}-{type}` (testnet, single-node, e.g. `.env-testnet-agave-rpc-base`)

Multi-client protocols (execution + consensus, e.g. Ethereum):
- `.env-mainnet-{client1}-{client2}-{type}` (e.g. `.env-mainnet-geth-lighthouse-full`)
- `.env-mainnet-{client1}-{client2}-{type}-ha` (e.g. `.env-mainnet-geth-lighthouse-full-ha`)
- `.env-testnet-{client1}-{client2}-{type}` (e.g. `.env-sepolia-geth-lighthouse-full`)

Only create HA samples if HA is practical for this protocol.

Each file must include:
- `AWS_ACCOUNT_ID` and `AWS_REGION` (with placeholder values)
- `AWS_AZ` (optional, commented-out — override automatic AZ selection for single-node)
- `BLOCKCHAIN_PROTOCOL` (protocol name)
- `DEPLOYMENT_MODE` ("single-node" or "ha-nodes")
- `INSTANCE_TYPE` (recommended type)
- `CPU_TYPE` ("x86_64" or "ARM_64")
- `BC_NETWORK` (network name)
- `CLIENT_CONFIG` (configuration script name without extension)
- Storage configuration (`DATA_VOL_*` variables)
- Traffic shaping variables (if applicable): `TRAFFIC_SHAPING_ENABLED`, `TRAFFIC_SHAPING_RATE_MBIT`, `TRAFFIC_SHAPING_MAX_BLOCKS_BEHIND`
- HA-specific variables (for HA files only)

Follow patterns from `blueprints/solana/samples/` (single-client) or `blueprints/ethereum/samples/` (multi-client).

## STEP 7: GENERATE CONFIGURATION SCRIPTS

Create configuration scripts in `configurations/` directory. There are two patterns depending on how the client runs:

**Pattern A: Native binary (.sh) — used by Solana, BNB**

For protocols that run as native binaries (not Docker), the configuration script serves dual purpose via an install/run dispatch:
- `install` phase: downloads binary, snapshot, network config, initializes genesis
- `run` phase (no args): exec's the node binary with runtime flags (systemd entrypoint)

The script must implement this dispatch pattern:
```bash
install_client() {
    # Download binary, snapshot, network config, init genesis
}
run_node() {
    exec /path/to/binary --flags...
}
case "${1:-run}" in
    install) install_client ;;
    run|"")  run_node ;;
esac
```

`node.sh` calls `"$CONFIG_SCRIPT" install` during setup, then copies the script to `/home/bcuser/bin/start-node.sh` as the systemd service entrypoint (called with no args → run phase).

For the install phase:
- Download and verify client binary (checksum verification when available)
- Download snapshot if enabled (use shared helper in `user-data/common/` if multiple client configs share the same snapshot mechanism)
- Download network configuration files (genesis, config)
- Initialize the chain database (genesis init)

**Pattern B: Docker-compose (.yml) — used by Ethereum, Base**

For protocols that run via Docker, the configuration file is a docker-compose.yml with `${VARIABLE}` placeholders. `node.sh` copies it to the working directory and substitutes variables with `sed` before starting via `docker compose up -d`.

The file must:
- Define services with proper image tags and versions
- Use `${EC2_INTERNAL_IP}` for RPC binding (substituted by node.sh)
- Mount /data, /secrets, and other required volumes
- Set security options (no-new-privileges, read-only where possible)
- Use host networking mode

**File naming:**
- Native binary: `{client}-{version}-{type}.sh` (e.g. `bsc-geth-v1.7.2-full.sh`)
- Docker-compose: `{client1}-{version1}-{client2}-{version2}-{type}.yml` (e.g. `geth-1.16.8-lighthouse-8.1.0-full.yml`)

**For both patterns:**
- RPC must bind to `$EC2_INTERNAL_IP:{port}` (not 0.0.0.0)
- P2P must bind to `0.0.0.0:{port}` for external connectivity
- authrpc and metrics endpoints should bind to `127.0.0.1` or `$EC2_INTERNAL_IP` (never 0.0.0.0 unless required by a separate consensus client on another host)

## STEP 8: GENERATE user-data/node.sh

Create the protocol-level initialization script. This script handles concerns common across all client configurations for the protocol.

**For native binary protocols (Pattern A)**, node.sh must:
1. Source `/etc/cdk_environment` and validate required variables
2. Verify the configuration script exists at `/opt/blueprints/configurations/${CLIENT_CONFIG}`
3. Create directory structure (`/data`, `/home/bcuser/bin`, etc.)
4. Call the configuration script's install phase: `"$CONFIG_SCRIPT" install`
5. Set ownership (`chown -R bcuser:bcuser /data /home/bcuser`)
6. Copy the configuration script to `/home/bcuser/bin/start-node.sh`
7. Create systemd service named "node" with:
   - `User=bcuser`, `Group=bcuser`
   - `EnvironmentFile=/etc/cdk_environment`
   - `ExecStart=/home/bcuser/bin/start-node.sh`
8. Enable and start the service
9. Touch `/data/init-completed` sentinel

**For Docker-based protocols (Pattern B)**, node.sh must:
1. Source `/etc/cdk_environment` and validate required variables
2. Install Docker if not present
3. Configure Docker logging (syslog driver)
4. Add bcuser to docker group (`usermod -aG docker bcuser`)
5. Create directory structure
6. Copy the docker-compose.yml and substitute variables with `sed`
7. Create systemd service that runs `docker compose up/down`
8. Enable and start the service
9. Touch `/data/init-completed` sentinel

node.sh must NOT contain client-specific logic (binary URLs, version numbers, runtime flags). All of that belongs in the configuration script.

If multiple client configurations share common logic (e.g. snapshot download), extract it into `user-data/common/` as a shared helper script.

**Snapshot Staging for Large Snapshots**: If the protocol has large snapshots where `compressed_size + extracted_size > available /data space`, the blueprint's `download-snapshot.sh` should:
1. Set `SNAPSHOT_STAGING_VOL_SIZE` in sample `.env` files to ~1.1x the compressed archive size
2. Source the shared staging helper: `source /opt/assets/common/snapshot-staging.sh 2>/dev/null || true`
3. Call `staging_mount()` before downloading (falls back to `/data` if staging is disabled or fails)
4. Download to `$STAGING_DOWNLOAD_PATH` instead of `/data`
5. Extract from `$STAGING_DOWNLOAD_PATH` to `/data`
6. Call `staging_cleanup()` after successful extraction

See `blueprints/base/user-data/common/download-snapshot.sh` for a working example and [docs/snapshot-staging.md](/docs/guides/snapshot-staging) for volume sizing guidance.

Follow the pattern from `blueprints/bnb/user-data/node.sh` (native binary) or `blueprints/ethereum/user-data/node.sh` (Docker-based).

## STEP 9: GENERATE syncchecker.sh (IF APPLICABLE)

If traffic shaping is recommended (block time <10s):
1. Create `user-data/syncchecker.sh`
2. Script must:
   - Query node for current sync status
   - Calculate blocks/slots behind
   - Report `c1_blocks_behind` metric to CloudWatch (namespace: CWAgent)
   - Control traffic shaping based on sync status
   - Log activity for troubleshooting

Follow the pattern from `blueprints/dummy/user-data/syncchecker.sh` if it exists, or see `docs/traffic-shaping.md` for implementation guidance.

## STEP 10: GENERATE README.md

Create comprehensive README following this exact structure:

1. **Title and Introduction**: Protocol description and purpose
2. **Overview of Deployment Architectures**: Single Node and HA (with diagrams)
3. **Supported Configurations**: Table of available client configurations
4. **Infrastructure Requirements**: Instance types, storage, network traffic tables
5. **Setup Instructions**:
   - Note linking to setup instructions — for a built-in blueprint reference the main README (`../../README.md`); for an external blueprint link to [Getting Started](/docs/getting-started/quickstart)
   - Prerequisites (with AWS CloudShell tip)
   - Step 1: Configure Environment
   - Step 2: Choose Configuration (protocol-specific)
   - Step 3: Deploy (with AI Alternative note)
   - Step 4: Monitor Deployment
   - Step 5: Verify Node Operation
6. **Configuration Options**: Protocol-specific variables and settings
7. **Troubleshooting**: Node Not Starting, Metrics Not Appearing, Health Check Failures, reference to main Troubleshooting Guide
8. **Upgrades**: Upgrading Node Configuration, Rolling Updates (HA Only)
9. **Cost Optimization**: Storage, Compute, Network
10. **Security Considerations**: List of security best practices
11. **FAQ**: Common questions in Q&A format (not collapsible)
12. **Additional Resources**: Links to protocol docs and guides
13. **Support**: Where to get help

Follow the exact structure from `blueprints/dummy/README.md`.

Critical README requirements:
- Include a note at the top of Setup Instructions linking to setup docs. For a built-in blueprint in `blueprints/`, reference the main README (`../../README.md`). For an external blueprint, link to the website Getting Started page ([Getting Started](/docs/getting-started/quickstart)) instead, since `../../README.md` does not resolve outside the core repository.
- Add AWS CloudShell tip in Prerequisites
- Add "AI Alternative" note after deploy command mentioning @deploy prompt
- Use CloudWatch Logs as primary diagnostic method in Troubleshooting
- Include proper log viewing commands with filter patterns
- Reference main Troubleshooting Guide at end of Troubleshooting section
- Keep FAQ answers direct (not in collapsible sections)

## STEP 11: GENERATE MONITORING DASHBOARD (OPTIONAL)

If protocol has custom metrics or multi-client setup:
1. Create `monitoring/single-node-dashboard-template.json`
2. Include widgets for:
   - `c1_block_height`, `c1_blocks_behind`
   - `c2_block_height`, `c2_blocks_behind` (if multi-client)
   - System metrics (CPU, memory, disk, network)
   - Storage performance (latency, IOPS, throughput)
   - Traffic shaping metrics (if applicable)

Follow the pattern from `lib/common/monitoring-dashboards/single-node-dashboard-template.json`.

## STEP 12: VALIDATE GENERATED FILES

After generating all files:
1. Validate package.json syntax: `cat node_modules/aws-bnr-blueprint-{protocol}/package.json | jq .`
2. Ensure the blueprint is installed into `node_modules/` (add to root `package.json` and run `npm install`)
3. Run `npx cdk synth` — validates that all files referenced in `availableConfigurations` exist and user-data scripts are present
4. Verify file naming conventions are followed
5. Ensure all patterns match dummy protocol
6. Confirm bcuser permissions are set correctly
7. Verify RPC binds to internal IP, P2P binds to 0.0.0.0
8. Check metrics use CWAgent namespace with `c1_`/`c2_` prefixes

## Testing Your External Blueprint Locally

For Path B (external blueprints), test the package against a local checkout of Node Runners before publishing:

1. **Install your blueprint into a Node Runners checkout**:
   ```bash
   git clone https://github.com/aws-samples/aws-blockchain-node-runners.git
   cd aws-blockchain-node-runners
   npm install
   npm install /path/to/your/blueprint --legacy-peer-deps
   ```
   Pointing `npm install` at the local blueprint directory links it into `node_modules/` so the `ConfigurationLoader` resolves it like any published blueprint. The `--legacy-peer-deps` flag is required because the blueprint declares a peer dependency on the `aws-blockchain-node-runners` framework, which is not published to the npm registry.

2. **Synthesize the stack** to validate configuration files and user-data scripts resolve:
   ```bash
   BLOCKCHAIN_PROTOCOL=<name> npx cdk synth
   ```

3. **Deploy to a test account** using the sample `.env` shipped with your blueprint:
   ```bash
   cp node_modules/aws-bnr-blueprint-<name>/samples/.env-testnet-<client>-<type> .env
   # Edit AWS_ACCOUNT_ID and AWS_REGION
   npx cdk deploy --json --outputs-file deploy-output.json
   ```

Verify the node operates correctly (see STEP 13 for verification commands), then clean up with `npx cdk destroy`.

## STEP 13: PROVIDE TESTING INSTRUCTIONS

Guide the user on testing the implementation:

1. **Deploy to Testnet**:
   ```bash
   cp node_modules/aws-bnr-blueprint-{protocol}/samples/.env-testnet-{client}-{type} .env
   # Edit AWS_ACCOUNT_ID and AWS_REGION
   npx cdk deploy --json --outputs-file deploy-output.json
   ```

2. **Verify Node Operation**:
   ```bash
   export INSTANCE_ID=$(cat deploy-output.json | jq -r '..|.InstanceId? | select(. != null)')
   aws ssm start-session --target $INSTANCE_ID --region $AWS_REGION
   sudo systemctl status node
   sudo journalctl -u node -f
   ```

3. **Check Metrics**: View CloudWatch dashboard, verify `c1_block_height` and `c1_blocks_behind` metrics appear

4. **Test Traffic Shaping** (if implemented):
   ```bash
   sudo systemctl status net-rules.service
   sudo journalctl -u syncchecker.service -n 50
   ```

5. **Clean Up**: `npx cdk destroy`

## ERROR HANDLING

- If documentation URL is inaccessible: Ask the user to provide documentation as a local file, or offer to proceed with available information and iterate
- If infrastructure requirements are unclear: Ask for clarification, provide conservative recommendations with justification
- If protocol has unique requirements: Ask for additional details, explain how to adapt the standard patterns

## GUIDELINES

DO:
- Always read `blueprints/dummy/` as the primary template
- Always read protocol documentation before making recommendations
- Present infrastructure research for review before generating files
- Follow file naming conventions exactly
- Use install/run dispatch for native binaries, docker-compose.yml for Docker
- Extract shared logic into `user-data/common/`
- Implement traffic shaping for protocols with block time <10s
- Ensure all scripts pass `shellcheck -S warning` with no findings
- Validate with `npx cdk synth` before declaring success

DO NOT:
- Never use protocol-specific service names (always "node")
- Never run services as root (always bcuser)
- Never bind RPC, authrpc, or metrics to 0.0.0.0
- Never use protocol-specific metrics namespaces (always CWAgent)
- Never guess configuration values
- Never skip bcuser setup or permissions
- Never put client-specific logic (binary URLs, versions, flags) in node.sh
- Never skip the infrastructure research step

## CRITICAL PATTERNS

| Pattern | Correct | Wrong |
|---------|---------|-------|
| Service name | `node` | protocol-specific name |
| Service user | `bcuser` (UID 1002, GID 1002) | root |
| Systemd EnvironmentFile | `/etc/cdk_environment` | hardcoded values |
| RPC binding | `$EC2_INTERNAL_IP:{port}` | `0.0.0.0:{port}` |
| P2P binding | `0.0.0.0:{port}` | `$EC2_INTERNAL_IP:{port}` |
| authrpc/metrics binding | `127.0.0.1` or `$EC2_INTERNAL_IP` | `0.0.0.0` |
| Metrics namespace | `CWAgent` | custom namespace |
| Metrics naming | `c1_block_height`, `c1_blocks_behind` | custom names |
| Multi-client metrics | `c2_block_height`, `c2_blocks_behind` | — |
| Native config file | `{client}-{version}-{type}.sh` | arbitrary naming |
| Docker config file | `{client1}-{version1}-{client2}-{version2}-{type}.yml` | arbitrary naming |
| Sample naming (single) | `.env-{network}-{client}-{type}` | arbitrary naming |
| Sample naming (multi) | `.env-{network}-{client1}-{client2}-{type}` | arbitrary naming |
| HA variant | append `-ha` | separate directory |

## Publishing and Listing

Once an external blueprint (Path B) is tested, distribute it so users can install it into their own Node Runners checkout. Choose one or more of the following:

- **NPM Registry**: Publish the package with `npm publish`. Users then install it with `npm install aws-bnr-blueprint-<protocol> --legacy-peer-deps`.
- **GitHub**: Push the blueprint to a public repository. Users can install directly from the repo with `npm install github:org/repo --legacy-peer-deps`.
- **Note**: The `--legacy-peer-deps` flag is required when installing an external blueprint because blueprints declare a peer dependency on the `aws-blockchain-node-runners` framework, which is not published to the npm registry (npm 7+ strict peer resolution would otherwise fail).
- **Community Catalog**: Open a pull request to add an entry for your blueprint to the Community Blueprints Catalog page so others can discover it.

After installation by any method, the blueprint lands in `node_modules/` and the `ConfigurationLoader` resolves it identically to a built-in blueprint — users deploy it with `BLOCKCHAIN_PROTOCOL=<protocol> npx cdk deploy`.
