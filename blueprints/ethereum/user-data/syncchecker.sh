#!/bin/bash
# Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
# SPDX-License-Identifier: Apache-2.0

# Ethereum Sync Checker and Metrics Reporter
# This script monitors both execution and consensus client synchronization status
# and reports metrics to CloudWatch

source /etc/cdk_environment

# Only run after initial setup is complete
if [ ! -f /data/init-completed ]; then
    echo "Node initialization not complete yet, skipping sync check"
    exit 0
fi

# Get instance metadata
TOKEN=$(curl -s -X PUT "http://169.254.169.254/latest/api/token" -H "X-aws-ec2-metadata-token-ttl-seconds: 21600")
INSTANCE_ID=$(curl -H "X-aws-ec2-metadata-token: $TOKEN" -s http://169.254.169.254/latest/meta-data/instance-id)
REGION=$(curl -H "X-aws-ec2-metadata-token: $TOKEN" -s http://169.254.169.254/latest/dynamic/instance-identity/document | jq -r .region)
TIMESTAMP=$(date +"%Y-%m-%dT%H:%M:%S%:z")
EC2_INTERNAL_IP=$(curl -H "X-aws-ec2-metadata-token: $TOKEN" -s http://169.254.169.254/latest/meta-data/local-ipv4)

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

# --- c1: Execution client ---
log "Querying execution client at http://$EC2_INTERNAL_IP:8545"

EXECUTION_SYNC_STATUS=$(curl -s -X POST -H "Content-Type: application/json" \
    --data '{"jsonrpc":"2.0","method":"eth_syncing","params":[],"id":1}' \
    http://$EC2_INTERNAL_IP:8545 | jq -r ".result")

if [ "$EXECUTION_SYNC_STATUS" = "false" ]; then
    # eth_syncing=false means the execution client considers itself synced.
    # Note: geth may return false during post-snap-sync sequential import while still
    # behind the chain tip (go-ethereum#25534, #25845). In this case c1_blocks_behind=0
    # is inaccurate, but there is no reliable execution-layer chain tip reference on L1
    # (consensus tracks slots, not blocks) to compute the real gap.
    EXECUTION_BLOCK_HEX=$(curl -s -X POST -H "Content-Type: application/json" \
        --data '{"jsonrpc":"2.0","method":"eth_blockNumber","params":[],"id":1}' \
        http://$EC2_INTERNAL_IP:8545 | jq -r ".result")
    EXECUTION_CURRENT_BLOCK=$(safe_hex_to_dec "$EXECUTION_BLOCK_HEX")
    EXECUTION_HIGHEST_BLOCK=$EXECUTION_CURRENT_BLOCK
    EXECUTION_BLOCKS_BEHIND=0
else
    # Node is actively syncing — use currentBlock/highestBlock from the sync object
    EXECUTION_CURRENT_HEX=$(echo "$EXECUTION_SYNC_STATUS" | jq -r ".currentBlock // \"0x0\"")
    EXECUTION_HIGHEST_HEX=$(echo "$EXECUTION_SYNC_STATUS" | jq -r ".highestBlock // \"0x0\"")
    EXECUTION_CURRENT_BLOCK=$(safe_hex_to_dec "$EXECUTION_CURRENT_HEX")
    EXECUTION_HIGHEST_BLOCK=$(safe_hex_to_dec "$EXECUTION_HIGHEST_HEX")
    EXECUTION_BLOCKS_BEHIND=$((EXECUTION_HIGHEST_BLOCK - EXECUTION_CURRENT_BLOCK))
fi

# Default to 0 if values are empty or null
EXECUTION_CURRENT_BLOCK=${EXECUTION_CURRENT_BLOCK:-0}
EXECUTION_BLOCKS_BEHIND=${EXECUTION_BLOCKS_BEHIND:-0}

log "Execution: block_height=$EXECUTION_CURRENT_BLOCK, blocks_behind=$EXECUTION_BLOCKS_BEHIND"

# --- c2: Consensus client ---
log "Querying consensus client at http://$EC2_INTERNAL_IP:5052"

CONSENSUS_SYNC_STATUS=$(curl -s http://$EC2_INTERNAL_IP:5052/eth/v1/node/syncing | jq -r ".data")

if [ -n "$CONSENSUS_SYNC_STATUS" ] && [ "$CONSENSUS_SYNC_STATUS" != "null" ]; then
    CONSENSUS_IS_SYNCING=$(echo "$CONSENSUS_SYNC_STATUS" | jq -r ".is_syncing // false")
    CONSENSUS_SYNC_DISTANCE=$(echo "$CONSENSUS_SYNC_STATUS" | jq -r ".sync_distance // 0")
    CONSENSUS_HEAD_SLOT=$(echo "$CONSENSUS_SYNC_STATUS" | jq -r ".head_slot // 0")
else
    # shellcheck disable=SC2034  # computed for completeness; not currently emitted as a metric
    CONSENSUS_IS_SYNCING="true"
    CONSENSUS_SYNC_DISTANCE=0
    CONSENSUS_HEAD_SLOT=0
fi

# Default to 0 if values are empty or null
CONSENSUS_HEAD_SLOT=${CONSENSUS_HEAD_SLOT:-0}
# sync_distance is the number of slots between the node's head and the network head.
# During initial sync this will be large (thousands of slots), which is expected.
CONSENSUS_SYNC_DISTANCE=${CONSENSUS_SYNC_DISTANCE:-0}

log "Consensus: head_slot=$CONSENSUS_HEAD_SLOT, sync_distance=$CONSENSUS_SYNC_DISTANCE"

# --- Report metrics to CloudWatch ---
# Execution client metrics (c1_)
aws cloudwatch put-metric-data \
    --namespace "CWAgent" \
    --metric-name "c1_block_height" \
    --value "$EXECUTION_CURRENT_BLOCK" \
    --timestamp "$TIMESTAMP" \
    --dimensions "InstanceId=$INSTANCE_ID" \
    --region "$REGION"

aws cloudwatch put-metric-data \
    --namespace "CWAgent" \
    --metric-name "c1_blocks_behind" \
    --value "$EXECUTION_BLOCKS_BEHIND" \
    --timestamp "$TIMESTAMP" \
    --dimensions "InstanceId=$INSTANCE_ID" \
    --region "$REGION"

# Consensus client metrics (c2_)
aws cloudwatch put-metric-data \
    --namespace "CWAgent" \
    --metric-name "c2_block_height" \
    --value "$CONSENSUS_HEAD_SLOT" \
    --timestamp "$TIMESTAMP" \
    --dimensions "InstanceId=$INSTANCE_ID" \
    --region "$REGION"

aws cloudwatch put-metric-data \
    --namespace "CWAgent" \
    --metric-name "c2_blocks_behind" \
    --value "$CONSENSUS_SYNC_DISTANCE" \
    --timestamp "$TIMESTAMP" \
    --dimensions "InstanceId=$INSTANCE_ID" \
    --region "$REGION"

log "Metrics reported to CloudWatch successfully"
