#!/bin/bash
set +e

source /etc/environment

systemctl stop node.service

s5cmd sync ~/.tezos-node/ s3://$S3_SYNC_BUCKET/
echo "Synced node to S3"

systemctl start node.service