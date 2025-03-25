#!/bin/bash

INIT_COMPLETED_FILE=/data/data/init-completed

TOKEN=$(curl -s -X PUT "http://169.254.169.254/latest/api/token" -H "X-aws-ec2-metadata-token-ttl-seconds: 21600")
EC2_INTERNAL_IP=$(curl -H "X-aws-ec2-metadata-token: $TOKEN" -s http://169.254.169.254/latest/meta-data/local-ipv4)

# Start checking the sync node status only after the node has finished the initial sync
if [ -f "$INIT_COMPLETED_FILE" ]; then
    SOLANA_SLOTS_BEHIND_DATA=$(curl -s -X POST -H "Content-Type: application/json" -d ' {"jsonrpc":"2.0","id":1, "method":"getHealth"}' http://$EC2_INTERNAL_IP:8899 | jq .error.data)
    SOLANA_SLOTS_BEHIND=$(echo $SOLANA_SLOTS_BEHIND_DATA | jq .numSlotsBehind -r)

    if [ "$SOLANA_SLOTS_BEHIND" == "null" ] || [ -z "$SOLANA_SLOTS_BEHIND" ]
    then
        SOLANA_SLOTS_BEHIND=0
    fi

    if [ $SOLANA_SLOTS_BEHIND -gt 100 ]
    then
        if systemctl is-active --quiet net-rules; then
            systemctl stop net-rules
        fi
    fi

    if [ $SOLANA_SLOTS_BEHIND -eq 0 ]
    then
        if ! systemctl is-active --quiet net-rules; then
            systemctl start net-rules
        fi
    fi
fi
