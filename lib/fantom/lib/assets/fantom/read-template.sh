#!/bin/bash
set -e
echo "Script is starting..."
ulimit -n 500000

# Get local IP
TOKEN=$(curl -s -X PUT "http://169.254.169.254/latest/api/token" -H "X-aws-ec2-metadata-token-ttl-seconds: 21600")
export EC2_INTERNAL_IP=$(curl -H "X-aws-ec2-metadata-token: $TOKEN" -s "http://169.254.169.254/latest/meta-data/local-ipv4")

# Start read node
/home/bcuser/go-opera/build/opera --genesis /data/genesis.g \
    --datadir /data \
    --maxpeers 110 \
    --cache 24000 \
    --nousb \
    --db.preset ldb-1 \
    --syncmode snap \
    --http --http.port=18545 --http.corsdomain="*" \
    --http.addr="${EC2_INTERNAL_IP}" \
    --http.api=eth,web3,net,txpool,ftm

echo "Script is still running..."
