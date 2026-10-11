#!/bin/bash
# Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
# SPDX-License-Identifier: Apache-2.0

# Robinhood Chain node initialization (Arbitrum Nitro, Docker Pattern B).
#
# Protocol-level setup only — no client version/flags live here. The Nitro
# image tag and the per-network chain-config/genesis/feed URLs come from the
# configuration marker (/opt/blueprints/configurations/$CLIENT_CONFIG), read
# below as the single source of truth. node.sh branches on BC_NETWORK:
#   mainnet : chainId 4663,  L1 = Ethereum mainnet,  custom genesis, no blob proxy
#   testnet : chainId 46630, L1 = Ethereum Sepolia,  no genesis,     blob proxy on

set -euo pipefail

echo "Starting Robinhood Chain node setup..."

# Source environment variables written by the framework
source /etc/cdk_environment

# --- Validate required variables (fail closed) ---
if [ -z "${BC_NETWORK:-}" ]; then
    echo "ERROR: BC_NETWORK is not set" >&2
    exit 1
fi
if [ -z "${CLIENT_CONFIG:-}" ]; then
    echo "ERROR: CLIENT_CONFIG is not set" >&2
    exit 1
fi
if [ -z "${ROBINHOOD_L1_RPC_URL:-}" ] || [ "${ROBINHOOD_L1_RPC_URL}" = "https://your-ethereum-l1-rpc-url" ]; then
    echo "ERROR: ROBINHOOD_L1_RPC_URL is not set or still has the placeholder value" >&2
    exit 1
fi
if [ -z "${ROBINHOOD_L1_BEACON_URL:-}" ] || [ "${ROBINHOOD_L1_BEACON_URL}" = "https://your-ethereum-l1-beacon-url" ]; then
    echo "ERROR: ROBINHOOD_L1_BEACON_URL is not set or still has the placeholder value" >&2
    exit 1
fi

case "$BC_NETWORK" in
    mainnet|testnet) ;;
    *) echo "ERROR: unsupported BC_NETWORK '$BC_NETWORK' (expected 'mainnet' or 'testnet')" >&2; exit 1 ;;
esac

# Ports (framework-provided with blueprint defaults)
RPC_PORT="${ROBINHOOD_RPC_PORT:-8547}"
WS_PORT="${ROBINHOOD_WS_PORT:-8548}"
METRICS_PORT="${ROBINHOOD_METRICS_PORT:-6070}"

