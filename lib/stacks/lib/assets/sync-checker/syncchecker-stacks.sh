#!/bin/bash
TOKEN=$(curl -s -X PUT "http://169.254.169.254/latest/api/token" -H "X-aws-ec2-metadata-token-ttl-seconds: 21600")
INSTANCE_ID=$(curl -H "X-aws-ec2-metadata-token: $TOKEN" -s http://169.254.169.254/latest/meta-data/instance-id)
REGION=$(curl -H "X-aws-ec2-metadata-token: $TOKEN" -s http://169.254.169.254/latest/dynamic/instance-identity/document | jq .region -r)
EC2_INTERNAL_IP=$(curl -H "X-aws-ec2-metadata-token: $TOKEN" -s http://169.254.169.254/latest/meta-data/local-ipv4)
TIMESTAMP=$(date +"%Y-%m-%dT%H:%M:%S%:z")

# TODO: Solidify which metrics are the most useful and publish those to cloudwatch.
STACKS_INFO=$(curl -s http://localhost:20443/v2/info)
if [ ! -z "$STACKS_INFO" ]; then
    STACKS_TIP_HEIGHT=$(echo $STACKS_INFO| jq .stacks_tip_height)
    BURN_BLOCK_HEIGHT=$(echo $STACKS_INFO| jq .burn_block_height)

    if [ $STACKS_TIP_HEIGHT == "null" ]
    then
        STACKS_TIP_HEIGHT=0
    fi

    if [ "$BURN_BLOCK_HEIGHT" == "null" ]
    then
        BURN_BLOCK_HEIGHT=0
    fi

    aws cloudwatch put-metric-data --metric-name stacks_tip_height --namespace CWAgent --value $STACKS_TIP_HEIGHT --timestamp $TIMESTAMP --dimensions  InstanceId=$INSTANCE_ID --region $REGION
    aws cloudwatch put-metric-data --metric-name burn_block_height --namespace CWAgent --value $BURN_BLOCK_HEIGHT --timestamp $TIMESTAMP --dimensions  InstanceId=$INSTANCE_ID --region $REGION
fi
