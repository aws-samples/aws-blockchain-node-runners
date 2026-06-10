#!/bin/bash

# Publishes TRON sync metrics to CloudWatch:
#   tron_sync_block    - local node's current block height
#   tron_blocks_behind - difference vs a public reference node (0 when caught up)
# Metric names must match those used in node-cw-dashboard.ts.

source /etc/environment 2>/dev/null

# Local node height via java-tron HTTP API
LOCAL_HEIGHT=$(curl -s -X POST http://localhost:8090/wallet/getnowblock | jq -r '.block_header.raw_data.number // empty')
if [[ -z "$LOCAL_HEIGHT" ]]; then
    LOCAL_HEIGHT=0
fi

# Public reference height (network-aware)
if [[ "$TRON_NETWORK" == "nile" ]]; then
    REF_ENDPOINT="https://nile.trongrid.io/wallet/getnowblock"
else
    REF_ENDPOINT="https://api.trongrid.io/wallet/getnowblock"
fi
REF_HEIGHT=$(curl -s -X POST "$REF_ENDPOINT" | jq -r '.block_header.raw_data.number // empty')
if [[ -z "$REF_HEIGHT" ]]; then
    REF_HEIGHT=$LOCAL_HEIGHT
fi

BLOCKS_BEHIND=$((REF_HEIGHT - LOCAL_HEIGHT))
if [[ "$BLOCKS_BEHIND" -lt "0" ]]; then
    BLOCKS_BEHIND=0
fi

# Send data to CloudWatch
TOKEN=$(curl -s -X PUT "http://169.254.169.254/latest/api/token" -H "X-aws-ec2-metadata-token-ttl-seconds: 21600")
INSTANCE_ID=$(curl -H "X-aws-ec2-metadata-token: $TOKEN" -s http://169.254.169.254/latest/meta-data/instance-id)
REGION=$(curl -H "X-aws-ec2-metadata-token: $TOKEN" -s http://169.254.169.254/latest/dynamic/instance-identity/document | jq .region -r)
TIMESTAMP=$(date +"%Y-%m-%dT%H:%M:%S%:z")

aws cloudwatch put-metric-data --metric-name tron_sync_block --namespace CWAgent --value "$LOCAL_HEIGHT" --timestamp "$TIMESTAMP" --dimensions InstanceId="$INSTANCE_ID" --region "$REGION"
aws cloudwatch put-metric-data --metric-name tron_blocks_behind --namespace CWAgent --value "$BLOCKS_BEHIND" --timestamp "$TIMESTAMP" --dimensions InstanceId="$INSTANCE_ID" --region "$REGION"
