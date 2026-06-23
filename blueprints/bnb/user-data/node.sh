#!/bin/bash
# Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
# SPDX-License-Identifier: Apache-2.0

# BNB Smart Chain Node Initialization Script
# Handles protocol-level setup (directories, users) and delegates all
# client-specific work (binary download, snapshot, genesis init, runtime flags)
# to the configuration script specified by CLIENT_CONFIG.
#
# The configuration script (e.g. bsc-geth-v1.7.2-full.sh) is called with:
#   "install" — during setup (this script) to download binaries, snapshot, and init
#   no args   — at runtime (systemd entrypoint) to exec the node process

set -eo pipefail

echo "Starting BNB Smart Chain node setup..."

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

# Verify configuration script exists
CONFIG_SCRIPT="/opt/blueprints/configurations/${CLIENT_CONFIG}"
if [ ! -f "$CONFIG_SCRIPT" ]; then
    echo "ERROR: Configuration script not found: $CONFIG_SCRIPT"
    echo "Available configurations:"
    ls -la /opt/blueprints/configurations/ || echo "Configurations directory not found"
    exit 1
fi

echo "Network: $BC_NETWORK"
echo "Client Configuration: $CLIENT_CONFIG"

# Create directory structure
mkdir -p /data
mkdir -p /home/bcuser/bin
mkdir -p /home/bcuser/bsc-config

# Run client install phase (binary download, snapshot, network config, genesis init)
echo "Running client installation: $CLIENT_CONFIG install"
chmod +x "$CONFIG_SCRIPT"
"$CONFIG_SCRIPT" install

# Set ownership
chown -R bcuser:bcuser /data
chown -R bcuser:bcuser /home/bcuser
chmod -R 755 /home/bcuser

echo "Directories created and ownership set to bcuser"

# Install configuration script as the systemd service entrypoint
cp "$CONFIG_SCRIPT" /home/bcuser/bin/start-node.sh
chmod +x /home/bcuser/bin/start-node.sh
chown bcuser:bcuser /home/bcuser/bin/start-node.sh
echo "Configuration script installed: $CLIENT_CONFIG"

# Create systemd service
cat > /etc/systemd/system/node.service <<EOF
[Unit]
Description=BNB Smart Chain Node Service
After=network-online.target

[Service]
Type=simple
Restart=always
RestartSec=30
User=bcuser
Group=bcuser
Environment="PATH=/bin:/usr/bin:/home/bcuser/bin"
EnvironmentFile=/etc/cdk_environment
ExecStart=/home/bcuser/bin/start-node.sh

[Install]
WantedBy=multi-user.target
EOF

# Enable and start the node service
systemctl daemon-reload
systemctl enable node.service
systemctl start node.service

echo "BNB Smart Chain node service started"

# Wait for process to start
echo "Waiting for node to start..."
sleep 10

# Check if service is running
if systemctl is-active --quiet node.service; then
    echo "BSC geth service is running"
else
    echo "WARNING: BSC geth service is not running"
    journalctl -u node.service --no-pager -n 20
fi

# Mark initialization as complete
touch /data/init-completed

echo "BNB Smart Chain node setup completed successfully"
