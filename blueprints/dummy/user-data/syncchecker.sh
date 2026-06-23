#!/bin/bash
# Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
# SPDX-License-Identifier: Apache-2.0

# Dummy Protocol - Sync Checker and Metrics Reporter
#
# This is the REFERENCE IMPLEMENTATION for new blockchain protocol blueprints.
# It demonstrates all syncchecker best practices consolidated from production
# blueprints (Ethereum, Base, BNB, Solana). Copy this file as a starting point
# and adapt the sync status query section for your protocol's RPC API.
#
# Responsibilities:
#   1. Query node sync status (block height, blocks behind)
#   2. Report c1_* metrics to CloudWatch (and c2_* for multi-client protocols)
#   3. Detect sync stalls and auto-recover (if applicable)
#   4. Control traffic shaping based on sync status (if enabled)
#
# Metric naming convention:
#   - c1_block_height  / c1_blocks_behind  — primary/execution client
#   - c2_block_height  / c2_blocks_behind  — secondary/consensus client (multi-client only)
#   - Namespace: CWAgent (fixed across all protocols)
#
# This script is invoked by a systemd timer (syncchecker.timer) at a regular
# interval (default: 60 seconds, configurable via TRAFFIC_SHAPING_CHECK_INTERVAL_SEC).
#
# ┌─────────────────────────────────────────────────────────────────────────────┐
# │                        BEST PRACTICES CHECKLIST                            │
# │                                                                            │
# │  ✅ Structured logging with log() function and [syncchecker] prefix        │
# │  ✅ Defensive hex parsing via safe_hex_to_dec() for EVM-based protocols    │
# │  ✅ Graceful fallbacks when RPC is unreachable (return 0, don't crash)     │
# │  ✅ Negative blocks_behind clamped to 0                                    │
# │  ✅ Metrics reported BEFORE traffic shaping logic (always report)          │
# │  ✅ Stall detection for protocols prone to snap sync stalls                │
# │  ✅ Traffic shaping gated behind TRAFFIC_SHAPING_ENABLED check             │
# │  ✅ init-completed guard to skip checks during initial setup               │
# │  ✅ Comments documenting known limitations (e.g. eth_syncing=false gap)    │
# │                                                                            │
# │  For multi-client protocols (e.g. Ethereum, Base):                         │
# │  ✅ Query the authoritative chain tip source first (consensus/rollup)      │
# │  ✅ Use that tip to compute c1_blocks_behind (not eth_syncing.highestBlock)│
# │  ✅ Document c2_blocks_behind semantics during initial sync                │
# └─────────────────────────────────────────────────────────────────────────────┘

set -euo pipefail

# Load environment variables
source /etc/cdk_environment 2>/dev/null || true

# Configuration
TRAFFIC_SHAPING_ENABLED="${TRAFFIC_SHAPING_ENABLED:-false}"
TRAFFIC_SHAPING_MAX_BLOCKS_BEHIND="${TRAFFIC_SHAPING_MAX_BLOCKS_BEHIND:-10}"
DATA_DIR="${DATA_VOL_1_MOUNT_PATH:-/data}"
INIT_COMPLETED_FILE="$DATA_DIR/data/init-completed"

# Only run after initial setup is complete
if [ ! -f "$INIT_COMPLETED_FILE" ]; then
    echo "Initial sync not yet complete (waiting for $INIT_COMPLETED_FILE), skipping sync check"
    exit 0
fi

