#!/bin/bash
# Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
# SPDX-License-Identifier: Apache-2.0

# Arc node initialization (Docker Pattern B).
#
# Protocol-level setup only. Client images and runtime flags live in the
# docker-compose configuration (/opt/blueprints/configurations/$CLIENT_CONFIG).
# This script fills in the per-network values (chain name, relay endpoints,
# transaction forwarder), prepares /data/arc, and installs the "node" service.
#
# Arc cannot sync from genesis: every node bootstraps from a Circle-published
# snapshot (https://snapshots.arc.network). The restore and the one-time CL key
# init run in user-data/common/prepare-arc.sh as the node service's
# ExecStartPre, so cloud-init finishes quickly and a reboot never re-downloads.

set -euo pipefail

echo "Starting Arc node setup..."

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

# --- Per-network defaults (https://docs.arc.io/arc/references/node-requirements) ---
# Relay endpoints are Circle's public, keyless follow endpoints. Override with
# ARC_FOLLOW_ENDPOINTS (space-separated "https://host,wss=host" entries) and
# ARC_RPC_FORWARDER if needed.
case "$BC_NETWORK" in
    mainnet)
        ARC_CHAIN="arc-mainnet"
        DEFAULT_FORWARDER="https://rpc.mainnet.arc.io/"
        DEFAULT_FOLLOW="https://rpc.mainnet.arc.io,wss=rpc.mainnet.arc.io https://rpc.drpc.mainnet.arc.io,wss=rpc.drpc.mainnet.arc.io https://rpc.blockdaemon.mainnet.arc.io,wss=rpc.blockdaemon.mainnet.arc.io/websocket https://rpc.quicknode.mainnet.arc.io,wss=rpc.quicknode.mainnet.arc.io"
        ;;
    testnet)
        ARC_CHAIN="arc-testnet"
        DEFAULT_FORWARDER="https://rpc.testnet.arc.io/"
        DEFAULT_FOLLOW="https://rpc.testnet.arc.io,wss=rpc.testnet.arc.io https://rpc.drpc.testnet.arc.io,wss=rpc.drpc.testnet.arc.io https://rpc.blockdaemon.testnet.arc.io,wss=rpc.blockdaemon.testnet.arc.io/websocket"
        ;;
    *)
        echo "ERROR: unsupported BC_NETWORK '$BC_NETWORK' (expected 'mainnet' or 'testnet')" >&2
        exit 1
        ;;
esac
ARC_RPC_FORWARDER="${ARC_RPC_FORWARDER:-$DEFAULT_FORWARDER}"
ARC_FOLLOW_ENDPOINTS="${ARC_FOLLOW_ENDPOINTS:-$DEFAULT_FOLLOW}"
ARC_RPC_PORT="${ARC_RPC_PORT:-8545}"
ARC_WS_PORT="${ARC_WS_PORT:-8546}"

