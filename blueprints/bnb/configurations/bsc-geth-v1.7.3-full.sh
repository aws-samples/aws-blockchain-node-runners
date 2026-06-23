#!/bin/bash
# Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
# SPDX-License-Identifier: Apache-2.0

# BSC Geth - Full Node Configuration
#
# This script handles the complete lifecycle of a BSC Geth full node:
#   "install" — downloads binary, snapshot, network config, inits genesis
#   no args   — runs geth with full-node flags (systemd entrypoint)
#
# The client version is derived from CLIENT_CONFIG (the configuration file
# name, e.g. "bsc-geth-v1.7.3-full.sh" -> "v1.7.3"), which is the single
# source of truth.
#
# Runtime flags match the 48Club geth.local snapshot requirements.
# See https://github.com/48Club/bsc-snapshots for snapshot flag details.

set -eo pipefail

# --- Install phase: called by node.sh during initial setup ---
install_client() {
    source /etc/cdk_environment

    # Derive the version from the configuration file name (single source of truth)
    local BSC_VERSION
    BSC_VERSION=$(echo "${CLIENT_CONFIG:-}" | sed -E 's/^bsc-[a-z]+-(.+)-[a-z]+\.sh$/\1/')
    if [ -z "$BSC_VERSION" ] || [ "$BSC_VERSION" = "${CLIENT_CONFIG:-}" ]; then
        echo "ERROR: Could not parse BSC Geth version from CLIENT_CONFIG: ${CLIENT_CONFIG:-<unset>}"
        exit 1
    fi
    echo "BSC Geth version (from config name): $BSC_VERSION"

    local ARCH
    ARCH=$(uname -m)

    # --- Download BSC Geth binary ---
    echo "Downloading BSC Geth binary ${BSC_VERSION}..."
    cd /tmp

    RELEASE_JSON=$(curl -s "https://api.github.com/repos/bnb-chain/bsc/releases/tags/${BSC_VERSION}")

    if [ "$ARCH" = "x86_64" ]; then
        ASSET_NAME="geth_linux"
    else
        ASSET_NAME="geth-linux-arm64"
    fi

    BINARY_URL=$(echo "$RELEASE_JSON" | jq -r ".assets[] | select(.name==\"$ASSET_NAME\") | .browser_download_url")
    EXPECTED_SHA=$(echo "$RELEASE_JSON" | jq -r ".assets[] | select(.name==\"$ASSET_NAME\") | .digest" | sed 's/^sha256://')

    if [ -z "$BINARY_URL" ] || [ "$BINARY_URL" = "null" ]; then
        echo "ERROR: Could not find download URL for $ASSET_NAME in release ${BSC_VERSION}"
        exit 1
    fi

    echo "Binary URL: $BINARY_URL"
    curl -fsSL -o /home/bcuser/bin/geth "$BINARY_URL"

    # Verify SHA256 checksum from the GitHub release metadata
    if [ -n "$EXPECTED_SHA" ] && [ "$EXPECTED_SHA" != "null" ]; then
        echo "Verifying SHA256 checksum..."
        ACTUAL_SHA=$(sha256sum /home/bcuser/bin/geth | awk '{print $1}')
        if [ "$EXPECTED_SHA" != "$ACTUAL_SHA" ]; then
            echo "ERROR: Checksum mismatch! Expected: $EXPECTED_SHA, Got: $ACTUAL_SHA"
            rm -f /home/bcuser/bin/geth
            exit 1
        fi
        echo "Checksum verification passed"
    else
        echo "WARNING: No checksum available in release metadata, skipping verification"
    fi

    chmod +x /home/bcuser/bin/geth
    echo "BSC Geth binary installed"

    # --- Download snapshot ---
    # geth.local = full node with complete state (MPT + snapshot), ~1 TiB
    # geth.none  = fast node with snapshot-only state, ~365 GiB
    local SNAPSHOT_TYPE="${BNB_SNAPSHOT_TYPE:-local}"
    /opt/blueprints/user-data/common/download-snapshot.sh geth "$SNAPSHOT_TYPE" || true

    # --- Download BSC network configuration (config.toml + genesis.json) ---
    # Map the deployment network name to the asset name used in BSC GitHub
    # releases. BSC publishes the Chapel testnet config as "testnet.zip"
    # (there is no "chapel.zip"); mainnet is "mainnet.zip".
    local NETWORK_ASSET
    case "$BC_NETWORK" in
        chapel|testnet) NETWORK_ASSET="testnet" ;;
        mainnet)        NETWORK_ASSET="mainnet" ;;
        *)              NETWORK_ASSET="$BC_NETWORK" ;;
    esac
    echo "Downloading BSC network configuration for $BC_NETWORK (asset: ${NETWORK_ASSET}.zip)..."
    local NETWORK_URL="https://github.com/bnb-chain/bsc/releases/download/${BSC_VERSION}/${NETWORK_ASSET}.zip"
    echo "Downloading from $NETWORK_URL"
    curl -fsSL -o "/tmp/${NETWORK_ASSET}.zip" "$NETWORK_URL"
    apt-get update -qq && apt-get install -y -qq unzip
    unzip -o "/tmp/${NETWORK_ASSET}.zip" -d /tmp/bsc-config-extract/
    find /tmp/bsc-config-extract -name "config.toml" -exec cp {} /home/bcuser/bsc-config/ \;
    find /tmp/bsc-config-extract -name "genesis.json" -exec cp {} /home/bcuser/bsc-config/ \;
    rm -rf /tmp/bsc-config-extract "/tmp/${NETWORK_ASSET}.zip"
    echo "BSC network configuration downloaded"

    # Update config.toml to bind HTTP/WS to internal IP
    local TOKEN
    TOKEN=$(curl -s -X PUT "http://169.254.169.254/latest/api/token" -H "X-aws-ec2-metadata-token-ttl-seconds: 21600")
    local EC2_INTERNAL_IP
    EC2_INTERNAL_IP=$(curl -H "X-aws-ec2-metadata-token: $TOKEN" -s http://169.254.169.254/latest/meta-data/local-ipv4)
    sed -i "s/HTTPHost = .*/HTTPHost = \"${EC2_INTERNAL_IP}\"/" /home/bcuser/bsc-config/config.toml 2>/dev/null || true
    sed -i "s/WSHost = .*/WSHost = \"${EC2_INTERNAL_IP}\"/" /home/bcuser/bsc-config/config.toml 2>/dev/null || true

    # --- Initialize genesis ---
    if [ ! -d /data/geth ]; then
        echo "Initializing BSC genesis..."
        /home/bcuser/bin/geth init --datadir /data /home/bcuser/bsc-config/genesis.json
        echo "Genesis initialized"
    else
        echo "Data directory already exists (from snapshot or prior init), skipping genesis init"
    fi

    echo "BSC Geth ${BSC_VERSION} full node installation complete"
}

# --- Runtime phase: systemd service entrypoint ---
run_node() {
    exec /home/bcuser/bin/geth \
        --config /home/bcuser/bsc-config/config.toml \
        --datadir /data \
        --syncmode=full \
        --cache=8000 \
        --http \
        --http.vhosts=* \
        --http.api=admin,eth,web3,txpool,net,debug,engine \
        --ws \
        --db.engine=pebble \
        --history.transactions=1152000 \
        --history.blocks=1152000 \
        --history.logs.disable=true \
        --tries-verify-mode=local \
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
