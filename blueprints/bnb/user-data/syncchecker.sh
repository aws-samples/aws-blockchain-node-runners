#!/bin/bash
# Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
# SPDX-License-Identifier: Apache-2.0

# BNB Smart Chain Sync Checker and Metrics Reporter
# Monitors BSC geth sync status and reports metrics to CloudWatch

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

# --- c1: BSC geth (execution client) ---
log "Querying BSC node at http://$EC2_INTERNAL_IP:8545"

# Helper: safely parse a hex string to decimal. Returns 0 for invalid input.
safe_hex_to_dec() {
    local hex_val="${1#0x}"
    if [[ "$hex_val" =~ ^[0-9a-fA-F]+$ ]]; then
        echo $((16#${hex_val}))
    else
        echo 0
    fi
}

SYNC_STATUS=$(curl -s -X POST -H "Content-Type: application/json" \
    --data '{"jsonrpc":"2.0","method":"eth_syncing","params":[],"id":1}' \
    http://"$EC2_INTERNAL_IP":8545 | jq -r ".result")

if [ "$SYNC_STATUS" = "false" ]; then
    # eth_syncing=false means BSC geth considers itself synced.
    # Note: geth may briefly return false during post-snapshot sequential import while
    # still behind the chain tip (go-ethereum#25534, #25845). With snapshot-based sync
    # this gap is typically small (minutes), unlike snap-sync-from-scratch scenarios.
    BLOCK_HEX=$(curl -s -X POST -H "Content-Type: application/json" \
        --data '{"jsonrpc":"2.0","method":"eth_blockNumber","params":[],"id":1}' \
        http://"$EC2_INTERNAL_IP":8545 | jq -r ".result")
    c1_block_height=$(safe_hex_to_dec "$BLOCK_HEX")
    c1_blocks_behind=0
else
    # Node is actively syncing — use currentBlock/highestBlock from the sync object
    CURRENT_HEX=$(echo "$SYNC_STATUS" | jq -r ".currentBlock // \"0x0\"")
    HIGHEST_HEX=$(echo "$SYNC_STATUS" | jq -r ".highestBlock // \"0x0\"")
    c1_block_height=$(safe_hex_to_dec "$CURRENT_HEX")
    HIGHEST=$(safe_hex_to_dec "$HIGHEST_HEX")
    c1_blocks_behind=$((HIGHEST - c1_block_height))
fi

c1_block_height=${c1_block_height:-0}
c1_blocks_behind=${c1_blocks_behind:-0}

if [ "$c1_blocks_behind" -lt 0 ]; then c1_blocks_behind=0; fi

log "BSC node: block_height=$c1_block_height, blocks_behind=$c1_blocks_behind"

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

log "Metrics reported to CloudWatch successfully"
log "Sync check complete"
exit 0
