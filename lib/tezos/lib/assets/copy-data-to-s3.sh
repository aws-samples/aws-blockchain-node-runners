#!/bin/bash
set +e

source /etc/environment
# aws s3 sync ~/.tezos-node/ s3://$S3_SYNC_BUCKET/
s5cmd sync /home/tezos/.tezos-node/ s3://$S3_SYNC_BUCKET/node/

echo "Synced node to S3"

systemctl start node.service