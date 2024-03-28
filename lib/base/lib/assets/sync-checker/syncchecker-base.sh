#!/bin/bash
source /etc/environment

OPTIMISM_SYNC_STATUS=$(curl -s -X POST -H "Content-Type: application/json" --data '{"id":0,"jsonrpc":"2.0","method":"optimism_syncStatus"}' http://localhost:7545 | jq -r ".result")

# L1 client stats
L1_CLIENT_HEAD=$(echo $OPTIMISM_SYNC_STATUS | jq -r ".head_l1.number")
L1_CLIENT_CURRENT=$(echo $OPTIMISM_SYNC_STATUS | jq -r ".current_l1.number")

if [ $L1_CLIENT_HEAD -eq 0 ]; then 
    L1_CLIENT_BLOCKS_BEHIND=0
else
    L1_CLIENT_BLOCKS_BEHIND="$((L1_CLIENT_HEAD-L1_CLIENT_CURRENT))"
fi

# L2 client stats
L2_CLIENT_CURRENT=$(echo $OPTIMISM_SYNC_STATUS | jq -r ".unsafe_l2.number")
L2_CLIENT_CURRENT_BLOCK_TIMESTAMP=$(echo $OPTIMISM_SYNC_STATUS | jq -r ".unsafe_l2.timestamp")
L2_CLIENT_CURRENT_BLOCK_MINUTES_BEHIND="$((($(date +%s) - L2_CLIENT_CURRENT_BLOCK_TIMESTAMP)/60))"

if [ "$L2_CLIENT_CURRENT" == "null" ]; then 
    L2_CLIENT_CURRENT=0
fi

# echo "L1_CLIENT_HEAD="$L1_CLIENT_HEAD
# echo "L1_CLIENT_CURRENT="$L1_CLIENT_CURRENT
# echo "L1_CLIENT_BLOCKS_BEHIND="$L1_CLIENT_BLOCKS_BEHIND

# echo "L2_CLIENT_CURRENT="$L2_CLIENT_CURRENT
# echo "L2_CLIENT_CURRENT_BLOCK_TIMESTAMP="$L2_CLIENT_CURRENT_BLOCK_TIMESTAMP
# echo "L2_CLIENT_CURRENT_BLOCK_MINUTES_BEHIND="$L2_CLIENT_CURRENT_BLOCK_MINUTES_BEHIND

# Sending data to CloudWatch
TOKEN=$(curl -s -X PUT "http://169.254.169.254/latest/api/token" -H "X-aws-ec2-metadata-token-ttl-seconds: 21600")
INSTANCE_ID=$(curl -H "X-aws-ec2-metadata-token: $TOKEN" -s http://169.254.169.254/latest/meta-data/instance-id)
REGION=$(curl -H "X-aws-ec2-metadata-token: $TOKEN" -s http://169.254.169.254/latest/dynamic/instance-identity/document | jq .region -r)
TIMESTAMP=$(date +"%Y-%m-%dT%H:%M:%S%:z")

aws cloudwatch put-metric-data --metric-name l1_current_block --namespace CWAgent --value $L1_CLIENT_CURRENT --timestamp $TIMESTAMP --dimensions  InstanceId=$INSTANCE_ID --region $REGION
aws cloudwatch put-metric-data --metric-name l1_blocks_behind --namespace CWAgent --value $L1_CLIENT_BLOCKS_BEHIND --timestamp $TIMESTAMP --dimensions  InstanceId=$INSTANCE_ID --region $REGION

aws cloudwatch put-metric-data --metric-name l2_current_block --namespace CWAgent --value $L2_CLIENT_CURRENT --timestamp $TIMESTAMP --dimensions  InstanceId=$INSTANCE_ID --region $REGION
aws cloudwatch put-metric-data --metric-name l2_minutes_behind --namespace CWAgent --value $L2_CLIENT_CURRENT_BLOCK_MINUTES_BEHIND --timestamp $TIMESTAMP --dimensions  InstanceId=$INSTANCE_ID --region $REGION

