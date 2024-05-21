#!/bin/bash
TZ_CHAIN_ID=$(curl -s -m 1 -H "Content-Type: application/json" http://localhost:8732/monitor/active_chains | jq -r ".[] | .chain_id")
TZ_SYNC_STATUS=$(curl -s -m 1 -H "Content-Type: application/json" http://localhost:8732/chains/$TZ_CHAIN_ID/is_bootstrapped | jq -r ".sync_state")

if [[ "$TZ_SYNC_STATUS" == "synced" ]]; then
    TZ_CURRENT_BLOCK=$(curl -s -m 1 -H "Content-Type: application/json" http://localhost:8732/chains/$TZ_CHAIN_ID/levels/checkpoint | jq -r ".level")
else
    TZ_CURRENT_BLOCK=$(curl -s -m 1 -H "Content-Type: application/json" http://localhost:8732/chains/$TZ_CHAIN_ID/levels/checkpoint | jq -r ".level")
fi


# Sending data to CloudWatch
TOKEN=$(curl -s -X PUT "http://169.254.169.254/latest/api/token" -H "X-aws-ec2-metadata-token-ttl-seconds: 21600")
INSTANCE_ID=$(curl -H "X-aws-ec2-metadata-token: $TOKEN" -s http://169.254.169.254/latest/meta-data/instance-id)
REGION=$(curl -H "X-aws-ec2-metadata-token: $TOKEN" -s http://169.254.169.254/latest/dynamic/instance-identity/document | jq .region -r)
TIMESTAMP=$(date +"%Y-%m-%dT%H:%M:%S%:z")

aws cloudwatch put-metric-data --metric-name tz_current_block --namespace CWAgent --value $TZ_CURRENT_BLOCK --timestamp $TIMESTAMP --dimensions  InstanceId=$INSTANCE_ID --region $REGION
#aws cloudwatch put-metric-data --metric-name tz _blocks_behind --namespace CWAgent --value $TZ_HIGHEST_BLOCK_DATE --timestamp $TIMESTAMP --dimensions  InstanceId=$INSTANCE_ID --region $REGION
