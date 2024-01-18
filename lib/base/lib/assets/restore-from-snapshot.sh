#!/bin/bash

source /etc/environment
TOKEN=$(curl -s -X PUT "http://169.254.169.254/latest/api/token" -H "X-aws-ec2-metadata-token-ttl-seconds: 21600")
INSTANCE_ID=$(curl -H "X-aws-ec2-metadata-token: $TOKEN" -s http://169.254.169.254/latest/meta-data/instance-id)
LATEST_SNAPSHOT_FILE_NAME=$(curl https://base-snapshots-$NETWORK_ID-archive.s3.amazonaws.com/latest)

echo "Sync started at " $(date)
SECONDS=0

s5cmd --log error cp s3://base-snapshots-$NETWORK_ID-archive/$LATEST_SNAPSHOT_FILE_NAME /data && \
tar -I zstdmt -xf /data/$LATEST_SNAPSHOT_FILE_NAME -C /data && \
mv /data/snapshots/$NETWORK_ID/download/* /data && \
rm -rf /data/snapshots && \
rm -rf /data/$LATEST_SNAPSHOT_FILE_NAME

chown -R bcuser:bcuser /data && \
echo "Sync finished at " $(date) && \
echo "$(($SECONDS / 60)) minutes and $(($SECONDS % 60)) seconds elapsed." && \
sudo su bcuser && \
/usr/local/bin/docker-compose -f /home/bcuser/node/docker-compose.yml up -d