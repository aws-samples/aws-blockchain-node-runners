#!/bin/bash
# Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
# SPDX-License-Identifier: Apache-2.0

set -e

echo "Starting Base node setup..."

# Source environment variables
source /etc/cdk_environment

# Validate required variables
if [ -z "$BC_NETWORK" ]; then
    echo "ERROR: BC_NETWORK is not set"
    exit 1
fi

if [ -z "$CLIENT_CONFIG" ]; then
    echo "ERROR: CLIENT_CONFIG is not set"
    exit 1
fi

if [ -z "$BASE_L1_RPC_URL" ] || [ "$BASE_L1_RPC_URL" = "https://your-ethereum-l1-rpc-url" ]; then
    echo "ERROR: BASE_L1_RPC_URL is not set or still has placeholder value"
    exit 1
fi

if [ -z "$BASE_L1_BEACON_URL" ] || [ "$BASE_L1_BEACON_URL" = "https://your-ethereum-beacon-url" ]; then
    echo "ERROR: BASE_L1_BEACON_URL is not set or still has placeholder value"
    exit 1
fi

# Get EC2 internal IP
TOKEN=$(curl -s -X PUT "http://169.254.169.254/latest/api/token" -H "X-aws-ec2-metadata-token-ttl-seconds: 21600")
EC2_INTERNAL_IP=$(curl -H "X-aws-ec2-metadata-token: $TOKEN" -s http://169.254.169.254/latest/meta-data/local-ipv4)
export EC2_INTERNAL_IP

echo "EC2 Internal IP: $EC2_INTERNAL_IP"
echo "Network: $BC_NETWORK"
echo "Client Configuration: $CLIENT_CONFIG"

# Detect execution client from configuration filename
if echo "$CLIENT_CONFIG" | grep -q "op-geth"; then
    CLIENT="geth"
    echo "Execution client: geth (base-geth-node)"
elif echo "$CLIENT_CONFIG" | grep -q "nethermind"; then
    CLIENT="nethermind"
    echo "Execution client: nethermind"
else
    CLIENT="reth"
    echo "Execution client: reth (base-reth-node)"
fi

# Install Docker and git if not already installed
if ! command -v docker &> /dev/null; then
    echo "Installing Docker..."
    apt-get update
    apt-get install -y ca-certificates curl git
    install -m 0755 -d /etc/apt/keyrings
    curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
    chmod a+r /etc/apt/keyrings/docker.asc

    echo \
      "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu \
      $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | \
      tee /etc/apt/sources.list.d/docker.list > /dev/null

    apt-get update
    apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

    echo "Docker installed successfully"
else
    echo "Docker is already installed"
    # Ensure git is available even if Docker was pre-installed
    apt-get install -y -qq git 2>/dev/null || true
fi

# Configure Docker to use syslog logging driver
echo "Configuring Docker logging to syslog..."
mkdir -p /etc/docker
cat > /etc/docker/daemon.json <<DOCKER_EOF
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
echo "Docker logging configured to use syslog"

# Add bcuser to docker group
echo "Configuring bcuser for Docker access..."
usermod -aG docker bcuser
echo "bcuser added to docker group"

# Create directory structure
mkdir -p /data
mkdir -p /home/bcuser

# Set ownership to bcuser
chown -R bcuser:bcuser /data
chown -R bcuser:bcuser /home/bcuser
chmod -R 755 /home/bcuser

echo "Directories created and ownership set to bcuser"

# --- Snapshot restoration ---
# Delegates to the shared download-snapshot.sh helper (same pattern as BNB blueprint).
# Downloads and extracts directly on /data (the large mounted volume) to avoid filling /tmp.
# See https://docs.base.org/base-chain/node-operators/snapshots
chmod +x /opt/blueprints/user-data/common/download-snapshot.sh
/opt/blueprints/user-data/common/download-snapshot.sh "$CLIENT" || true

# Ensure correct ownership after snapshot restoration
chown -R bcuser:bcuser /data

# =====================================================================
# Universal setup: clone base/node repo and build from source
#
# Both op-geth and reth use the official https://github.com/base/node
# repository. The repo contains Dockerfiles that compile the execution
# client and op-node from source, producing a single image managed by
# supervisord. The CLIENT env var selects which Dockerfile to use.
#
# This avoids pulling pre-built images from restricted registries.
# =====================================================================

BASE_NODE_DIR="/home/bcuser/base-node"

echo "Cloning base/node repository..."

# Resolve the pinned base/node repo + tag from the configuration file (single
# source of truth — see blueprints/base/configurations/*.yml). Pinning to a
# release tag avoids building from a moving "main" branch as root at boot.
CONFIG_FILE="/opt/blueprints/configurations/${CLIENT_CONFIG}"
BASE_NODE_REPO=$(grep -E '^base_node_repo:' "$CONFIG_FILE" | sed -E 's/^base_node_repo:[[:space:]]*"?([^"]+)"?.*/\1/')
BASE_NODE_REF=$(grep -E '^base_node_tag:' "$CONFIG_FILE" | sed -E 's/^base_node_tag:[[:space:]]*"?([^"]+)"?.*/\1/')

if [ -z "$BASE_NODE_REPO" ] || [ -z "$BASE_NODE_REF" ]; then
    echo "ERROR: base_node_repo / base_node_tag not found in $CONFIG_FILE" >&2
    exit 1
fi

# Reject a moving branch — the ref must be a pinned release tag (or commit SHA).
if [ "$BASE_NODE_REF" = "main" ] || [ "$BASE_NODE_REF" = "master" ] || [ "$BASE_NODE_REF" = "HEAD" ]; then
    echo "ERROR: base_node_tag is '$BASE_NODE_REF' — refusing to build from a moving branch. Pin a release tag." >&2
    exit 1
fi

echo "Cloning $BASE_NODE_REPO at pinned ref '$BASE_NODE_REF'..."
git clone --depth 1 --branch "$BASE_NODE_REF" "$BASE_NODE_REPO" "$BASE_NODE_DIR"

# Log the exact commit the pinned ref resolved to, for auditability.
BASE_NODE_COMMIT=$(git -C "$BASE_NODE_DIR" rev-parse HEAD)
echo "base/node checked out at $BASE_NODE_REF ($BASE_NODE_COMMIT)"

chown -R bcuser:bcuser "$BASE_NODE_DIR"

# --- Fix: P2P NAT advertisement for EC2 ---
# The upstream entrypoints don't configure NAT, so the execution client
# advertises 127.0.0.1 (Docker bridge) instead of the instance's real IP.
# This prevents external peers from connecting, causing 0 peers and no sync.
# Patch each client's entrypoint to advertise the EC2 public IP.
# Must be done before `docker compose build` so the patch is baked into the image.
# See: https://docs.base.org/base-chain/node-operators/troubleshooting
#   "If behind NAT, configure the --nat=extip:<your-ip> flag"

# Refresh IMDSv2 token — the original token (fetched at script start) may have
# expired during the snapshot download which can take 20-30+ hours for mainnet,
# exceeding the 6-hour token TTL.
TOKEN=$(curl -s -X PUT "http://169.254.169.254/latest/api/token" -H "X-aws-ec2-metadata-token-ttl-seconds: 21600")
EC2_PUBLIC_IP=$(curl -s -H "X-aws-ec2-metadata-token: $TOKEN" http://169.254.169.254/latest/meta-data/public-ipv4)

# Fail fast if public IP could not be retrieved — without a valid IP the
# --nat extip: flag will crash the execution client on startup.
if [ -z "$EC2_PUBLIC_IP" ]; then
    echo "ERROR: Failed to retrieve EC2 public IP from instance metadata. Cannot configure --nat." >&2
    echo "This may indicate the IMDSv2 token expired or the instance has no public IP assigned." >&2
    exit 1
fi

echo "EC2 public IP for P2P NAT: $EC2_PUBLIC_IP"

# Patch the execution client entrypoint to advertise the instance's public IP
# for P2P (NAT). Without this the client advertises 127.0.0.1 (Docker bridge),
# external peers cannot connect, and the node gets 0 peers / no sync.
# base/node v1.1.1 ships a single flat "execution-entrypoint" (base-reth-node)
# that initializes ADDITIONAL_ARGS="" and appends it to the reth command line,
# so we inject reth's `--nat extip:<ip>` flag there. Must run before
# `docker compose build` so the patch is baked into the image.
# See: https://docs.base.org/base-chain/node-operators/troubleshooting
EXECUTION_ENTRYPOINT="$BASE_NODE_DIR/execution-entrypoint"
if [ ! -f "$EXECUTION_ENTRYPOINT" ]; then
    echo "ERROR: $EXECUTION_ENTRYPOINT not found — the base/node repo layout may have changed for ref '$BASE_NODE_REF'." >&2
    exit 1
fi

# Handle both upstream formats: empty, or flag present with IP missing.
sed -i "s|ADDITIONAL_ARGS=\"--nat extip:\"|ADDITIONAL_ARGS=\"--nat extip:${EC2_PUBLIC_IP}\"|" \
    "$EXECUTION_ENTRYPOINT"
sed -i "s|^ADDITIONAL_ARGS=\"\"|ADDITIONAL_ARGS=\"--nat extip:${EC2_PUBLIC_IP}\"|" \
    "$EXECUTION_ENTRYPOINT"

# Verify the patch actually applied
if ! grep -q "extip:${EC2_PUBLIC_IP}" "$EXECUTION_ENTRYPOINT"; then
    echo "ERROR: Failed to patch execution-entrypoint with NAT IP. Aborting." >&2
    exit 1
fi
echo "Patched execution-entrypoint with --nat extip:${EC2_PUBLIC_IP}"

# Select the network .env file
if [ "$BC_NETWORK" = "base-mainnet" ]; then
    NETWORK_ENV_FILE=".env.mainnet"
else
    NETWORK_ENV_FILE=".env.sepolia"
fi

# Inject user-provided L1 endpoints into the network .env file. base/node
# v1.1.1 uses BASE_NODE_L1_ETH_RPC / BASE_NODE_L1_BEACON, consumed by
# base-consensus (the "node" compose service runs consensus-entrypoint, which
# is already the default consensus client post-Azul — no toggle required).
echo "Configuring L1 endpoints in $NETWORK_ENV_FILE..."
sed -i "s|BASE_NODE_L1_ETH_RPC=.*|BASE_NODE_L1_ETH_RPC=${BASE_L1_RPC_URL}|g"  "$BASE_NODE_DIR/$NETWORK_ENV_FILE"
sed -i "s|BASE_NODE_L1_BEACON=.*|BASE_NODE_L1_BEACON=${BASE_L1_BEACON_URL}|g"  "$BASE_NODE_DIR/$NETWORK_ENV_FILE"

# Verify the placeholders were actually replaced (fail closed if the var names
# changed upstream, so we don't silently start with a bad L1 endpoint).
if ! grep -q "^BASE_NODE_L1_ETH_RPC=${BASE_L1_RPC_URL}$" "$BASE_NODE_DIR/$NETWORK_ENV_FILE"; then
    echo "ERROR: BASE_NODE_L1_ETH_RPC was not set in $NETWORK_ENV_FILE (var name may have changed upstream)." >&2
    exit 1
fi
echo "L1 endpoints configured"

# Point docker-compose at /data (the large mounted volume) and the right
# network env file. base/node reads HOST_DATA_DIR and NETWORK_ENV from .env.
sed -i "s|^HOST_DATA_DIR=.*|HOST_DATA_DIR=/data|g" "$BASE_NODE_DIR/.env"
if ! grep -q "^HOST_DATA_DIR=" "$BASE_NODE_DIR/.env"; then
    echo "HOST_DATA_DIR=/data" >> "$BASE_NODE_DIR/.env"
fi
if grep -q "^NETWORK_ENV=" "$BASE_NODE_DIR/.env"; then
    sed -i "s|^NETWORK_ENV=.*|NETWORK_ENV=${NETWORK_ENV_FILE}|g" "$BASE_NODE_DIR/.env"
else
    echo "NETWORK_ENV=${NETWORK_ENV_FILE}" >> "$BASE_NODE_DIR/.env"
fi

# Build the Docker image from source
echo "Building ${CLIENT} Docker image from source (this may take 30-60 minutes)..."
cd "$BASE_NODE_DIR"
docker compose build

echo "Docker image built successfully"

# Create systemd service using the upstream docker-compose.yml
cat > /etc/systemd/system/node.service <<EOF
[Unit]
Description=Base Node Service (${CLIENT})
After=docker.service
Requires=docker.service

[Service]
Type=oneshot
RemainAfterExit=yes
User=bcuser
Group=bcuser
WorkingDirectory=${BASE_NODE_DIR}
ExecStart=/usr/bin/docker compose up -d
ExecStop=/usr/bin/docker compose down
Restart=on-failure
RestartSec=10

[Install]
WantedBy=multi-user.target
EOF

# Enable and start the node service
systemctl daemon-reload
systemctl enable node.service
systemctl start node.service

echo "Base node service started"

# Wait for containers to start
echo "Waiting for containers to start..."
sleep 30

# Check if containers are running
# The upstream docker-compose.yml creates two containers: "execution" and "node".
# Both use the same image; "execution" runs execution-entrypoint (base-reth-node),
# "node" runs consensus-entrypoint (base-consensus).
if docker ps --format '{{.Names}}' | grep -q "execution"; then
    echo "Execution client (${CLIENT}) container is running"
else
    echo "WARNING: Execution client container is not running"
    docker ps -a --format '{{.Names}} {{.Status}}' || true
fi

if docker ps --format '{{.Names}}' | grep -q "node"; then
    echo "Consensus (base-consensus) container is running"
else
    echo "WARNING: Consensus container is not running"
    docker ps -a --format '{{.Names}} {{.Status}}' || true
fi

# Mark initialization as complete
touch /data/init-completed

echo "Base node setup completed successfully"