# --- EC2 internal IP (RPC/WS bind here, never 0.0.0.0) ---
TOKEN=$(curl -s -X PUT "http://169.254.169.254/latest/api/token" -H "X-aws-ec2-metadata-token-ttl-seconds: 21600")
EC2_INTERNAL_IP=$(curl -s -H "X-aws-ec2-metadata-token: $TOKEN" http://169.254.169.254/latest/meta-data/local-ipv4)
if [ -z "$EC2_INTERNAL_IP" ]; then
    echo "ERROR: could not resolve EC2 internal IP from IMDS" >&2
    exit 1
fi
echo "EC2 Internal IP: $EC2_INTERNAL_IP"
echo "Network: $BC_NETWORK ($ARC_CHAIN)"
echo "Client Configuration: $CLIENT_CONFIG"

CONFIG_FILE="/opt/blueprints/configurations/${CLIENT_CONFIG}"
if [ ! -f "$CONFIG_FILE" ]; then
    echo "ERROR: configuration not found: $CONFIG_FILE" >&2
    exit 1
fi

# --- Install Docker if not present (host is Ubuntu 24.04) ---
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
usermod -aG docker bcuser

# --- Data layout ---
# The Arc containers run as bcuser (1002), not the images' built-in "arc"
# user (uid 999), because uid 999 is taken by the CloudWatch agent's cwagent
# user on these hosts. bcuser owns the data and the shared IPC socket dir.
mkdir -p /data/arc/execution /data/arc/consensus /data/arc/run /home/bcuser/arc-node
chown -R bcuser:bcuser /data/arc
chown bcuser:bcuser /data /home/bcuser /home/bcuser/arc-node

# --- Render the compose file ---
COMPOSE=/home/bcuser/arc-node/docker-compose.yml
cp "$CONFIG_FILE" "$COMPOSE"

FOLLOW_LINES=""
for ep in $ARC_FOLLOW_ENDPOINTS; do
    FOLLOW_LINES="${FOLLOW_LINES}            - --follow.endpoint=${ep}\n"
done
# Replace the whole "- ${ARC_FOLLOW_ENDPOINTS}" placeholder item (keeps YAML
# indentation exact; the item form keeps the template itself valid YAML).
sed -i "s|^[[:space:]]*- \${ARC_FOLLOW_ENDPOINTS}\$|${FOLLOW_LINES%\\n}|" "$COMPOSE"
sed -i "s|\${ARC_CHAIN}|${ARC_CHAIN}|g; s|\${ARC_RPC_FORWARDER}|${ARC_RPC_FORWARDER}|g; s|\${EC2_INTERNAL_IP}|${EC2_INTERNAL_IP}|g; s|\${ARC_RPC_PORT}|${ARC_RPC_PORT}|g; s|\${ARC_WS_PORT}|${ARC_WS_PORT}|g" "$COMPOSE"
if grep -qE '^[^#]*\$\{' "$COMPOSE"; then
    echo "ERROR: unsubstituted placeholders left in $COMPOSE:" >&2
    grep -nE '^[^#]*\$\{' "$COMPOSE" >&2
    exit 1
fi
if ! docker compose -f "$COMPOSE" config -q; then
    echo "ERROR: rendered compose file is invalid" >&2
    exit 1
fi
chown bcuser:bcuser "$COMPOSE"

# Images come from the compose file (single source of truth for versions).
EL_IMAGE=$(docker compose -f "$COMPOSE" config --images | grep arc-execution | head -n1)
CL_IMAGE=$(docker compose -f "$COMPOSE" config --images | grep arc-consensus | head -n1)
for img in "$EL_IMAGE" "$CL_IMAGE"; do
    if [ -z "$img" ] || printf '%s' "$img" | grep -qE ':latest$|^[^:]+$'; then
        echo "ERROR: Arc images must be pinned tags (got '$img')" >&2
        exit 1
    fi
done

cat > /home/bcuser/arc-node/arc.env <<EOF
ARC_CHAIN=${ARC_CHAIN}
ARC_EL_IMAGE=${EL_IMAGE}
ARC_CL_IMAGE=${CL_IMAGE}
EOF
install -m 0755 /opt/blueprints/user-data/common/prepare-arc.sh /home/bcuser/arc-node/prepare-arc.sh
chown bcuser:bcuser /home/bcuser/arc-node/arc.env /home/bcuser/arc-node/prepare-arc.sh

# Pre-pull images (with retries) so the service does not fail on a cold pull.
for img in "$EL_IMAGE" "$CL_IMAGE"; do
    for attempt in 1 2 3 4 5; do
        if docker pull "$img"; then break; fi
        echo "Pull of $img failed (attempt $attempt); retrying in 15s..."
        sleep 15
    done
done

# --- systemd service: name MUST be "node" ---
# ExecStartPre restores the snapshot once (can take an hour or more on
# testnet), hence TimeoutStartSec=0.
cat > /etc/systemd/system/node.service <<EOF
[Unit]
Description=Arc Node (${ARC_CHAIN})
After=docker.service network-online.target
Requires=docker.service
Wants=network-online.target

[Service]
Type=oneshot
RemainAfterExit=yes
User=bcuser
Group=bcuser
WorkingDirectory=/home/bcuser/arc-node
EnvironmentFile=/etc/cdk_environment
EnvironmentFile=/home/bcuser/arc-node/arc.env
TimeoutStartSec=0
ExecStartPre=/home/bcuser/arc-node/prepare-arc.sh
ExecStart=/usr/bin/docker compose -f ${COMPOSE} up -d
ExecStop=/usr/bin/docker compose -f ${COMPOSE} down
Restart=on-failure
RestartSec=60

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable node.service
# --no-block: the first start runs the snapshot restore; don't hold cloud-init.
systemctl start --no-block node.service

echo "Arc node service started (snapshot restore runs in the node service on first start)"
touch /data/init-completed
echo "Arc node setup completed successfully"
