#!/bin/bash

FANTOM_SYNC_STATS=$(su bcuser -c '/home/bcuser/go-opera/build/opera attach --datadir=/data --exec "ftm.syncing"')
# Syncing status results:
#
#{
#  currentBlock: 37676547,
#  currentBlockHash: "0x0001ab120000187fd8069d3a4f6501d48ad4800778f40a76d79cf02469272a43",
#  currentBlockTime: "0x16ec7a4b9a82ebfe",
#  currentEpoch: "0x1ab13",
#  highestBlock: 82410549,
#  highestEpoch: "0x45f22",
#  knownStates: 0,
#  pulledStates: 0,
#  startingBlock: 0
#}
#
# Synced status results:
#
# false
#
# TODO: if a node falls behind, does it revert to syncing?

# If false, then get current block number:
if [ -n "$FANTOM_SYNC_STATS" ] && [ "$FANTOM_SYNC_STATS" != "false" ]; then
    FANTOM_SYNC_BLOCK=$(su bcuser -c '/home/bcuser/go-opera/build/opera attach --datadir=/data --exec "ftm.syncing.currentBlock"')
    FANTOM_HIGHEST_BLOCK=$(su bcuser -c '/home/bcuser/go-opera/build/opera attach --datadir=/data --exec "ftm.syncing.highestBlock"')

    FANTOM_BLOCKS_BEHIND="$((FANTOM_HIGHEST_BLOCK-FANTOM_SYNC_BLOCK))"

else
    FANTOM_SYNC_BLOCK=$(su bcuser -c '/home/bcuser/go-opera/build/opera attach --datadir=/data --exec "ftm.blockNumber"')
    FANTOM_BLOCKS_BEHIND=0
fi

# Sending data to CloudWatch
TOKEN=$(curl -s -X PUT "http://169.254.169.254/latest/api/token" -H "X-aws-ec2-metadata-token-ttl-seconds: 21600")
INSTANCE_ID=$(curl -H "X-aws-ec2-metadata-token: $TOKEN" -s http://169.254.169.254/latest/meta-data/instance-id)
REGION=$(curl -H "X-aws-ec2-metadata-token: $TOKEN" -s http://169.254.169.254/latest/dynamic/instance-identity/document | jq .region -r)
TIMESTAMP=$(date +"%Y-%m-%dT%H:%M:%S%:z")

aws cloudwatch put-metric-data --metric-name fantom_sync_block --namespace CWAgent --value $FANTOM_SYNC_BLOCK --timestamp $TIMESTAMP --dimensions  InstanceId=$INSTANCE_ID --region $REGION
aws cloudwatch put-metric-data --metric-name fantom_blocks_behind --namespace CWAgent --value $FANTOM_BLOCKS_BEHIND --timestamp $TIMESTAMP --dimensions  InstanceId=$INSTANCE_ID --region $REGION