# --- Get EC2 internal IP (RPC/WS/metrics bind here, never 0.0.0.0) ---
TOKEN=$(curl -s -X PUT "http://169.254.169.254/latest/api/token" -H "X-aws-ec2-metadata-token-ttl-seconds: 21600")
EC2_INTERNAL_IP=$(curl -s -H "X-aws-ec2-metadata-token: $TOKEN" http://169.254.169.254/latest/meta-data/local-ipv4)
if [ -z "$EC2_INTERNAL_IP" ]; then
    echo "ERROR: could not resolve EC2 internal IP from IMDS" >&2
    exit 1
fi
echo "EC2 Internal IP: $EC2_INTERNAL_IP"
echo "Network: $BC_NETWORK"
echo "Client Configuration: $CLIENT_CONFIG"

# --- Read the configuration marker (single source of truth) ---
CONFIG_FILE="/opt/blueprints/configurations/${CLIENT_CONFIG}"
if [ ! -f "$CONFIG_FILE" ]; then
    echo "ERROR: configuration marker not found: $CONFIG_FILE" >&2
    exit 1
fi

cfg() {
    # Read a "key: value" scalar from the YAML marker (quotes optional).
    grep -E "^$1:" "$CONFIG_FILE" | head -n1 | sed -E "s/^$1:[[:space:]]*\"?([^\"]+)\"?.*/\1/"
}

NITRO_IMAGE="$(cfg nitro_image)"
HTTP_API="$(cfg http_api)"
WS_API="$(cfg ws_api)"
if [ -z "$NITRO_IMAGE" ] || [ "$NITRO_IMAGE" = "latest" ] || printf '%s' "$NITRO_IMAGE" | grep -q ':latest$'; then
    echo "ERROR: nitro_image must be a pinned immutable tag (got '$NITRO_IMAGE')" >&2
    exit 1
fi

# --- Install Docker if not present (host is Ubuntu 24.04) ---
# Idempotent: skips the apt repo setup when docker is already on PATH, so a
# re-run (or a boot where the AMI already ships docker) is a no-op.
if ! command -v docker &> /dev/null; then
    echo "Installing Docker (Ubuntu)..."
    export DEBIAN_FRONTEND=noninteractive
    apt-get update -y
    apt-get install -y ca-certificates curl
    install -m 0755 -d /etc/apt/keyrings
    if [ ! -f /etc/apt/keyrings/docker.asc ]; then
        curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
        chmod a+r /etc/apt/keyrings/docker.asc
    fi
    echo \
      "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu \
      $(. /etc/os-release && echo "$VERSION_CODENAME") stable" \
      > /etc/apt/sources.list.d/docker.list
    apt-get update -y
    apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
else
    echo "Docker is already installed"
fi
mkdir -p /etc/docker
cat > /etc/docker/daemon.json <<'DOCKER_EOF'
{
  "log-driver": "syslog",
  "log-opts": {
    "syslog-address": "unixgram:///dev/log",
    "tag": "{{.Name}}"
  }
}
DOCKER_EOF
systemctl enable docker
systemctl restart docker

# bcuser owns the data and runs the service
usermod -aG docker bcuser
mkdir -p /data/nitro
chown -R bcuser:bcuser /data /home/bcuser

# --- Download network chain config (+ genesis on mainnet) ---
if [ "$BC_NETWORK" = "mainnet" ]; then
    CHAIN_INFO_URL="$(cfg mainnet_chain_info_url)"
    GENESIS_URL="$(cfg mainnet_genesis_url)"
    FEED_URL="$(cfg mainnet_feed_url)"
    DELAYED_FEED_URL="$(cfg mainnet_delayed_feed_url)"
    SEQUENCER_URL="$(cfg mainnet_sequencer_url)"
else
    CHAIN_INFO_URL="$(cfg testnet_chain_info_url)"
    GENESIS_URL=""
    FEED_URL="$(cfg testnet_feed_url)"
    DELAYED_FEED_URL=""
    SEQUENCER_URL="$(cfg testnet_sequencer_url)"
fi

echo "Downloading chain info from $CHAIN_INFO_URL ..."
curl -fsSL --retry 5 --retry-delay 5 --retry-connrefused -o /data/nitro/chain-info.json "$CHAIN_INFO_URL"

GENESIS_ARG=""
if [ -n "$GENESIS_URL" ]; then
    echo "Downloading genesis from $GENESIS_URL ..."
    curl -fsSL --retry 5 --retry-delay 5 --retry-connrefused -o /data/nitro/genesis.json "$GENESIS_URL"
    GENESIS_ARG="--init.genesis-json-file /data/genesis.json"
fi

# --- Snapshot restore (recommended) ---------------------------------------
# A fresh node that syncs from genesis must read the rollup's genesis assertion
# from historical L1 logs. Pruned/public L1 endpoints do NOT retain that
# history ("pruned history unavailable" -> ASSERTION_NOT_EXIST), so a
# from-genesis sync requires an archive-grade L1 endpoint. Restoring from a
# published pruned-full-node snapshot avoids genesis validation entirely and
# works with an ordinary (free) L1 endpoint.
#
# Set ROBINHOOD_SNAPSHOT_URL to a snapshot from the Arbitrum snapshot explorer:
#   mainnet: https://snapshot-explorer.arbitrum.io/?chain=Robinhood+Chain
#   testnet: https://snapshot-explorer.arbitrum.io/?chain=Robinhood+Chain+Sepolia
# Nitro downloads and initializes from it on first start via --init.url.
# Applied only on a fresh data dir (skipped once the chain db exists).
#
# Use the snapshot DIRECTORY URL with a trailing slash, e.g.
#   https://robinhood-snapshots.offchainlabs.com/robinhood%20chain/2026-10-09-3d32b936/
# Nitro then reads <dir>/.manifest.txt, downloads every part, verifies each
# checksum, joins them and extracts. Snapshots are split into ~500 GB parts
# (mainnet is two: pruned.tar.part0000 + part0001). Pointing --init.url at a
# single part file is a trap: each part has its own .sha256, so Nitro accepts
# part0000 as a complete archive and fails extracting it with "unexpected EOF".
# A part-file URL is therefore rewritten to its directory below.
# Disk: the restore needs ~2x the snapshot size free (parts + joined archive).
INIT_URL_ARG=""
if [ -n "${ROBINHOOD_SNAPSHOT_URL:-}" ] && [ -z "$(find /data/nitro -maxdepth 3 -type d -name l2chaindata 2>/dev/null)" ]; then
    case "${ROBINHOOD_SNAPSHOT_URL}" in
        *.tar.part[0-9][0-9][0-9][0-9])
            ROBINHOOD_SNAPSHOT_URL="${ROBINHOOD_SNAPSHOT_URL%/*}/"
            echo "ROBINHOOD_SNAPSHOT_URL pointed at one snapshot part; using its directory: ${ROBINHOOD_SNAPSHOT_URL}"
            ;;
    esac
    echo "Will restore from snapshot: ${ROBINHOOD_SNAPSHOT_URL}"
    # systemd treats '%' as a specifier in unit files, so a URL-encoded path
    # (e.g. the %20 spaces in the snapshot key) must have '%' escaped to '%%'.
    SNAPSHOT_URL_SYSTEMD=$(printf '%s' "${ROBINHOOD_SNAPSHOT_URL}" | sed 's/%/%%/g')
    INIT_URL_ARG="--init.url=${SNAPSHOT_URL_SYSTEMD}"
fi

