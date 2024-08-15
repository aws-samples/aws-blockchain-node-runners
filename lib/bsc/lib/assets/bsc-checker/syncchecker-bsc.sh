#!/bin/bash

BSC_SYNC_STATS=$(curl -s -X POST -H "Content-Type: application/json" --data '{"jsonrpc":"2.0","method":"eth_syncing","params":[],"id":1}' http://localhost:8545 | jq -r ".result")

if [[ "$BSC_SYNC_STATS" == "false" ]]; then
    BSC_SYNC_BLOCK_HEX=$(curl -s -X POST -H "Content-Type: application/json" --data '{"jsonrpc":"2.0","method":"eth_blockNumber","params":[],"id":1}' http://localhost:8545 | jq -r ".result")
    BSC_HIGHEST_BLOCK_HEX=$BSC_SYNC_BLOCK_HEX
else
    BSC_SYNC_BLOCK_HEX=$(echo $BSC_SYNC_STATS | jq -r ".currentBlock")
    BSC_HIGHEST_BLOCK_HEX=$(echo $BSC_SYNC_STATS | jq -r ".highestBlock")
fi

BSC_HIGHEST_BLOCK=$(echo $((${BSC_HIGHEST_BLOCK_HEX})))
BSC_SYNC_BLOCK=$(echo $((${BSC_SYNC_BLOCK_HEX})))
BSC_BLOCKS_BEHIND="$((BSC_HIGHEST_BLOCK-BSC_SYNC_BLOCK))"

# Handle negative values if current block is bigger than highest block
if [[ "$BSC_BLOCKS_BEHIND" -lt "0" ]]; then
    BSC_BLOCKS_BEHIND=0
fi

# Sending data to CloudWatch
TOKEN=$(curl -s -X PUT "http://169.254.169.254/latest/api/token" -H "X-aws-ec2-metadata-token-ttl-seconds: 21600")
INSTANCE_ID=$(curl -H "X-aws-ec2-metadata-token: $TOKEN" -s http://169.254.169.254/latest/meta-data/instance-id)
REGION=$(curl -H "X-aws-ec2-metadata-token: $TOKEN" -s http://169.254.169.254/latest/dynamic/instance-identity/document | jq .region -r)
TIMESTAMP=$(date +"%Y-%m-%dT%H:%M:%S%:z")

aws cloudwatch put-metric-data --metric-name bsc_sync_block --namespace CWAgent --value $BSC_SYNC_BLOCK --timestamp $TIMESTAMP --dimensions  InstanceId=$INSTANCE_ID --region $REGION
aws cloudwatch put-metric-data --metric-name bsc_blocks_behind --namespace CWAgent --value $BSC_BLOCKS_BEHIND --timestamp $TIMESTAMP --dimensions  InstanceId=$INSTANCE_ID --region $REGION
