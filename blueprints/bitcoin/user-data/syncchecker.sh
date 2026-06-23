#!/bin/bash
# Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
# SPDX-License-Identifier: Apache-2.0

# Bitcoin Core Sync Checker and Metrics Reporter
# Monitors bitcoind sync status and reports metrics to CloudWatch

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

log() {
    echo "[$(date '+%Y-%m-%dT%H:%M:%SZ')] [syncchecker] $1"
}

# --- c1: Bitcoin Core ---
# Use bitcoin-cli with cookie auth (works locally without rpcauth credentials)
BLOCKCHAIN_INFO=$(/home/bcuser/bin/bitcoin-cli -conf=/data/bitcoin.conf -datadir=/data getblockchaininfo 2>/dev/null)

if [ -n "$BLOCKCHAIN_INFO" ] && [ "$(echo "$BLOCKCHAIN_INFO" | jq -r '.chain')" != "null" ]; then
    c1_block_height=$(echo "$BLOCKCHAIN_INFO" | jq -r '.blocks // 0')
    HEADERS=$(echo "$BLOCKCHAIN_INFO" | jq -r '.headers // 0')
    c1_blocks_behind=$((HEADERS - c1_block_height))
    if [ "$c1_blocks_behind" -lt 0 ]; then c1_blocks_behind=0; fi
    log "Bitcoin Core: block_height=$c1_block_height, headers=$HEADERS, blocks_behind=$c1_blocks_behind"
else
    c1_block_height=0
    c1_blocks_behind=0
    log "Bitcoin Core: unable to query node (may be starting)"
fi

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
