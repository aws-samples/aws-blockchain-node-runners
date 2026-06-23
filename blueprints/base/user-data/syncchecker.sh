#!/bin/bash
# Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
# SPDX-License-Identifier: Apache-2.0

# Base Sync Checker and Metrics Reporter
# Monitors execution client (op-geth or reth) and op-node (rollup) sync status
# Reports metrics to CloudWatch and controls traffic shaping
#
# Port mapping (from upstream base/node docker-compose.yml):
#   - Execution RPC:  host 8545 -> container 8545
#   - Op-node RPC:    host 7545 -> container 8545

source /etc/cdk_environment

# Only run after initial setup is complete
if [ ! -f /data/init-completed ]; then
    echo "Node initialization not complete yet, skipping sync check"
    exit 0
fi

# Configuration
TRAFFIC_SHAPING_ENABLED="${TRAFFIC_SHAPING_ENABLED:-false}"
TRAFFIC_SHAPING_MAX_BLOCKS_BEHIND="${TRAFFIC_SHAPING_MAX_BLOCKS_BEHIND:-10}"

# Detect execution client from CLIENT_CONFIG
if echo "$CLIENT_CONFIG" | grep -q "reth"; then
    EXECUTION_CLIENT="reth"
elif echo "$CLIENT_CONFIG" | grep -q "nethermind"; then
    EXECUTION_CLIENT="nethermind"
else
    EXECUTION_CLIENT="geth"
fi

# Upstream docker-compose.yml exposes:
#   execution RPC on host port 8545
#   op-node RPC on host port 7545
EXECUTION_RPC="http://localhost:8545"
OPNODE_RPC="http://localhost:7545"

