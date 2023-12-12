#!/bin/bash

INIT_COMPLETED_FILE=/var/scroll/data/init-completed
INSTANCE_ID=$(curl -s http://169.254.169.254/latest/meta-data/instance-id)
REGION=$(curl -s http://169.254.169.254/latest/dynamic/instance-identity/document | jq .region -r)
TIMESTAMP=$(date +"%Y-%m-%dT%H:%M:%S%:z")

#if [ -f "$INIT_COMPLETED_FILE" ]; then
#    SCROLL_BLOCK_HEIGHT=$(curl -s -X POST -H "Content-Type: application/json" -d ' {"jsonrpc":"2.0","id":1,"method":"getBlockHeight"}' http://localhost:8899 | jq .result)
#    SCROLL_SLOTS_BEHIND_DATA=$(curl -s -X POST -H "Content-Type: application/json" -d ' {"jsonrpc":"2.0","id":1, "method":"getHealth"}' http://localhost:8899 | jq .error.data)
#    SCROLL_SLOTS_BEHIND=$(echo $SCROLL_SLOTS_BEHIND_DATA | jq .numSlotsBehind -r)
#
#    if [ $SCROLL_SLOTS_BEHIND == "null" ]
#    then
#        SCROLL_SLOTS_BEHIND=0
#    fi
#
#    if [ -z "$SCROLL_SLOTS_BEHIND" ]
#    then
#        SCROLL_SLOTS_BEHIND=0
#    fi
#
#    if [ -z "$SCROLL_BLOCK_HEIGHT" ]
#    then
#        SCROLL_BLOCK_HEIGHT=0
#    fi
#
#    aws cloudwatch put-metric-data --metric-name scroll_block_height --namespace CWAgent --value $SCROLL_BLOCK_HEIGHT --timestamp $TIMESTAMP --dimensions  InstanceId=$INSTANCE_ID --region $REGION
#    aws cloudwatch put-metric-data --metric-name scroll_slots_behind --namespace CWAgent --value $SCROLL_SLOTS_BEHIND --timestamp $TIMESTAMP --dimensions  InstanceId=$INSTANCE_ID --region $REGION
#else
#    aws cloudwatch put-metric-data --metric-name scroll_block_height --namespace CWAgent --value 0 --timestamp $TIMESTAMP --dimensions  InstanceId=$INSTANCE_ID --region $REGION
#fi
