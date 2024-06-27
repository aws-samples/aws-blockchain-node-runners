#!/bin/bash
set +e

source /etc/environment
aws s3 sync ~/.tezos-node/ s3://$S3_SYNC_BUCKET/
echo "Synced node to S3"