# Get instance metadata
TOKEN=$(curl -s -X PUT "http://169.254.169.254/latest/api/token" -H "X-aws-ec2-metadata-token-ttl-seconds: 21600")
INSTANCE_ID=$(curl -H "X-aws-ec2-metadata-token: $TOKEN" -s http://169.254.169.254/latest/meta-data/instance-id)
REGION=$(curl -H "X-aws-ec2-metadata-token: $TOKEN" -s http://169.254.169.254/latest/dynamic/instance-identity/document | jq -r .region)
TIMESTAMP=$(date +"%Y-%m-%dT%H:%M:%S%:z")

log() {
    echo "[$(date '+%Y-%m-%dT%H:%M:%SZ')] [syncchecker] $1"
}

# Helper: safely parse a hex string to decimal. Returns 0 for invalid input.
safe_hex_to_dec() {
    local hex_val="${1#0x}"
    if [[ "$hex_val" =~ ^[0-9a-fA-F]+$ ]]; then
        echo $((16#${hex_val}))
    else
        echo 0
    fi
}

# --- c2: op-node (rollup node) — queried first as source of truth for chain tip ---
# op-node's unsafe_l2 is always the accurate L2 chain tip regardless of the execution
# client's sync phase. We query it first so UNSAFE_BLOCK can be reused for c1_blocks_behind.
log "Querying op-node at $OPNODE_RPC"

ROLLUP_SYNC=$(curl -s -X POST -H "Content-Type: application/json" \
    --data '{"jsonrpc":"2.0","method":"optimism_syncStatus","params":[],"id":1}' \
    "$OPNODE_RPC" 2>/dev/null)

if [ -n "$ROLLUP_SYNC" ] && [ "$(echo "$ROLLUP_SYNC" | jq -r '.result')" != "null" ]; then
    UNSAFE_BLOCK=$(echo "$ROLLUP_SYNC" | jq -r ".result.unsafe_l2.number // 0")
    SAFE_BLOCK=$(echo "$ROLLUP_SYNC"   | jq -r ".result.safe_l2.number // 0")
    c2_block_height=$UNSAFE_BLOCK
    c2_blocks_behind=$((UNSAFE_BLOCK - SAFE_BLOCK))
    if [ "$c2_blocks_behind" -lt 0 ]; then c2_blocks_behind=0; fi
else
    UNSAFE_BLOCK=0
    c2_block_height=0
    c2_blocks_behind=0
fi

log "op-node: block_height=$c2_block_height, blocks_behind=$c2_blocks_behind"

# --- c1: execution client (op-geth or reth) ---
log "Querying execution client ($EXECUTION_CLIENT) at $EXECUTION_RPC"

EXECUTION_SYNC_STATUS=$(curl -s -X POST -H "Content-Type: application/json" \
    --data '{"jsonrpc":"2.0","method":"eth_syncing","params":[],"id":1}' \
    "$EXECUTION_RPC" | jq -r ".result")

if [ "$EXECUTION_SYNC_STATUS" = "false" ]; then
    EXECUTION_BLOCK_HEX=$(curl -s -X POST -H "Content-Type: application/json" \
        --data '{"jsonrpc":"2.0","method":"eth_blockNumber","params":[],"id":1}' \
        "$EXECUTION_RPC" | jq -r ".result")
    c1_block_height=$(safe_hex_to_dec "$EXECUTION_BLOCK_HEX")
else
    EXECUTION_CURRENT_HEX=$(echo "$EXECUTION_SYNC_STATUS" | jq -r ".currentBlock // \"0x0\"")
    c1_block_height=$(safe_hex_to_dec "$EXECUTION_CURRENT_HEX")
fi

# Compute c1_blocks_behind from op-node's unsafe_l2 (the true chain tip).
if [ "$UNSAFE_BLOCK" -gt 0 ] && [ "$c1_block_height" -gt 0 ]; then
    c1_blocks_behind=$((UNSAFE_BLOCK - c1_block_height))
    if [ "$c1_blocks_behind" -lt 0 ]; then c1_blocks_behind=0; fi
elif [ "$UNSAFE_BLOCK" -gt 0 ] && [ "$c1_block_height" -eq 0 ]; then
    c1_blocks_behind=$UNSAFE_BLOCK
else
    c1_blocks_behind=0
fi

c1_block_height=${c1_block_height:-0}
c1_blocks_behind=${c1_blocks_behind:-0}
log "$EXECUTION_CLIENT: block_height=$c1_block_height, blocks_behind=$c1_blocks_behind"

# --- Report metrics to CloudWatch ---
aws cloudwatch put-metric-data \
    --namespace "CWAgent" \
    --metric-name "c1_block_height" \
    --value "$c1_block_height" \
    --timestamp "$TIMESTAMP" \
    --dimensions "InstanceId=$INSTANCE_ID" \
    --region "$REGION"

aws cloudwatch put-metric-data \
    --namespace "CWAgent" \
    --metric-name "c1_blocks_behind" \
    --value "$c1_blocks_behind" \
    --timestamp "$TIMESTAMP" \
    --dimensions "InstanceId=$INSTANCE_ID" \
    --region "$REGION"

aws cloudwatch put-metric-data \
    --namespace "CWAgent" \
    --metric-name "c2_block_height" \
    --value "$c2_block_height" \
    --timestamp "$TIMESTAMP" \
    --dimensions "InstanceId=$INSTANCE_ID" \
    --region "$REGION"

aws cloudwatch put-metric-data \
    --namespace "CWAgent" \
    --metric-name "c2_blocks_behind" \
    --value "$c2_blocks_behind" \
    --timestamp "$TIMESTAMP" \
    --dimensions "InstanceId=$INSTANCE_ID" \
    --region "$REGION"

log "Metrics reported to CloudWatch successfully"

# --- Snap sync stall detection (geth only) ---
# Reth does not use snap sync and does not suffer from the stall issue.
# This watchdog is only active for geth deployments.
#
# op-geth snap sync can stall permanently when the pivot moves during state healing.
# See: https://github.com/ethereum/go-ethereum/issues/26429
#
# IMPORTANT: Do NOT restart during state healing — currentBlock is frozen at the snap
# pivot by design while trie nodes are downloaded.

if [ "$EXECUTION_CLIENT" = "geth" ]; then
    IS_STATE_HEALING=false
    if [ "$EXECUTION_SYNC_STATUS" != "false" ]; then
        HEALING_HEX=$(echo "$EXECUTION_SYNC_STATUS" | jq -r '.healingTrienodes // "0x0"' 2>/dev/null || echo "0x0")
        HEALED_HEX=$(echo "$EXECUTION_SYNC_STATUS"  | jq -r '.healedTrienodes  // "0x0"' 2>/dev/null || echo "0x0")
        HEALING_DEC=$(safe_hex_to_dec "$HEALING_HEX")
        HEALED_DEC=$(safe_hex_to_dec "$HEALED_HEX")
        if [ "${HEALING_DEC:-0}" -gt 0 ] || [ "${HEALED_DEC:-0}" -gt 0 ]; then
            IS_STATE_HEALING=true
            log "State healing in progress (healingTrienodes=$HEALING_DEC, healedTrienodes=$HEALED_DEC), skipping stall watchdog"
        fi
    fi

    STALL_COUNT_FILE="/tmp/geth_sync_stall_count"
    STALL_BLOCK_FILE="/tmp/geth_last_sync_block"
    STALL_THRESHOLD=15  # ~15 minutes with 60s check interval

    if [ "$EXECUTION_SYNC_STATUS" != "false" ] && [ "$c1_block_height" -gt 0 ] && [ "$IS_STATE_HEALING" = "false" ]; then
        LAST_BLOCK=$(cat "$STALL_BLOCK_FILE" 2>/dev/null || echo 0)
        if [ "$c1_block_height" -eq "$LAST_BLOCK" ]; then
            STALL_COUNT=$(( $(cat "$STALL_COUNT_FILE" 2>/dev/null || echo 0) + 1 ))
            echo "$STALL_COUNT" > "$STALL_COUNT_FILE"
            log "Sync stall detected: block $c1_block_height unchanged for $STALL_COUNT consecutive checks (threshold: $STALL_THRESHOLD)"
            if [ "$STALL_COUNT" -ge "$STALL_THRESHOLD" ]; then
                log "op-geth snap sync stalled at block $c1_block_height for $STALL_COUNT checks, restarting execution container"
                docker restart execution
                echo 0 > "$STALL_COUNT_FILE"
                rm -f "$STALL_BLOCK_FILE"
                log "Execution container restarted, stall counter reset"
            fi
        else
            echo 0 > "$STALL_COUNT_FILE"
            echo "$c1_block_height" > "$STALL_BLOCK_FILE"
        fi
    else
        echo 0 > "$STALL_COUNT_FILE"
        rm -f "$STALL_BLOCK_FILE"
    fi
fi

# --- Traffic shaping control ---
if [ "$TRAFFIC_SHAPING_ENABLED" != "true" ]; then
    log "Traffic shaping is not enabled, skipping"
    exit 0
fi

if ! systemctl list-unit-files | grep -q "net-rules.service"; then
    log "net-rules.service not found, traffic shaping not available"
    exit 1
fi

# Guard: block_height=0 means the node has not yet produced a valid chain head.
# This occurs during initial sync when the derivation pipeline has not caught up.
# Treat this as "still initializing" — do not activate traffic shaping.
if [ "$c1_block_height" -eq 0 ]; then
    log "Execution client block_height=0 (initial sync not complete), skipping traffic shaping"
    if systemctl is-active --quiet net-rules.service; then
        log "Disabling traffic shaping during initial sync"
        systemctl stop net-rules.service || log "Failed to stop net-rules.service"
    fi
elif [ "$c1_blocks_behind" -le 0 ]; then
    if systemctl is-active --quiet net-rules.service; then
        log "Node is synced (blocks_behind=$c1_blocks_behind), traffic shaping already active"
    else
        log "Node is synced (blocks_behind=$c1_blocks_behind), enabling traffic shaping"
        systemctl start net-rules.service || log "Failed to start net-rules.service"
    fi
elif [ "$c1_blocks_behind" -gt "$TRAFFIC_SHAPING_MAX_BLOCKS_BEHIND" ]; then
    if systemctl is-active --quiet net-rules.service; then
        log "Node is behind ($c1_blocks_behind > $TRAFFIC_SHAPING_MAX_BLOCKS_BEHIND), disabling traffic shaping"
        systemctl stop net-rules.service || log "Failed to stop net-rules.service"
    fi
else
    log "Node within acceptable range (blocks_behind=$c1_blocks_behind)"
fi

log "Sync check complete"
exit 0
