#!/bin/bash
set +e

source /etc/environment

echo "Downloading Snapshot."

cd /data

SNAPSHOT_FILE_NAME=snapshot.tar.gz
SNAPSHOT_DIR=/data

LATEST_SNAPSHOT_FILE_NAME=$(curl https://$NETWORK_ID-$NODE_CONFIG-snapshots.base.org/latest) && \
s5cmd --log error cp s3://base-snapshots-$NETWORK_ID-archive/$LATEST_SNAPSHOT_FILE_NAME $SNAPSHOT_DIR/$SNAPSHOT_FILE_NAME && \
echo "Downloading Snapshot script finished" && \
sleep 60 &&\
echo "Starting snapshot decompression ..." && \
tar -zxvf  $SNAPSHOT_DIR/$SNAPSHOT_FILE_NAME -C /data 2>&1 | tee unzip.log && echo "decompresed successfully..." || echo "decompression failed..." >> snapshots-decompression.log

echo "Decompresed snapshot, cleaning up..."

mv /data/snapshots/$NETWORK_ID/download/* $SNAPSHOT_DIR && \
rm -rf /data/snapshots && \
rm -rf $SNAPSHOT_DIR/$SNAPSHOT_FILE_NAME

echo "Snapshot is ready, starting the service.."

chown -R bcuser:bcuser $SNAPSHOT_DIR

sudo systemctl daemon-reload
sudo systemctl enable --now base