---
sidebar_position: 15
---

# Bitcoin

## Introduction

Bitcoin is the first and most widely recognized cryptocurrency, operating on a decentralized peer-to-peer network. Bitcoin Core (bitcoind) is the reference implementation of the Bitcoin protocol.

This blueprint helps you deploy Bitcoin Core nodes on AWS using Amazon EC2.

## Architecture

### Single Node

A standalone Bitcoin node suitable for development, testing, or personal use.

### HA Nodes

Multiple Bitcoin nodes behind an Application Load Balancer for production workloads requiring high availability.

## Supported Networks

| Network | Description | P2P Port | RPC Port |
|---------|-------------|----------|----------|
| mainnet | Bitcoin main network | 8333 | 8332 |
| testnet | Bitcoin test network | 18333 | 18332 |
| signet | Bitcoin signet network | 38333 | 38332 |
| regtest | Regression test network | 18444 | 18443 |

## Hardware Requirements

### Mainnet Full Node

| Resource | Minimum | Recommended |
|----------|---------|-------------|
| CPU | 2 cores | 4+ cores |
| Memory | 4 GB | 8+ GB |
| Storage | 700 GB | 1 TB+ |
| Network | 100 Mbps | 1 Gbps |

### Pruned Node

| Resource | Minimum | Recommended |
|----------|---------|-------------|
| CPU | 2 cores | 2+ cores |
| Memory | 2 GB | 4+ GB |
| Storage | 10 GB | 20 GB |
| Network | 50 Mbps | 100 Mbps |

## Deployment

### Prerequisites

- AWS Account with appropriate permissions
- AWS CDK installed
- Node.js 18+ and npm

### Quick Start

```bash
cd lib/bitcoin
npm install
cp sample-configs/.env-sample-mainnet .env
# Edit .env with your configuration
npx cdk deploy bitcoin-common
npx cdk deploy bitcoin-single-node
```

## Configuration

### Key Parameters

| Parameter | Description |
|-----------|-------------|
| `BITCOIN_TXINDEX` | Enable transaction index for full transaction lookup |
| `BITCOIN_PRUNE` | Enable pruning to reduce disk usage |
| `BITCOIN_DBCACHE` | Database cache size (higher = faster sync) |
| `BITCOIN_RPCAUTH` | RPC authentication credentials |

### RPC Authentication

Generate secure RPC credentials:

```bash
wget https://raw.githubusercontent.com/bitcoin/bitcoin/master/share/rpcauth/rpcauth.py
python3 rpcauth.py myusername
```

## Security

- Node runs as dedicated `bitcoin` user (not root)
- RPC ports restricted to VPC CIDR
- P2P ports open for network participation
- SSM Session Manager for secure access
- Encrypted EBS volumes

## Monitoring

CloudWatch dashboard includes:
- Block height and sync progress
- Peer connections
- Mempool size
- CPU, memory, and disk metrics

## Useful Commands

```bash
# Check sync status
bitcoin-cli getblockchaininfo

# Get network info
bitcoin-cli getnetworkinfo

# Get mempool info
bitcoin-cli getmempoolinfo

# Get peer info
bitcoin-cli getpeerinfo
```
