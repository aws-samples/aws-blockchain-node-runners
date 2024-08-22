#!/bin/bash


THETA_BLOCK_HEIGHT=`curl -X POST -H 'Content-Type: application/json' --data '{"jsonrpc":"2.0","method":"edgecore.GetStatus","params":[],"id":1}' http://localhost:17888/rpc | jq -r ".result.current_height"`

# Sending data to CloudWatch
TOKEN=$(curl -s -X PUT "http://169.254.169.254/latest/api/token" -H "X-aws-ec2-metadata-token-ttl-seconds: 21600")
INSTANCE_ID=$(curl -H "X-aws-ec2-metadata-token: $TOKEN" -s http://169.254.169.254/latest/meta-data/instance-id)
REGION=$(curl -H "X-aws-ec2-metadata-token: $TOKEN" -s http://169.254.169.254/latest/dynamic/instance-identity/document | jq .region -r)
TIMESTAMP=$(date +"%Y-%m-%dT%H:%M:%S%:z")

aws cloudwatch put-metric-data --metric-name theta_current_block_height --namespace CWAgent --value $THETA_BLOCK_HEIGHT --timestamp $TIMESTAMP --dimensions  InstanceId=$INSTANCE_ID --region $REGION

curl -X POST -H 'Content-Type: application/json' --data '{"jsonrpc":"2.0","method":"edgecore.GetPeers","params":[],"id":1}' http://localhost:17888/rpc | jq -rc ".result.peers[]" | while IFS=$'\n' read -r peer; do
     aws cloudwatch put-metric-data --metric-name edge_peer --namespace CWAgent --value 1 --timestamp $TIMESTAMP --dimensions  InstanceId=$INSTANCE_ID,PeerAddress=$peer --region $REGION --output text
done;
