#!/bin/bash
# Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
# SPDX-License-Identifier: Apache-2.0

# BSC Reth - Full Node Configuration
#
# This script handles the complete lifecycle of a BSC Reth full node:
#   "install" — builds binary from source, downloads snapshot
#   no args   — runs reth-bsc with full-node flags (systemd entrypoint)
#
# The client version is derived from CLIENT_CONFIG (the configuration file
# name, e.g. "bsc-reth-v0.0.10-beta-full.sh" -> "v0.0.10-beta"), which is the
# single source of truth. reth-bsc only publishes "-beta" tags, so the beta
# suffix is part of the version and is carried in the file name.
#
# reth-bsc is built from source because the project does not publish
# pre-built binaries. Requires Rust toolchain (installed during build).
#
# See https://github.com/bnb-chain/reth-bsc for documentation.
# See https://github.com/48Club/bsc-snapshots for snapshot details.

set -eo pipefail

RETH_REPO="https://github.com/bnb-chain/reth-bsc.git"

# --- Install phase: called by node.sh during initial setup ---
install_client() {
    source /etc/cdk_environment

    # Derive the version from the configuration file name (single source of truth)
    local RETH_VERSION
    RETH_VERSION=$(echo "${CLIENT_CONFIG:-}" | sed -E 's/^bsc-[a-z]+-(.+)-[a-z]+\.sh$/\1/')
    if [ -z "$RETH_VERSION" ] || [ "$RETH_VERSION" = "${CLIENT_CONFIG:-}" ]; then
        echo "ERROR: Could not parse BSC Reth version from CLIENT_CONFIG: ${CLIENT_CONFIG:-<unset>}"
        exit 1
    fi
    echo "BSC Reth version (from config name): $RETH_VERSION"

    # --- Install build dependencies ---
    echo "Installing build dependencies for reth-bsc..."
    apt-get update -qq
    apt-get install -y -qq build-essential pkg-config libssl-dev libclang-dev cmake git

    # Install Rust toolchain if not present
    if ! command -v cargo &> /dev/null; then
        echo "Installing Rust toolchain..."
        curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y
        source "$HOME/.cargo/env"
    fi

    # --- Build reth-bsc from source ---
    echo "Building reth-bsc ${RETH_VERSION} from source..."
    cd /tmp
    git clone --branch "$RETH_VERSION" --depth 1 "$RETH_REPO" reth-bsc-build
    cd reth-bsc-build

    cargo build --bin reth-bsc --features "jemalloc,asm-keccak" --profile release

    cp target/release/reth-bsc /home/bcuser/bin/reth-bsc
    chmod +x /home/bcuser/bin/reth-bsc
    echo "reth-bsc binary installed"

    # Clean up build artifacts to reclaim disk space
    cd /tmp
    rm -rf reth-bsc-build
    echo "Build artifacts cleaned up"

    # --- Download snapshot ---
    # reth.full    = full node snapshot (~4.3 TiB)
    # reth.archive = archive node snapshot (~9.7 TiB)
    local SNAPSHOT_TYPE="${BNB_SNAPSHOT_TYPE:-full}"
    /opt/blueprints/user-data/common/download-snapshot.sh reth "$SNAPSHOT_TYPE" || true

    echo "BSC Reth ${RETH_VERSION} full node installation complete"
}

# --- Runtime phase: systemd service entrypoint ---
run_node() {
    # Get EC2 internal IP for RPC binding
    local TOKEN
    TOKEN=$(curl -s -X PUT "http://169.254.169.254/latest/api/token" -H "X-aws-ec2-metadata-token-ttl-seconds: 21600")
    local EC2_INTERNAL_IP
    EC2_INTERNAL_IP=$(curl -H "X-aws-ec2-metadata-token: $TOKEN" -s http://169.254.169.254/latest/meta-data/local-ipv4)

    source /etc/cdk_environment 2>/dev/null || true

    # Map BC_NETWORK to reth chain name
    local CHAIN_NAME
    case "${BC_NETWORK:-mainnet}" in
        mainnet)  CHAIN_NAME="bsc" ;;
        chapel)   CHAIN_NAME="bsc-testnet" ;;
        *)
            echo "ERROR: Unknown BC_NETWORK: ${BC_NETWORK}. Supported: mainnet, chapel"
            exit 1
            ;;
    esac

    exec /home/bcuser/bin/reth-bsc node \
        --full \
        --chain="$CHAIN_NAME" \
        --datadir=/data \
        --db.max-size=8TB \
        --http \
        --http.addr="$EC2_INTERNAL_IP" \
        --http.port=8545 \
        --http.api="admin,debug,eth,net,trace,txpool,web3,rpc,reth,ots" \
        --ws \
        --ws.addr="$EC2_INTERNAL_IP" \
        --ws.port=8546 \
        --ws.api="eth,net,web3,txpool" \
        --authrpc.addr="127.0.0.1" \
        --authrpc.port=8551 \
        --engine.parallel-sparse-trie \
        --metrics="$EC2_INTERNAL_IP:6060" \
        --engine.memory-block-buffer-target=128 \
        --maxpeers=50
}

# Dispatch based on argument
case "${1:-run}" in
    install)
        install_client
        ;;
    run|"")
        run_node
        ;;
    *)
        echo "Usage: $0 {install|run}"
        exit 1
        ;;
esac