# --- Testnet-only: beacon blob proxy (beacon first, Blockscout fallback) ---
# Mainnet talks to its real Ethereum-mainnet beacon directly.
BEACON_URL_FOR_NITRO="$ROBINHOOD_L1_BEACON_URL"
if [ "$BC_NETWORK" = "testnet" ]; then
    echo "Installing testnet beacon blob proxy..."
    install -m 0755 /opt/blueprints/user-data/common/blob-proxy.py /usr/local/bin/blob-proxy.py
    cat > /etc/systemd/system/blob-proxy.service <<'PROXY_EOF'
[Unit]
Description=Robinhood testnet beacon blob proxy
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
Restart=always
RestartSec=5
EnvironmentFile=/etc/cdk_environment
ExecStart=/usr/bin/python3 /usr/local/bin/blob-proxy.py 3500

[Install]
WantedBy=multi-user.target
PROXY_EOF
    systemctl daemon-reload
    systemctl enable blob-proxy.service
    systemctl start blob-proxy.service
    # Nitro reaches the proxy over host networking.
    BEACON_URL_FOR_NITRO="http://127.0.0.1:3500"
fi

chown -R bcuser:bcuser /data

# --- Build the feed args (mainnet runs primary + delayed backup feed) ---
FEED_ARGS="--node.feed.input.url ${FEED_URL}"
if [ -n "$DELAYED_FEED_URL" ]; then
    FEED_ARGS="$FEED_ARGS --node.feed.input.url ${DELAYED_FEED_URL}"
fi

# --- systemd service: name MUST be "node"; container runs the pinned image ---
# RPC/WS/metrics bind to the EC2 internal IP (not 0.0.0.0). P2P is handled by
# Nitro's parent-chain connection; no inbound L2 P2P port is required for a
# non-sequencing full node.
cat > /etc/systemd/system/node.service <<EOF
[Unit]
Description=Robinhood Chain Nitro Node (${BC_NETWORK})
After=docker.service network-online.target
Requires=docker.service
Wants=network-online.target

[Service]
Type=simple
User=bcuser
Group=bcuser
Restart=always
RestartSec=30
TimeoutStartSec=0
EnvironmentFile=/etc/cdk_environment
ExecStartPre=-/usr/bin/docker rm -f robinhood-nitro
ExecStart=/usr/bin/docker run --rm --name robinhood-nitro --network=host \\
  -v /data/nitro:/data \\
  ${NITRO_IMAGE} \\
  --persistent.chain=/data \\
  --persistent.global-config=/data \\
  --chain.info-files=/data/chain-info.json \\
  ${GENESIS_ARG} \\
  ${INIT_URL_ARG} \\
  --parent-chain.connection.url ${ROBINHOOD_L1_RPC_URL} \\
  --parent-chain.blob-client.beacon-url ${BEACON_URL_FOR_NITRO} \\
  --parent-chain.connection.retries 10 \\
  --parent-chain.connection.retry-delay 2s \\
  --parent-chain.connection.retry-errors "429|Too Many Requests|connection reset|EOF|timeout" \\
  --node.inbox-reader.min-blocks-to-read 1 \\
  --node.inbox-reader.default-blocks-to-read 10 \\
  --node.inbox-reader.max-blocks-to-read 20 \\
  --node.inbox-reader.check-delay 2s \\
  ${FEED_ARGS} \\
  --node.staker.enable=false \\
  --execution.forwarding-target ${SEQUENCER_URL} \\
  --http.addr ${EC2_INTERNAL_IP} \\
  --http.port ${RPC_PORT} \\
  --http.vhosts=* \\
  --http.corsdomain=* \\
  --http.api=${HTTP_API} \\
  --http.rpcprefix=/ \\
  --ws.addr ${EC2_INTERNAL_IP} \\
  --ws.port ${WS_PORT} \\
  --ws.api=${WS_API} \\
  --ws.rpcprefix=/ \\
  --metrics \\
  --metrics-server.addr 127.0.0.1 \\
  --metrics-server.port ${METRICS_PORT} \\
  --log-level info
ExecStop=/usr/bin/docker stop robinhood-nitro

[Install]
WantedBy=multi-user.target
EOF

# The container writes chain data under /data (mounted from the host's
# /data/nitro). The nitro image runs as a non-root uid; make it writable.
chmod -R 777 /data/nitro

# Pre-pull the pinned image (with retries) so the service starts promptly
# instead of crash-looping while a cold pull is in flight.
echo "Pulling ${NITRO_IMAGE} ..."
for attempt in 1 2 3 4 5; do
    if docker pull "${NITRO_IMAGE}"; then
        echo "Image pulled"
        break
    fi
    echo "Pull attempt ${attempt} failed; retrying in 15s..."
    sleep 15
done

systemctl daemon-reload
systemctl enable node.service
systemctl start node.service

echo "Robinhood Chain node service started"

# Sentinel for the framework/health tooling
touch /data/init-completed
echo "Robinhood Chain node setup completed successfully"
