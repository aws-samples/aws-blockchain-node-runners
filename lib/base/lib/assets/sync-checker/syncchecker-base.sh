#!/bin/bash
source /etc/environment

OPTIMISM_SYNC_STATUS=$(curl -s -X POST -H "Content-Type: application/json" --data '{"id":0,"jsonrpc":"2.0","method":"optimism_syncStatus"}' http://localhost:7545 | jq -r ".result")

# L1 client stats
L1_CLIENT_HEAD=$(echo $OPTIMISM_SYNC_STATUS | jq -r ".head_l1.number")
L1_CLIENT_CURRENT=$(echo $OPTIMISM_SYNC_STATUS | jq -r ".current_l1.number")
L1_CLIENT_BLOCKS_BEHIND="$((L1_CLIENT_HEAD-L1_CLIENT_CURRENT))"

# L2 client stats
L2_CLIENT_HEAD=$(echo $OPTIMISM_SYNC_STATUS | jq -r ".queued_unsafe_l2.number")
L2_CLIENT_CURRENT=$(echo $OPTIMISM_SYNC_STATUS | jq -r ".unsafe_l2.number")
L2_CLIENT_BLOCKS_BEHIND="$((L2_CLIENT_HEAD-L2_CLIENT_CURRENT))"

echo "L1_CLIENT_HEAD="$L1_CLIENT_HEAD
echo "L1_CLIENT_CURRENT="$L1_CLIENT_CURRENT
echo "L1_CLIENT_BLOCKS_BEHIND="$L1_CLIENT_BLOCKS_BEHIND

echo "L2_CLIENT_HEAD="$L2_CLIENT_HEAD
echo "L2_CLIENT_CURRENT="$L2_CLIENT_CURRENT
echo "L2_CLIENT_BLOCKS_BEHIND="$L2_CLIENT_BLOCKS_BEHIND

# Sending data to CloudWatch
TOKEN=$(curl -s -X PUT "http://169.254.169.254/latest/api/token" -H "X-aws-ec2-metadata-token-ttl-seconds: 21600")
INSTANCE_ID=$(curl -H "X-aws-ec2-metadata-token: $TOKEN" -s http://169.254.169.254/latest/meta-data/instance-id)
REGION=$(curl -H "X-aws-ec2-metadata-token: $TOKEN" -s http://169.254.169.254/latest/dynamic/instance-identity/document | jq .region -r)
TIMESTAMP=$(date +"%Y-%m-%dT%H:%M:%S%:z")

aws cloudwatch put-metric-data --metric-name l1_current_block --namespace CWAgent --value $L1_CLIENT_CURRENT --timestamp $TIMESTAMP --dimensions  InstanceId=$INSTANCE_ID --region $REGION
aws cloudwatch put-metric-data --metric-name l1_blocks_behind --namespace CWAgent --value $L1_CLIENT_BLOCKS_BEHIND --timestamp $TIMESTAMP --dimensions  InstanceId=$INSTANCE_ID --region $REGION

aws cloudwatch put-metric-data --metric-name l2_current_block --namespace CWAgent --value $L2_CLIENT_CURRENT --timestamp $TIMESTAMP --dimensions  InstanceId=$INSTANCE_ID --region $REGION
aws cloudwatch put-metric-data --metric-name l2_blocks_behind --namespace CWAgent --value $L2_CLIENT_BLOCKS_BEHIND --timestamp $TIMESTAMP --dimensions  InstanceId=$INSTANCE_ID --region $REGION

