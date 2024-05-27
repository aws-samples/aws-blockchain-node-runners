#!/bin/bash

TOKEN=$(curl -s -X PUT "http://169.254.169.254/latest/api/token" -H "X-aws-ec2-metadata-token-ttl-seconds: 21600")
EC2_INTERNAL_IP=$(curl -H "X-aws-ec2-metadata-token: $TOKEN" -s "http://169.254.169.254/latest/meta-data/local-ipv4")

# Getting syncing status from Starknet node
STARKNET_SYNC_STATS=$(curl -s -X POST -H "Content-Type: application/json" --data '{"jsonrpc":"2.0","method":"starknet_syncing","params":[],"id":1}' http://$EC2_INTERNAL_IP:6060 | jq -r ".result")

if [[ "$STARKNET_SYNC_STATS" == "false" ]]; then
    STARKNET_CURRENT_BLOCK=$(curl -s -X POST -H "Content-Type: application/json" --data '{"jsonrpc":"2.0","method":"starknet_blockNumber","params":[],"id":1}' http://$EC2_INTERNAL_IP:6060 | jq -r ".result")
    STARKNET_HIGHEST_BLOCK=$STARKNET_CURRENT_BLOCK
else
    # Extract current and highest block numbers from the syncing status
    STARKNET_CURRENT_BLOCK=$(echo "$STARKNET_SYNC_STATS" | jq -r ".current_block_num")
    STARKNET_HIGHEST_BLOCK=$(echo "$STARKNET_SYNC_STATS" | jq -r ".highest_block_num")
fi

STARKNET_BLOCKS_BEHIND="$((STARKNET_HIGHEST_BLOCK-STARKNET_CURRENT_BLOCK))"
# Echo the current and highest block numbers for verification
echo "Current Block: $STARKNET_CURRENT_BLOCK"
echo "Highest Block: $STARKNET_HIGHEST_BLOCK"
echo "STARKNET_BLOCKS_BEHIND Block: $STARKNET_BLOCKS_BEHIND"

# Sending data to CloudWatch
INSTANCE_ID=$(curl -H "X-aws-ec2-metadata-token: $TOKEN" -s http://169.254.169.254/latest/meta-data/instance-id)
REGION=$(curl -H "X-aws-ec2-metadata-token: $TOKEN" -s http://169.254.169.254/latest/dynamic/instance-identity/document | jq .region -r)
TIMESTAMP=$(date +"%Y-%m-%dT%H:%M:%S%z")

aws cloudwatch put-metric-data --metric-name starknet_current_block --namespace CWAgent --value $STARKNET_CURRENT_BLOCK --timestamp $TIMESTAMP --dimensions InstanceId=$INSTANCE_ID --region $REGION
aws cloudwatch put-metric-data --metric-name starknet_blocks_behind --namespace CWAgent --value $STARKNET_BLOCKS_BEHIND --timestamp $TIMESTAMP --dimensions InstanceId=$INSTANCE_ID --region $REGION