# ─── Instance metadata ───────────────────────────────────────────────────────
TOKEN=$(curl -s -X PUT "http://169.254.169.254/latest/api/token" -H "X-aws-ec2-metadata-token-ttl-seconds: 21600" 2>/dev/null || echo "")
if [ -n "$TOKEN" ]; then
    INSTANCE_ID=$(curl -H "X-aws-ec2-metadata-token: $TOKEN" -s http://169.254.169.254/latest/meta-data/instance-id 2>/dev/null || echo "i-unknown")
    EC2_INTERNAL_IP=$(curl -H "X-aws-ec2-metadata-token: $TOKEN" -s http://169.254.169.254/latest/meta-data/local-ipv4 2>/dev/null || echo "127.0.0.1")
    REGION=$(curl -H "X-aws-ec2-metadata-token: $TOKEN" -s http://169.254.169.254/latest/dynamic/instance-identity/document 2>/dev/null | jq -r '.region // empty' || echo "${AWS_REGION:-us-east-1}")
else
    INSTANCE_ID="i-unknown"
    # shellcheck disable=SC2034  # dummy mirrors the real syncchecker layout; IP is not used here
    EC2_INTERNAL_IP="127.0.0.1"
    REGION="${AWS_REGION:-us-east-1}"
fi
TIMESTAMP=$(date +"%Y-%m-%dT%H:%M:%S%:z")

# ─── Logging ─────────────────────────────────────────────────────────────────
# All output should use log() for consistent, parseable CloudWatch log entries.
log() {
    echo "[$(date '+%Y-%m-%dT%H:%M:%SZ')] [syncchecker] $1"
}

# ─── Defensive hex parsing (EVM protocols) ───────────────────────────────────
# EVM-based protocols return block numbers as hex strings (e.g. "0x2a1b3c").
# If the RPC is unreachable, restarting, or returns null/empty, raw bash
# arithmetic like $((16#...)) will crash the script. This helper validates
# input before conversion and returns 0 for any invalid value.
#
# Usage: block_height=$(safe_hex_to_dec "$HEX_VALUE")
#
# For non-EVM protocols (Solana, Bitcoin, etc.) that return decimal values
# from their RPC, this helper is not needed — use the raw numeric response.
safe_hex_to_dec() {
    local hex_val="${1#0x}"
    if [[ "$hex_val" =~ ^[0-9a-fA-F]+$ ]]; then
        echo $((16#${hex_val}))
    else
        echo 0
    fi
}

# ─── Query node sync status ─────────────────────────────────────────────────
# ADAPT THIS SECTION for your protocol's RPC API.
#
# For EVM single-client protocols (e.g. BNB):
#   - Use eth_syncing + eth_blockNumber
#   - See blueprints/bnb/user-data/syncchecker.sh
#
# For EVM multi-client protocols (e.g. Ethereum execution + consensus):
#   - Query consensus client FIRST for the authoritative chain tip
#   - Use that tip to compute c1_blocks_behind instead of eth_syncing.highestBlock
#   - See blueprints/ethereum/user-data/syncchecker.sh
#
# For OP Stack L2 protocols (e.g. Base):
#   - Query op-node FIRST for unsafe_l2 (the true L2 chain tip)
#   - Use unsafe_l2 to compute c1_blocks_behind
#   - See blueprints/base/user-data/syncchecker.sh
#
# For non-EVM protocols (e.g. Solana):
#   - Use protocol-specific RPC (e.g. getBlockHeight, getHealth)
#   - See blueprints/solana/user-data/syncchecker.sh
#
# Known limitations for EVM protocols:
#   - eth_syncing returns false both when fully synced AND during post-snap-sync
#     sequential block import (go-ethereum#25534, #25845). This means
#     c1_blocks_behind=0 may be reported while the node is still catching up.
#     For L2 protocols with a rollup node, this can be fixed by using the rollup
#     node's chain tip. For L1 protocols, this is a known limitation because the
#     consensus client tracks slots (not blocks) and can't provide a block-level
#     reference.
#   - eth_blockNumber returns 0x0 during active snap sync. Use
#     eth_syncing.currentBlock instead during that phase.
#   - eth_syncing.highestBlock is unreliable (returns 0 when eth_syncing=false).
#     Prefer an external chain tip source when available.

# Dummy protocol: read sync status from mock state file.
# In a real protocol, replace this with RPC queries.
STATE_FILE="$DATA_DIR/blockchain/state.json"
log "Checking node sync status from $STATE_FILE"

if [ -f "$STATE_FILE" ]; then
    c1_block_height=$(jq -r '.c1_block_height // 0' "$STATE_FILE" 2>/dev/null || echo "0")
    c1_blocks_behind=$(jq -r '.c1_blocks_behind // 0' "$STATE_FILE" 2>/dev/null || echo "0")
else
    log "Warning: State file not found at $STATE_FILE, using default values"
    c1_block_height=0
    c1_blocks_behind=0
fi

# Ensure non-negative blocks_behind (can happen with race conditions or clock skew)
if [ "$c1_blocks_behind" -lt 0 ]; then c1_blocks_behind=0; fi

log "Sync status: block_height=$c1_block_height, blocks_behind=$c1_blocks_behind"

# ─── Report metrics to CloudWatch ────────────────────────────────────────────
# Metrics are reported BEFORE traffic shaping logic so they are always emitted
# regardless of whether traffic shaping is enabled or the node is synced.
#
# For multi-client protocols, add c2_block_height and c2_blocks_behind here.
# See blueprints/ethereum/user-data/syncchecker.sh or
# blueprints/base/user-data/syncchecker.sh for examples.
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

# ─── Sync stall detection (optional) ─────────────────────────────────────────
# Some protocols (notably geth-based snap sync) can stall permanently when the
# snap sync pivot moves during state healing, invalidating all in-flight requests.
# The scheduler may not re-seed the download queue, leaving the node idle.
# See: https://github.com/ethereum/go-ethereum/issues/26429
#
# This watchdog tracks c1_block_height across invocations. If the node reports
# an active sync but the block height hasn't advanced for STALL_THRESHOLD
# consecutive checks, the node process is restarted automatically.
#
# Enable this section for protocols that:
#   - Use geth-based snap sync (Base, Ethereum geth, BNB from scratch)
#   - Have fast block times where stalls are more likely
#   - Run as Docker containers (use: docker restart <container>)
#   - Or run as systemd services (use: systemctl restart node.service)
#
# Skip this section for protocols that:
#   - Use snapshot-based sync (stall risk is minimal)
#   - Have a consensus client that naturally recovers stalls via Engine API
#   - Use non-geth execution clients (reth, erigon, besu, nethermind)
#
# Example implementation (uncomment and adapt for your protocol):
#
# STALL_COUNT_FILE="/tmp/sync_stall_count"
# STALL_BLOCK_FILE="/tmp/sync_last_block"
# STALL_THRESHOLD=15  # ~15 minutes with 60s check interval
#
# # Only check during active sync (not when fully synced)
# # For EVM: check if eth_syncing != false
# # For dummy: check if blocks_behind > 0
# if [ "$c1_blocks_behind" -gt 0 ] && [ "$c1_block_height" -gt 0 ]; then
#     LAST_BLOCK=$(cat "$STALL_BLOCK_FILE" 2>/dev/null || echo 0)
#     if [ "$c1_block_height" -eq "$LAST_BLOCK" ]; then
#         STALL_COUNT=$(( $(cat "$STALL_COUNT_FILE" 2>/dev/null || echo 0) + 1 ))
#         echo "$STALL_COUNT" > "$STALL_COUNT_FILE"
#         log "Sync stall detected: block $c1_block_height unchanged for $STALL_COUNT checks (threshold: $STALL_THRESHOLD)"
#         if [ "$STALL_COUNT" -ge "$STALL_THRESHOLD" ]; then
#             log "Sync stalled at block $c1_block_height for $STALL_COUNT checks, restarting node"
#             # For Docker-based protocols:
#             # docker restart execution
#             # For systemd-based protocols:
#             # systemctl restart node.service
#             echo 0 > "$STALL_COUNT_FILE"
#             rm -f "$STALL_BLOCK_FILE"
#             log "Node restarted, stall counter reset"
#         fi
#     else
#         echo 0 > "$STALL_COUNT_FILE"
#         echo "$c1_block_height" > "$STALL_BLOCK_FILE"
#     fi
# else
#     echo 0 > "$STALL_COUNT_FILE"
#     rm -f "$STALL_BLOCK_FILE"
# fi

# ─── Traffic shaping control ─────────────────────────────────────────────────
# Traffic shaping reduces outbound P2P bandwidth when the node is fully synced,
# saving up to 85-97% on data transfer costs for high-throughput protocols.
#
# Logic:
#   - blocks_behind <= 0        → enable traffic shaping (node is synced)
#   - blocks_behind > threshold → disable traffic shaping (let node catch up)
#   - otherwise                 → maintain current state (hysteresis)
#
# The threshold (TRAFFIC_SHAPING_MAX_BLOCKS_BEHIND) prevents flapping when the
# node briefly falls a few blocks behind during normal operation.
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
    if systemctl is-active --quiet net-rules.service 2>/dev/null; then
        log "Node is synced (blocks_behind=$c1_blocks_behind), traffic shaping already active"
    else
        log "Node is synced (blocks_behind=$c1_blocks_behind), enabling traffic shaping"
        systemctl start net-rules.service || log "Failed to start net-rules.service"
    fi
elif [ "$c1_blocks_behind" -gt "$TRAFFIC_SHAPING_MAX_BLOCKS_BEHIND" ]; then
    if systemctl is-active --quiet net-rules.service 2>/dev/null; then
        log "Node is behind (blocks_behind=$c1_blocks_behind > $TRAFFIC_SHAPING_MAX_BLOCKS_BEHIND), disabling traffic shaping"
        systemctl stop net-rules.service || log "Failed to stop net-rules.service"
    fi
else
    log "Node within acceptable range (blocks_behind=$c1_blocks_behind)"
fi

log "Sync check complete"
exit 0
