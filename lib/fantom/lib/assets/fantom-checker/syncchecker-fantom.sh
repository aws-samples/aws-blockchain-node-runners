#!/bin/bash

#FANTOM_SYNC_STATS=$(curl -s -X POST -H "Content-Type: application/json" --data '{"jsonrpc":"2.0","method":"ftm_syncing","params":[],"id":1}' http://localhost:18545 | jq -r ".result")

FANTOM_SYNC_STATS=$(su bcuser -c '/home/bcuser/go-opera/build/opera attach --datadir=/data --exec "ftm.syncing"')
# { currentBlock: 37676547,
# currentBlockHash: "0x0001ab120000187fd8069d3a4f6501d48ad4800778f40a76d79cf02469272a43",
# currentBlockTime: "0x16ec7a4b9a82ebfe",
# currentEpoch: "0x1ab13",
# highestBlock: 80196141,
# highestEpoch: "0x44343",
# knownStates: 0,
# pulledStates: 0,
# startingBlock: 0 }


# if [[ "$FANTOM_SYNC_STATS" == "false" ]]; then
#     FANTOM_SYNC_BLOCK_HEX=$(curl -s -X POST -H "Content-Type: application/json" --data '{"jsonrpc":"2.0","method":"eth_blockNumber","params":[],"id":1}' http://localhost:18545 | jq -r ".result")
#     FANTOM_HIGHEST_BLOCK_HEX=$FANTOM_SYNC_BLOCK_HEX
# else
#     FANTOM_SYNC_BLOCK_HEX=$(echo $FANTOM_SYNC_STATS | jq -r ".currentBlock")
#     FANTOM_HIGHEST_BLOCK_HEX=$(echo $FANTOM_SYNC_STATS | jq -r ".highestBlock")
# fi
FANTOM_SYNC_BLOCK=$(echo $FANTOM_SYNC_STATS | jq -r ".currentBlock")
FANTOM_HIGHEST_BLOCK=$(echo $FANTOM_SYNC_STATS | jq -r ".highestBlock")

# FANTOM_HIGHEST_BLOCK=$(echo $((${FANTOM_HIGHEST_BLOCK_HEX})))
# FANTOM_SYNC_BLOCK=$(echo $((${FANTOM_SYNC_BLOCK_HEX})))
FANTOM_BLOCKS_BEHIND="$((FANTOM_HIGHEST_BLOCK-FANTOM_SYNC_BLOCK))"

# Sending data to CloudWatch
TOKEN=$(curl -s -X PUT "http://169.254.169.254/latest/api/token" -H "X-aws-ec2-metadata-token-ttl-seconds: 21600")
INSTANCE_ID=$(curl -H "X-aws-ec2-metadata-token: $TOKEN" -s http://169.254.169.254/latest/meta-data/instance-id)
REGION=$(curl -H "X-aws-ec2-metadata-token: $TOKEN" -s http://169.254.169.254/latest/dynamic/instance-identity/document | jq .region -r)
TIMESTAMP=$(date +"%Y-%m-%dT%H:%M:%S%:z")

aws cloudwatch put-metric-data --metric-name fantom_sync_block --namespace CWAgent --value $FANTOM_SYNC_BLOCK --timestamp $TIMESTAMP --dimensions  InstanceId=$INSTANCE_ID --region $REGION
aws cloudwatch put-metric-data --metric-name fantom_blocks_behind --namespace CWAgent --value $FANTOM_BLOCKS_BEHIND --timestamp $TIMESTAMP --dimensions  InstanceId=$INSTANCE_ID --region $REGION
