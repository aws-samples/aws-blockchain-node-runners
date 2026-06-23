---
sidebar_label: About Blueprints
sidebar_position: 1
---

# About Blueprints

Blueprints are self-contained protocol packages that define everything needed to deploy a blockchain node on AWS. The project uses a pluggable architecture where each protocol lives in its own directory under `blueprints/` and is delivered as an NPM package.

## Directory Structure

Each protocol blueprint follows a standard directory layout:

```
blueprints/{protocol}/
├── package.json          # Protocol metadata and configuration
├── README.md             # Protocol-specific documentation
├── configurations/       # Node configuration scripts (versioned)
├── samples/              # Sample .env files for different deployment modes
└── user-data/            # EC2 user-data scripts for node setup
```

This structure ensures consistency across all protocols and makes it straightforward to add new ones.

## Pluggable NPM Package System

Each blueprint is an NPM package with a special `"aws-blockchain-node-runner"` field in its `package.json`. This field declares the protocol's configuration metadata, including:

- **`BLOCKCHAIN_PROTOCOL`** — Protocol identifier (e.g., `"ethereum"`, `"solana"`)
- **`supportedDeploymentModes`** — Available deployment modes (`"single-node"`, `"ha-nodes"`)
- **`defaultConfiguration`** — The default configuration script to use
- **`availableConfigurations`** — List of versioned configuration scripts
- **`BC_NETWORKS`** — Supported networks (e.g., `"mainnet"`, `"testnet"`)
- **`defaultInstanceTypes`** — Recommended EC2 instance types by architecture
- **`requiredPorts`** — Network ports the node needs open
- **`monitoring`** — Health check and metrics configuration
- **`storage`** — EBS volume specifications
- **`snapshot`** — Snapshot download configuration (if applicable)
- **`customEnvVars`** — Protocol-specific environment variables

The `ConfigurationLoader` resolves blueprints from `node_modules/` at runtime. Built-in blueprints (those in the `blueprints/` directory) are referenced as `file:` path dependencies in the root `package.json` and installed alongside any external blueprints. This means there is no distinction between built-in and third-party blueprints at runtime — they are all discovered and loaded the same way.

### Example

Here is a simplified example of the `"aws-blockchain-node-runner"` field from `blueprints/dummy/package.json`:

```json
{
  "aws-blockchain-node-runner": {
    "BLOCKCHAIN_PROTOCOL": "dummy",
    "supportedDeploymentModes": ["single-node", "ha-nodes"],
    "defaultConfiguration": "dummy-1.0.0-rpc-base.sh",
    "BC_NETWORKS": ["testnet", "mainnet", "devnet"],
    "defaultInstanceTypes": {
      "x86_64": "t3.medium",
      "ARM_64": "t4g.medium"
    },
    "requiredPorts": [
      { "port": 8545, "protocol": "tcp", "description": "JSON RPC" }
    ]
  }
}
```

See [`blueprints/dummy/package.json`](https://github.com/aws-samples/aws-blockchain-node-runners/blob/main/blueprints/dummy/package.json) for the full reference implementation.

## Supported Protocols

| Protocol | Directory | Description |
|----------|-----------|-------------|
| Base | `blueprints/base/` | OP Stack Layer 2 protocol |
| Bitcoin | `blueprints/bitcoin/` | Bitcoin network nodes |
| BNB | `blueprints/bnb/` | BNB Smart Chain nodes |
| Ethereum | `blueprints/ethereum/` | Ethereum execution and consensus clients |
| Solana | `blueprints/solana/` | Solana validator and RPC nodes |
| Dummy | `blueprints/dummy/` | Reference implementation for testing and development |

## Adding a New Protocol

You can add a new protocol blueprint using AI-assisted workflows. The [Add Protocol with AI](/docs/ai-prompts/add-protocol-with-ai) guide walks through the entire process with an AI assistant, from creating the directory structure to writing configuration scripts and sample environment files.

The general steps are:

1. Create a new directory under `blueprints/{protocol}/`
2. Define the protocol's `package.json` with the `"aws-blockchain-node-runner"` field
3. Write configuration scripts in `configurations/`
4. Provide sample `.env` files in `samples/`
5. Create user-data scripts in `user-data/`
6. Add the blueprint as a `file:` dependency in the root `package.json`

Use `blueprints/dummy/` as a starting template — it demonstrates all required fields and conventions.

## Contributing

When contributing a new blueprint:

1. Follow the standard directory structure shown above
2. Use the `dummy` blueprint as your reference implementation
3. Ensure your `package.json` includes all required fields in the `"aws-blockchain-node-runner"` section
4. Provide sample `.env` files for each supported deployment mode
5. Include a `README.md` with deployment instructions specific to your protocol
6. Run the test suite to verify your blueprint integrates correctly with the framework
