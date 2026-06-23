#!/bin/bash
# Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
# SPDX-License-Identifier: Apache-2.0

# Solana Protocol - Sync Checker and Traffic Shaping Controller
# Monitors node synchronization via getHealth RPC endpoint,
# dynamically enables/disables traffic shaping, and reports
# c1_block_height and c1_blocks_behind metrics to CloudWatch.

set -euo pipefail

# Load environment variables
source /etc/cdk_environment 2>/dev/null || true

# Configuration
TRAFFIC_SHAPING_ENABLED="${TRAFFIC_SHAPING_ENABLED:-false}"
TRAFFIC_SHAPING_MAX_BLOCKS_BEHIND="${TRAFFIC_SHAPING_MAX_BLOCKS_BEHIND:-10}"
DATA_DIR="${DATA_VOL_1_MOUNT_PATH:-/data}"
INIT_COMPLETED_FILE="$DATA_DIR/data/init-completed"

# Get instance metadata
TOKEN=$(curl -s -X PUT "http://169.254.169.254/latest/api/token" -H "X-aws-ec2-metadata-token-ttl-seconds: 21600" 2>/dev/null || echo "")
if [ -n "$TOKEN" ]; then
    INSTANCE_ID=$(curl -H "X-aws-ec2-metadata-token: $TOKEN" -s http://169.254.169.254/latest/meta-data/instance-id 2>/dev/null || echo "i-unknown")
    EC2_INTERNAL_IP=$(curl -H "X-aws-ec2-metadata-token: $TOKEN" -s http://169.254.169.254/latest/meta-data/local-ipv4 2>/dev/null || echo "127.0.0.1")
    REGION=$(curl -H "X-aws-ec2-metadata-token: $TOKEN" -s http://169.254.169.254/latest/dynamic/instance-identity/document 2>/dev/null | jq -r '.region // empty' || echo "${AWS_REGION:-us-east-1}")
else
    INSTANCE_ID="i-unknown"
    EC2_INTERNAL_IP="127.0.0.1"
    REGION="${AWS_REGION:-us-east-1}"
fi

TIMESTAMP=$(date +"%Y-%m-%dT%H:%M:%S%:z")

# Logging function
log() {
    echo "[$(date '+%Y-%m-%dT%H:%M:%SZ')] [syncchecker] $1"
}

# Only run after initial sync is complete
if [ ! -f "$INIT_COMPLETED_FILE" ]; then
    log "Initial sync not yet complete (waiting for $INIT_COMPLETED_FILE), skipping sync check"
    # Report zero metrics while syncing
    if command -v aws &> /dev/null && [ -n "${REGION:-}" ]; then
        aws cloudwatch put-metric-data \
            --namespace "CWAgent" \
            --metric-name "c1_block_height" \
            --value "0" \
            --timestamp "$TIMESTAMP" \
            --dimensions "InstanceId=$INSTANCE_ID" \
            --region "$REGION" 2>/dev/null || true
    fi
    exit 0
fi

# Query Solana getBlockHeight for current block height
log "Querying Solana RPC at http://$EC2_INTERNAL_IP:8899"

c1_block_height=$(curl -s -X POST \
    -H "Content-Type: application/json" \
    -d '{"jsonrpc":"2.0","id":1,"method":"getBlockHeight"}' \
    "http://$EC2_INTERNAL_IP:8899" 2>/dev/null | jq -r '.result // 0' 2>/dev/null || echo "0")

# Query Solana getHealth to determine slots behind
# When node is healthy: returns {"result":"ok"}
# When node is behind: returns error with numSlotsBehind in .error.data.numSlotsBehind
HEALTH_RESPONSE=$(curl -s -X POST \
    -H "Content-Type: application/json" \
    -d '{"jsonrpc":"2.0","id":1,"method":"getHealth"}' \
    "http://$EC2_INTERNAL_IP:8899" 2>/dev/null || echo '{}')

# Extract numSlotsBehind from .error.data.numSlotsBehind
slots_behind_raw=$(echo "$HEALTH_RESPONSE" | jq -r '.error.data.numSlotsBehind // empty' 2>/dev/null || echo "")

if [ -z "$slots_behind_raw" ] || [ "$slots_behind_raw" = "null" ]; then
    # No error data means node is healthy and fully synced
    c1_blocks_behind=0
else
    c1_blocks_behind="$slots_behind_raw"
fi

# Ensure numeric values
c1_block_height="${c1_block_height:-0}"
c1_blocks_behind="${c1_blocks_behind:-0}"

log "Sync status: block_height=$c1_block_height, slots_behind=$c1_blocks_behind"

# Report metrics to CloudWatch (always, regardless of traffic shaping status)
if command -v aws &> /dev/null && [ -n "${REGION:-}" ]; then
    log "Reporting metrics to CloudWatch (namespace=CWAgent, region=$REGION)"

    aws cloudwatch put-metric-data \
        --namespace "CWAgent" \
        --metric-name "c1_block_height" \
        --value "$c1_block_height" \
        --timestamp "$TIMESTAMP" \
        --dimensions "InstanceId=$INSTANCE_ID" \
        --region "$REGION" 2>/dev/null || log "Failed to send c1_block_height metric"

    aws cloudwatch put-metric-data \
        --namespace "CWAgent" \
        --metric-name "c1_blocks_behind" \
        --value "$c1_blocks_behind" \
        --timestamp "$TIMESTAMP" \
        --dimensions "InstanceId=$INSTANCE_ID" \
        --region "$REGION" 2>/dev/null || log "Failed to send c1_blocks_behind metric"

    log "Metrics reported successfully"
else
    log "AWS CLI not available or REGION not set, skipping CloudWatch metrics"
fi

# Traffic shaping control (only if enabled)
if [ "$TRAFFIC_SHAPING_ENABLED" != "true" ]; then
    log "Traffic shaping is not enabled, skipping traffic shaping control"
    exit 0
fi

# Check if traffic shaping service exists
if ! systemctl list-unit-files 2>/dev/null | grep -q "net-rules.service"; then
    log "net-rules.service not found, traffic shaping not available"
    exit 1
fi

# Determine if traffic shaping should be enabled or disabled
if [ "$c1_blocks_behind" -le 0 ]; then
    # Node is fully synced (slots_behind == 0), enable traffic shaping
    if systemctl is-active --quiet net-rules.service 2>/dev/null; then
        log "Node is synced (slots_behind=$c1_blocks_behind), traffic shaping already active"
    else
        log "Node is synced (slots_behind=$c1_blocks_behind), enabling traffic shaping"
        systemctl start net-rules.service || log "Failed to start net-rules.service"
        log "Traffic shaping enabled"
    fi
elif [ "$c1_blocks_behind" -gt "$TRAFFIC_SHAPING_MAX_BLOCKS_BEHIND" ]; then
    # Node is behind threshold, disable traffic shaping to allow catch-up
    if systemctl is-active --quiet net-rules.service 2>/dev/null; then
        log "Node is behind (slots_behind=$c1_blocks_behind > $TRAFFIC_SHAPING_MAX_BLOCKS_BEHIND), disabling traffic shaping"
        systemctl stop net-rules.service || log "Failed to stop net-rules.service"
        log "Traffic shaping disabled"
    else
        log "Node is behind (slots_behind=$c1_blocks_behind > $TRAFFIC_SHAPING_MAX_BLOCKS_BEHIND), traffic shaping already inactive"
    fi
else
    # Node is within acceptable range, maintain current state
    if systemctl is-active --quiet net-rules.service 2>/dev/null; then
        log "Node within acceptable range (slots_behind=$c1_blocks_behind), traffic shaping remains active"
    else
        log "Node within acceptable range (slots_behind=$c1_blocks_behind), traffic shaping remains inactive"
    fi
fi

log "Sync check complete"
exit 0
