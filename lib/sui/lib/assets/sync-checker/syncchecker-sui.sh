#!/bin/bash
set +e

source /etc/environment

CURRENT_CHECKPOINT_SEQ_NUMBER=$(curl --location --request POST localhost:9000 --header 'Content-Type: application/json' --data-raw '{ "jsonrpc":"2.0", "method":"sui_getLatestCheckpointSequenceNumber", "params": [], "id":1}' | jq -r .result)
CURRENT_CHECKPOINT_TIMESTAMP_MS=$(curl --location --request POST localhost:9000 --header 'Content-Type: application/json' --data-raw '{ "jsonrpc":"2.0", "method":"sui_getCheckpoint", "params": ['\"$CURRENT_CHECKPOINT_SEQ_NUMBER\"'], "id":1}' | jq -r .result.timestampMs)

EPOCH_SECONDS=$(date +%s)

# Convert seconds to milliseconds
EPOCH_MS=$((EPOCH_SECONDS * 1000))

CURRENT_CHECKPOINT_MS_BEHIND=$(($EPOCH_MS - $CURRENT_CHECKPOINT_TIMESTAMP_MS))

CURRENT_CHECKPOINT_MIN_BEHIND=$(($CURRENT_CHECKPOINT_MS_BEHIND / 60000))

# Sending data to CloudWatch
TOKEN=$(curl -s -X PUT "http://169.254.169.254/latest/api/token" -H "X-aws-ec2-metadata-token-ttl-seconds: 21600")
INSTANCE_ID=$(curl -H "X-aws-ec2-metadata-token: $TOKEN" -s http://169.254.169.254/latest/meta-data/instance-id)
REGION=$(curl -H "X-aws-ec2-metadata-token: $TOKEN" -s http://169.254.169.254/latest/dynamic/instance-identity/document | jq .region -r)
TIMESTAMP=$(date +"%Y-%m-%dT%H:%M:%S%:z")

aws cloudwatch put-metric-data --metric-name sui_current_checkpoint_no --namespace CWAgent --value $CURRENT_CHECKPOINT_SEQ_NUMBER --timestamp $TIMESTAMP --dimensions  InstanceId=$INSTANCE_ID --region $REGION
aws cloudwatch put-metric-data --metric-name sui_minutes_behind --namespace CWAgent --value $CURRENT_CHECKPOINT_MIN_BEHIND --timestamp $TIMESTAMP --dimensions  InstanceId=$INSTANCE_ID --region $REGION
