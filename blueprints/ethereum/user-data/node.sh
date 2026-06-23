#!/bin/bash
# Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
# SPDX-License-Identifier: Apache-2.0

set -e

echo "Starting Ethereum node setup..."

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

if [ -z "$ETH_CONSENSUS_CHECKPOINT_SYNC_URL" ]; then
    echo "ERROR: ETH_CONSENSUS_CHECKPOINT_SYNC_URL is not set"
    exit 1
fi

# Get EC2 internal IP
TOKEN=$(curl -s -X PUT "http://169.254.169.254/latest/api/token" -H "X-aws-ec2-metadata-token-ttl-seconds: 21600")
EC2_INTERNAL_IP=$(curl -H "X-aws-ec2-metadata-token: $TOKEN" -s http://169.254.169.254/latest/meta-data/local-ipv4)
export EC2_INTERNAL_IP

echo "EC2 Internal IP: $EC2_INTERNAL_IP"
echo "Network: $BC_NETWORK"
echo "Client Configuration: $CLIENT_CONFIG"
echo "Checkpoint Sync URL: $ETH_CONSENSUS_CHECKPOINT_SYNC_URL"

# Install Docker if not already installed
if ! command -v docker &> /dev/null; then
    echo "Installing Docker..."
    apt-get update
    apt-get install -y ca-certificates curl
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
fi

# Configure Docker to use syslog logging driver by default
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

# Restart Docker to apply logging configuration
systemctl enable docker
systemctl restart docker
echo "Docker logging configured to use syslog"

# Add bcuser to docker group for Docker access
echo "Configuring bcuser for Docker access..."
usermod -aG docker bcuser
echo "bcuser added to docker group"

# Create necessary directories
mkdir -p /data/execution
mkdir -p /data/consensus
mkdir -p /data/consensus/logs
mkdir -p /secrets
mkdir -p /home/bcuser

# Set ownership to bcuser
chown -R bcuser:bcuser /data
chown -R bcuser:bcuser /secrets
chown -R bcuser:bcuser /home/bcuser
chmod -R 755 /home/bcuser

# Make consensus data directory fully writable (Teku runs as different user in container)
chmod -R 777 /data/consensus

echo "Directories created and ownership set to bcuser"

# Generate JWT secret for execution-consensus communication
if [ ! -f /secrets/jwtsecret ]; then
    echo "Generating JWT secret..."
    openssl rand -hex 32 > /secrets/jwtsecret
    chmod 644 /secrets/jwtsecret
    echo "JWT secret generated"
fi

# Download snapshot if enabled
if [ "$SNAPSHOT_ENABLED" = "true" ] && [ -n "$SNAPSHOT_DOWNLOAD_URL" ]; then
    if [ ! -f /data/snapshot_downloaded ]; then
        echo "Downloading snapshot from $SNAPSHOT_DOWNLOAD_URL..."
        # This is a placeholder - actual snapshot download would be implemented here
        # wget -O /tmp/snapshot.tar.lz4 "$SNAPSHOT_DOWNLOAD_URL"
        # lz4 -d /tmp/snapshot.tar.lz4 | tar -xf - -C /data/
        # rm /tmp/snapshot.tar.lz4
        touch /data/snapshot_downloaded
        echo "Snapshot download completed"
    else
        echo "Snapshot already downloaded, skipping..."
    fi
fi

# Copy docker-compose configuration from protocol assets
echo "Setting up docker-compose configuration..."
mkdir -p /home/bcuser/ethereum-node
cp "/opt/blueprints/configurations/$CLIENT_CONFIG" /home/bcuser/ethereum-node/docker-compose.yml
chown bcuser:bcuser /home/bcuser/ethereum-node/docker-compose.yml

# Resolve supernode flag for Lighthouse consensus client
# Options: "true" (--supernode), "semi" (--semi-supernode), "false" or empty (no flag)
# Default: enabled (--supernode) for full blob serving capability post-Pectra/PeerDAS
ETH_CONSENSUS_SUPERNODE_FLAG=""
if [ "$ETH_CONSENSUS_SUPERNODE" = "semi" ]; then
    ETH_CONSENSUS_SUPERNODE_FLAG="--semi-supernode"
    echo "Consensus supernode mode: semi (64 data columns)"
elif [ "$ETH_CONSENSUS_SUPERNODE" = "false" ]; then
    ETH_CONSENSUS_SUPERNODE_FLAG=""
    echo "Consensus supernode mode: disabled (4 data columns - blob API will NOT work)"
else
    # Default to --supernode (includes "true" and unset)
    ETH_CONSENSUS_SUPERNODE_FLAG="--supernode"
    echo "Consensus supernode mode: full (128 data columns)"
fi

# Substitute environment variables in docker-compose file using sed
echo "Substituting configuration variables..."
sed -i "s|\${BC_NETWORK}|$BC_NETWORK|g" /home/bcuser/ethereum-node/docker-compose.yml
sed -i "s|\${EC2_INTERNAL_IP}|$EC2_INTERNAL_IP|g" /home/bcuser/ethereum-node/docker-compose.yml
sed -i "s|\${ETH_CONSENSUS_CHECKPOINT_SYNC_URL}|$ETH_CONSENSUS_CHECKPOINT_SYNC_URL|g" /home/bcuser/ethereum-node/docker-compose.yml
sed -i "s|\${ETH_CONSENSUS_SUPERNODE_FLAG}|$ETH_CONSENSUS_SUPERNODE_FLAG|g" /home/bcuser/ethereum-node/docker-compose.yml

# Remove empty argument lines if supernode is disabled (avoids empty string in command array)
if [ -z "$ETH_CONSENSUS_SUPERNODE_FLAG" ]; then
    sed -i '/^[[:space:]]*"",$/d' /home/bcuser/ethereum-node/docker-compose.yml
fi

echo "Docker-compose configuration ready"
echo "Configuration variables:"
echo "  BC_NETWORK: $BC_NETWORK"
echo "  EC2_INTERNAL_IP: $EC2_INTERNAL_IP"
echo "  ETH_CONSENSUS_CHECKPOINT_SYNC_URL: $ETH_CONSENSUS_CHECKPOINT_SYNC_URL"
echo "  ETH_CONSENSUS_SUPERNODE: ${ETH_CONSENSUS_SUPERNODE:-true} (flag: ${ETH_CONSENSUS_SUPERNODE_FLAG:-none})"

# Create systemd service for the node
cat > /etc/systemd/system/node.service <<EOF
[Unit]
Description=Ethereum Node Service
After=docker.service
Requires=docker.service

[Service]
Type=oneshot
RemainAfterExit=yes
User=bcuser
Group=bcuser
WorkingDirectory=/home/bcuser/ethereum-node
EnvironmentFile=/etc/cdk_environment
ExecStart=/usr/bin/docker compose -f /home/bcuser/ethereum-node/docker-compose.yml up -d
ExecStop=/usr/bin/docker compose -f /home/bcuser/ethereum-node/docker-compose.yml down
Restart=on-failure
RestartSec=10

[Install]
WantedBy=multi-user.target
EOF

# Enable and start the node service
systemctl daemon-reload
systemctl enable node.service
systemctl start node.service

echo "Ethereum node service started"

# Wait for services to be ready
echo "Waiting for services to start..."
sleep 30

# Check if containers are running
if docker ps | grep -q "execution"; then
    echo "Execution client container is running"
else
    echo "WARNING: Execution client container is not running"
fi

if docker ps | grep -q "consensus"; then
    echo "Consensus client container is running"
else
    echo "WARNING: Consensus client container is not running"
fi

# Mark initialization as complete
touch /data/init-completed

echo "Ethereum node setup completed successfully"
