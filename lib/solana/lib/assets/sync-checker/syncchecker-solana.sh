#!/bin/bash

INIT_COMPLETED_FILE=/var/solana/data/init-completed
INSTANCE_ID=$(curl -s http://169.254.169.254/latest/meta-data/instance-id)
REGION=$(curl -s http://169.254.169.254/latest/dynamic/instance-identity/document | jq .region -r)
TIMESTAMP=$(date +"%Y-%m-%dT%H:%M:%S%:z")

if [ -f "$INIT_COMPLETED_FILE" ]; then
    SOLANA_BLOCK_HEIGHT=$(curl -s -X POST -H "Content-Type: application/json" -d ' {"jsonrpc":"2.0","id":1,"method":"getBlockHeight"}' http://localhost:8899 | jq .result)
    SOLANA_SLOTS_BEHIND_DATA=$(curl -s -X POST -H "Content-Type: application/json" -d ' {"jsonrpc":"2.0","id":1, "method":"getHealth"}' http://localhost:8899 | jq .error.data)
    SOLANA_SLOTS_BEHIND=$(echo $SOLANA_SLOTS_BEHIND_DATA | jq .numSlotsBehind -r)

    if [ $SOLANA_SLOTS_BEHIND == "null" ]
    then
        SOLANA_SLOTS_BEHIND=0
    fi

    if [ -z "$SOLANA_SLOTS_BEHIND" ]
    then
        SOLANA_SLOTS_BEHIND=0
    fi

    if [ -z "$SOLANA_BLOCK_HEIGHT" ]
    then
        SOLANA_BLOCK_HEIGHT=0
    fi

    aws cloudwatch put-metric-data --metric-name solana_block_height --namespace CWAgent --value $SOLANA_BLOCK_HEIGHT --timestamp $TIMESTAMP --dimensions  InstanceId=$INSTANCE_ID --region $REGION
    aws cloudwatch put-metric-data --metric-name solana_slots_behind --namespace CWAgent --value $SOLANA_SLOTS_BEHIND --timestamp $TIMESTAMP --dimensions  InstanceId=$INSTANCE_ID --region $REGION
else
    aws cloudwatch put-metric-data --metric-name solana_block_height --namespace CWAgent --value 0 --timestamp $TIMESTAMP --dimensions  InstanceId=$INSTANCE_ID --region $REGION
fi