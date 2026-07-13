#!/bin/bash
# Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
# SPDX-License-Identifier: Apache-2.0

# Solana Agave - Extended RPC Node Configuration
# Provides full RPC API access including account indexing for advanced queries
# Suitable for dApps requiring token owner/program/mint index lookups

set -o errexit
set -o nounset
set -o pipefail

# Remove empty snapshots to avoid startup issues
find "/data/data/ledger" -name "snapshot-*" -size 0 -print -exec rm {} \; 2>/dev/null || true

export RUST_LOG=error
export RUST_BACKTRACE=full

# Increase file descriptor limit (required for Solana)
ulimit -n 1000000

# Get EC2 internal IP for RPC binding
TOKEN=$(curl -s -X PUT "http://169.254.169.254/latest/api/token" -H "X-aws-ec2-metadata-token-ttl-seconds: 21600")
EC2_INTERNAL_IP=$(curl -H "X-aws-ec2-metadata-token: $TOKEN" -s http://169.254.169.254/latest/meta-data/local-ipv4)
export EC2_INTERNAL_IP

echo "Starting Agave validator (extended RPC) on $EC2_INTERNAL_IP..."
echo "Network: ${BC_NETWORK:-mainnet-beta}"

# Set network-specific parameters
case "${BC_NETWORK:-mainnet-beta}" in
    "mainnet-beta")
        ENTRY_POINTS="--entrypoint entrypoint.mainnet-beta.solana.com:8001 \
--entrypoint entrypoint2.mainnet-beta.solana.com:8001 \
--entrypoint entrypoint3.mainnet-beta.solana.com:8001 \
--entrypoint entrypoint4.mainnet-beta.solana.com:8001 \
--entrypoint entrypoint5.mainnet-beta.solana.com:8001"
        KNOWN_VALIDATORS="--known-validator 7Np41oeYqPefeNQEHSv1UDhYrehxin3NStELsSKCT4K2 \
--known-validator GdnSyH3YtwcxFvQrVVJMm1JhTS4QVX7MFsX56uJLUfiZ \
--known-validator DE1bawNcRJB9rVm3buyMVfr8mBEoyyu73NBovf2oXJsJ \
--known-validator CakcnaRDHka2gXyfbEd2d3xsvkJkqsLw2akB3zsN1D2S"
        EXPECTED_GENESIS_HASH="--expected-genesis-hash 5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d"
        export SOLANA_METRICS_CONFIG="host=https://metrics.solana.com:8086,db=mainnet-beta,u=mainnet-beta_write,p=password"
        ;;
    "testnet")
        ENTRY_POINTS="--entrypoint entrypoint.testnet.solana.com:8001 \
--entrypoint entrypoint2.testnet.solana.com:8001 \
--entrypoint entrypoint3.testnet.solana.com:8001"
        KNOWN_VALIDATORS="--known-validator 5D1fNXzvv5NjV1ysLjirC4WY92RNsVH18vjmcszZd8on \
--known-validator dDzy5SR3AXdYWVqbDEkVFdvSPCtS9ihF5kJkHCtXoFs \
--known-validator Ft5fbkqNa76vnsjYNwjDZUXoTWpP7VYm3mtsaQckQADN \
--known-validator eoKpUABi59aT4rR9HGS3LcMecfut9x7zJyodWWP43YQ \
--known-validator 9QxCLckBiJc783jnMvXZubK4wH86Eqqvashtrwvcsgkv"
        EXPECTED_GENESIS_HASH="--expected-genesis-hash 4uhcVJyU9pJkvQyS88uRDiswHXSCkY3zQawwpjk2NsNY"
        export SOLANA_METRICS_CONFIG="host=https://metrics.solana.com:8086,db=tds,u=testnet_write,p=c4fa841aa918bf8274e3e2a44d77568d9861b3ea"
        ;;
    "devnet")
        ENTRY_POINTS="--entrypoint entrypoint.devnet.solana.com:8001 \
--entrypoint entrypoint2.devnet.solana.com:8001 \
--entrypoint entrypoint3.devnet.solana.com:8001 \
--entrypoint entrypoint4.devnet.solana.com:8001 \
--entrypoint entrypoint5.devnet.solana.com:8001"
        KNOWN_VALIDATORS="--known-validator dv1ZAGvdsz5hHLwWXsVnM94hWf1pjbKVau1QVkaMJ92 \
--known-validator dv2eQHeP4RFrJZ6UeiZWoc3XTtmtZCUKxxCApCDcRNV \
--known-validator dv4ACNkpYPcE3aKmYDqZm9G5EB3J4MRoeE7WNDRBVJB \
--known-validator dv3qDFk1DTF36Z62bNvrCXe9sKATA6xvVy6A798xxAS"
        EXPECTED_GENESIS_HASH="--expected-genesis-hash EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG"
        export SOLANA_METRICS_CONFIG="host=https://metrics.solana.com:8086,db=devnet,u=scratch_writer,p=topsecret"
        ;;
    *)
        echo "ERROR: Unknown BC_NETWORK: ${BC_NETWORK}. Supported: mainnet-beta, testnet, devnet"
        exit 1
        ;;
esac

exec /home/bcuser/bin/agave-validator \
    --ledger /data/data/ledger \
    --identity /home/bcuser/config/validator-keypair.json \
    ${KNOWN_VALIDATORS} \
    ${EXPECTED_GENESIS_HASH} \
    ${ENTRY_POINTS} \
    --no-voting \
    --full-rpc-api \
    --rpc-port 8899 \
    --rpc-bind-address ${EC2_INTERNAL_IP} \
    --gossip-port 8001 \
    --dynamic-port-range 8004-8029 \
    --private-rpc \
    --wal-recovery-mode skip_any_corrupted_record \
    --enable-rpc-transaction-history \
    --init-complete-file /data/data/init-completed \
    --limit-ledger-size \
    --accounts /accounts \
    --account-index spl-token-owner \
    --account-index program-id \
    --account-index spl-token-mint \
    --account-index-exclude-key kinXdEcpDQeHPEuQnqmUgtYykqKGVFq6CeVX5iAHJq6 \
    --account-index-exclude-key TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA \
    --health-check-slot-distance 0 \
    --log -
