#!/bin/bash

SCROLL_SYNC_STATS=$(curl -s -X POST -H "Content-Type: application/json" --data '{"jsonrpc":"2.0","method":"eth_syncing","params":[],"id":1}' http://localhost:8545 | jq -r ".result")

if [[ "$SCROLL_SYNC_STATS" == "false" ]]; then
    SCROLL_SYNC_BLOCK_HEX=$(curl -s -X POST -H "Content-Type: application/json" --data '{"jsonrpc":"2.0","method":"eth_blockNumber","params":[],"id":1}' http://localhost:8545 | jq -r ".result")
    SCROLL_HIGHEST_BLOCK_HEX=$SCROLL_SYNC_BLOCK_HEX
else
    SCROLL_SYNC_BLOCK_HEX=$(echo $SCROLL_SYNC_STATS | jq -r ".currentBlock")
    SCROLL_HIGHEST_BLOCK_HEX=$(echo $SCROLL_SYNC_STATS | jq -r ".highestBlock")
fi

SCROLL_HIGHEST_BLOCK=$(echo $((${SCROLL_HIGHEST_BLOCK_HEX})))
SCROLL_SYNC_BLOCK=$(echo $((${SCROLL_SYNC_BLOCK_HEX})))
SCROLL_BLOCKS_BEHIND="$((SCROLL_HIGHEST_BLOCK-SCROLL_SYNC_BLOCK))"

# Sending data to CloudWatch
TOKEN=$(curl -s -X PUT "http://169.254.169.254/latest/api/token" -H "X-aws-ec2-metadata-token-ttl-seconds: 21600")
INSTANCE_ID=$(curl -H "X-aws-ec2-metadata-token: $TOKEN" -s http://169.254.169.254/latest/meta-data/instance-id)
REGION=$(curl -H "X-aws-ec2-metadata-token: $TOKEN" -s http://169.254.169.254/latest/dynamic/instance-identity/document | jq .region -r)
TIMESTAMP=$(date +"%Y-%m-%dT%H:%M:%S%:z")

aws cloudwatch put-metric-data --metric-name elc_sync_block --namespace CWAgent --value $SCROLL_SYNC_BLOCK --timestamp $TIMESTAMP --dimensions  InstanceId=$INSTANCE_ID --region $REGION
aws cloudwatch put-metric-data --metric-name elc_blocks_behind --namespace CWAgent --value $SCROLL_BLOCKS_BEHIND --timestamp $TIMESTAMP --dimensions  InstanceId=$INSTANCE_ID --region $REGION

# If the node is a sync node, check if the snapshot is already taken. If the snapshot is not taken, then take it and restart the node.
if [[ "$NODE_ROLE" == "sync-node" ]]; then
    if [ ! -f "/data/snapshotted" ]; then
        if [ "$SCROLL_SYNC_STATS" == "false"  ] && [ "$CONSENSUS_CLIENT_IS_SYNCING" == "false" ] && [ "$CONSENSUS_CLIENT_IS_OPTIMISTIC" == "false"  ]; then
                sudo /opt/copy-data-to-s3.sh

                # Take a snapshot once a day at midnight
                (sudo crontab -u root -l; echo '0 0 * * * /opt/copy-data-to-s3.sh' ) | sudo crontab -u root -
                sudo crontab -l
        fi
    fi
fi
