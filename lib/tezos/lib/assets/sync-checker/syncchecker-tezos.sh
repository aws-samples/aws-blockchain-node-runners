#!/bin/bash
set +e

source /etc/environment


if [[ "$TZ_NETWORK" == "mainnet" ]]; then
    TZ_CURRENT_BLOCK=$(octez-client rpc get /chains/main/blocks/head/header/shell | jq -r ".level")
else
    TZ_CURRENT_BLOCK=$(octez-client rpc get /chains/test/blocks/head/header/shell | jq -r ".level")
fi


# Sending data to CloudWatch
TOKEN=$(curl -s -X PUT "http://169.254.169.254/latest/api/token" -H "X-aws-ec2-metadata-token-ttl-seconds: 21600")
INSTANCE_ID=$(curl -H "X-aws-ec2-metadata-token: $TOKEN" -s http://169.254.169.254/latest/meta-data/instance-id)
REGION=$(curl -H "X-aws-ec2-metadata-token: $TOKEN" -s http://169.254.169.254/latest/dynamic/instance-identity/document | jq .region -r)
TIMESTAMP=$(date +"%Y-%m-%dT%H:%M:%S%:z")

aws cloudwatch put-metric-data --metric-name tz_current_block --namespace CWAgent --value $TZ_CURRENT_BLOCK --timestamp $TIMESTAMP --dimensions  InstanceId=$INSTANCE_ID --region $REGION
#aws cloudwatch put-metric-data --metric-name tz _blocks_behind --namespace CWAgent --value $TZ_HIGHEST_BLOCK_DATE --timestamp $TIMESTAMP --dimensions  InstanceId=$INSTANCE_ID --region $REGION
