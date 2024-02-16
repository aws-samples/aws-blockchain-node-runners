#!/bin/bash
source /etc/environment

# Consensus client stats
CONSENSUS_CLIENT_SYNC_STATUS=$(curl -s http://localhost:5052/eth/v1/node/syncing | jq -r ".data")

CONSENSUS_CLIENT_IS_SYNCING=$(echo $CONSENSUS_CLIENT_SYNC_STATUS | jq -r ".is_syncing")
CONSENSUS_CLIENT_IS_OPTIMISTIC=$(echo $CONSENSUS_CLIENT_SYNC_STATUS | jq -r ".is_optimistic")
CONSENSUS_CLIENT_SYNC_DISTANCE=$(echo $CONSENSUS_CLIENT_SYNC_STATUS | jq -r ".sync_distance")
CONSENSUS_CLIENT_HEAD_SLOT=$(echo $CONSENSUS_CLIENT_SYNC_STATUS | jq -r ".head_slot")

if [[ -z "$CONSENSUS_CLIENT_SYNC_DISTANCE" ]]; then
    CONSENSUS_CLIENT_SYNC_DISTANCE=0
fi

if [[ -z "$CONSENSUS_CLIENT_HEAD_SLOT" ]]; then
    CONSENSUS_CLIENT_HEAD_SLOT=0
fi

# Execution client stats
EXECUTION_CLIENT_SYNC_STATS=$(curl -s -X POST -H "Content-Type: application/json" --data '{"jsonrpc":"2.0","method":"eth_syncing","params":[],"id":1}' http://localhost:8545 | jq -r ".result")

if [[ "$EXECUTION_CLIENT_SYNC_STATS" == "false" ]]; then
    EXECUTION_CLIENT_SYNC_BLOCK_HEX=$(curl -s -X POST -H "Content-Type: application/json" --data '{"jsonrpc":"2.0","method":"eth_blockNumber","params":[],"id":1}' http://localhost:8545 | jq -r ".result")
    EXECUTION_CLIENT_HIGHEST_BLOCK_HEX=$EXECUTION_CLIENT_SYNC_BLOCK_HEX
else
    EXECUTION_CLIENT_SYNC_BLOCK_HEX=$(echo $EXECUTION_CLIENT_SYNC_STATS | jq -r ".currentBlock")
    EXECUTION_CLIENT_HIGHEST_BLOCK_HEX=$(echo $EXECUTION_CLIENT_SYNC_STATS | jq -r ".highestBlock")
fi

EXECUTION_CLIENT_HIGHEST_BLOCK=$(echo $((${EXECUTION_CLIENT_HIGHEST_BLOCK_HEX})))
EXECUTION_CLIENT_SYNC_BLOCK=$(echo $((${EXECUTION_CLIENT_SYNC_BLOCK_HEX})))
EXECUTION_CLIENT_BLOCKS_BEHIND="$((EXECUTION_CLIENT_HIGHEST_BLOCK-EXECUTION_CLIENT_SYNC_BLOCK))"

# echo "EXECUTION_CLIENT_SYNC_STATS="$EXECUTION_CLIENT_SYNC_STATS
# echo "CONSENSUS_CLIENT_IS_SYNCING="$CONSENSUS_CLIENT_IS_SYNCING
# echo "CONSENSUS_CLIENT_IS_OPTIMISTIC="$CONSENSUS_CLIENT_IS_OPTIMISTIC
# echo "EXECUTION_CLIENT_HIGHEST_BLOCK="$EXECUTION_CLIENT_HIGHEST_BLOCK
# echo "EXECUTION_CLIENT_SYNC_BLOCK="$EXECUTION_CLIENT_SYNC_BLOCK
# echo "EXECUTION_CLIENT_BLOCKS_BEHIND="$EXECUTION_CLIENT_BLOCKS_BEHIND

# Sending data to CloudWatch
TOKEN=$(curl -s -X PUT "http://169.254.169.254/latest/api/token" -H "X-aws-ec2-metadata-token-ttl-seconds: 21600")
INSTANCE_ID=$(curl -H "X-aws-ec2-metadata-token: $TOKEN" -s http://169.254.169.254/latest/meta-data/instance-id)
REGION=$(curl -H "X-aws-ec2-metadata-token: $TOKEN" -s http://169.254.169.254/latest/dynamic/instance-identity/document | jq .region -r)
TIMESTAMP=$(date +"%Y-%m-%dT%H:%M:%S%:z")

aws cloudwatch put-metric-data --metric-name clc_sync_distance --namespace CWAgent --value $CONSENSUS_CLIENT_SYNC_DISTANCE --timestamp $TIMESTAMP --dimensions  InstanceId=$INSTANCE_ID --region $REGION
aws cloudwatch put-metric-data --metric-name clc_head_slot --namespace CWAgent --value $CONSENSUS_CLIENT_HEAD_SLOT --timestamp $TIMESTAMP --dimensions  InstanceId=$INSTANCE_ID --region $REGION

aws cloudwatch put-metric-data --metric-name elc_sync_block --namespace CWAgent --value $EXECUTION_CLIENT_SYNC_BLOCK --timestamp $TIMESTAMP --dimensions  InstanceId=$INSTANCE_ID --region $REGION
aws cloudwatch put-metric-data --metric-name elc_blocks_behind --namespace CWAgent --value $EXECUTION_CLIENT_BLOCKS_BEHIND --timestamp $TIMESTAMP --dimensions  InstanceId=$INSTANCE_ID --region $REGION
