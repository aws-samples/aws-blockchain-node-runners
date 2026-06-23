#!/bin/bash
# Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
# SPDX-License-Identifier: Apache-2.0

# Dummy Protocol - Base Configuration
# This script sets up a basic dummy node for testing purposes

set -euo pipefail

echo "Applying dummy-base configuration..."

# Load environment variables
source /etc/cdk_environment 2>/dev/null || true

# Get instance metadata
TOKEN=$(curl -s -X PUT "http://169.254.169.254/latest/api/token" -H "X-aws-ec2-metadata-token-ttl-seconds: 21600" 2>/dev/null || echo "")
if [ -n "$TOKEN" ]; then
    INSTANCE_ID=$(curl -H "X-aws-ec2-metadata-token: $TOKEN" -s http://169.254.169.254/latest/meta-data/instance-id 2>/dev/null || echo "i-unknown")
    EC2_INTERNAL_IP=$(curl -H "X-aws-ec2-metadata-token: $TOKEN" -s http://169.254.169.254/latest/meta-data/local-ipv4 2>/dev/null || echo "127.0.0.1")
else
    INSTANCE_ID="i-unknown"
    EC2_INTERNAL_IP="127.0.0.1"
fi

# Setup data directory
DATA_DIR="/data"
if [ ! -d "$DATA_DIR" ]; then
    echo "Warning: Data directory not found, using /tmp"
    DATA_DIR="/tmp/dummy-data"
fi

mkdir -p "$DATA_DIR/blockchain"
mkdir -p "$DATA_DIR/logs"
mkdir -p "$DATA_DIR/data"

# Download snapshot if enabled
if [ "${SNAPSHOT_ENABLED:-false}" = "true" ] && [ -n "${SNAPSHOT_DOWNLOAD_URL:-}" ]; then
    echo "Downloading snapshot from $SNAPSHOT_DOWNLOAD_URL"
    # Simulate snapshot download for testing
    echo "Simulating snapshot download (test mode)..."
    sleep 2
    echo "Snapshot download simulation complete"
fi

# Create mock node state file
STATE_FILE="$DATA_DIR/blockchain/state.json"
cat > "$STATE_FILE" << EOF
{
    "node_id": "$INSTANCE_ID",
    "protocol": "dummy",
    "network": "${BC_NETWORK:-testnet}",
    "configuration": "${CLIENT_CONFIG:-dummy-base.sh}",
    "version": "${CLIENT_VERSION:-v1.0.0}",
    "started_at": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
    "status": "running",
    "config_type": "base"
}
EOF

echo "Node state file created: $STATE_FILE"

# Create health check endpoint script
HEALTH_SCRIPT="/opt/dummy-health-check.sh"
cat > "$HEALTH_SCRIPT" << 'HEALTH_EOF'
#!/bin/bash
echo "HTTP/1.1 200 OK"
echo "Content-Type: application/json"
echo ""
echo '{"status":"healthy","protocol":"dummy","config":"base"}'
HEALTH_EOF
chmod +x "$HEALTH_SCRIPT"

# Start simple HTTP health check server (using netcat if available)
# Note: For production protocols, RPC should bind to $EC2_INTERNAL_IP for security
# Dummy uses simplified approach for testing purposes
if command -v nc &> /dev/null; then
    port="${HA_ALB_HEALTHCHECK_PORT:-8545}"
    echo "Starting health check server on $EC2_INTERNAL_IP:$port"
    while true; do
        echo -e "HTTP/1.1 200 OK\r\nContent-Type: application/json\r\n\r\n{\"status\":\"healthy\",\"protocol\":\"dummy\",\"config\":\"base\"}" | nc -l -p "$port" -q 1 2>/dev/null || sleep 1
    done &
    HEALTH_PID=$!
    echo "Health check server started with PID: $HEALTH_PID"
fi

# Start state update loop
echo "Starting state update loop (interval: 60s)"
METRICS_INTERVAL=60
c1_block_height=1000000
c1_blocks_behind=50  # Start with node behind

# Mark initial sync as complete after first metrics cycle
INIT_COMPLETED_FILE="$DATA_DIR/data/init-completed"

while true; do
    # Simulate block height increase
    c1_block_height=$((c1_block_height + RANDOM % 10 + 1))
    
    # Simulate blocks behind decreasing over time (catching up)
    if [ "$c1_blocks_behind" -gt 0 ]; then
        c1_blocks_behind=$((c1_blocks_behind - RANDOM % 5))
        if [ "$c1_blocks_behind" -lt 0 ]; then
            c1_blocks_behind=0
        fi
    else
        # Once synced, occasionally fall slightly behind
        c1_blocks_behind=$((RANDOM % 3))
    fi
    
    # Update state file
    cat > "$STATE_FILE" << EOF
{
    "node_id": "$INSTANCE_ID",
    "protocol": "dummy",
    "network": "${BC_NETWORK:-testnet}",
    "configuration": "${CLIENT_CONFIG:-dummy-base.sh}",
    "version": "${CLIENT_VERSION:-v1.0.0}",
    "started_at": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
    "status": "running",
    "config_type": "base",
    "c1_block_height": $c1_block_height,
    "c1_blocks_behind": $c1_blocks_behind
}
EOF
    
    echo "State updated: c1_block_height=$c1_block_height, c1_blocks_behind=$c1_blocks_behind"
    
    # Mark init as completed after first cycle
    if [ ! -f "$INIT_COMPLETED_FILE" ]; then
        touch "$INIT_COMPLETED_FILE"
        echo "Initial sync marked as complete"
    fi
    
    sleep "$METRICS_INTERVAL"
done &
STATE_UPDATE_PID=$!
echo "State update loop started with PID: $STATE_UPDATE_PID"

echo "Dummy base configuration applied successfully"
