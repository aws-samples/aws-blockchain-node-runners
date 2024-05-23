#!/bin/bash

source /etc/environment

# Get local IP
TOKEN=$(curl -s -X PUT "http://169.254.169.254/latest/api/token" -H "X-aws-ec2-metadata-token-ttl-seconds: 21600")
export EC2_INTERNAL_IP=$(curl -H "X-aws-ec2-metadata-token: $TOKEN" -s "http://169.254.169.254/latest/meta-data/local-ipv4")

# Start Juno node
/home/ubuntu/juno-source/build/juno \
    --db-path "/data/juno" \
    --http \
    --http-host "${EC2_INTERNAL_IP}" \
    --http-port 6060 \
    --network ${STARKNET_NETWORK_ID} \
    --eth-node ${STARKNET_L1_ENDPOINT}
