#!/bin/bash
set +e

source /etc/environment

echo "Downloading Snapshot."

cd /data

SNAPSHOT_FILE_NAME=snapshot.tar.gz
SNAPSHOT_DIR=/data
SNAPSHOT_DOWNLOAD_STATUS=-1

# take about 1 hour to download the Snapshot
while (( SNAPSHOT_DOWNLOAD_STATUS != 0 ))
do
        PIDS=$(pgrep aria2c)
        if [ -z "$PIDS" ]; then
            aria2c $SNAPSHOT_URL -d $SNAPSHOT_DIR -o $SNAPSHOT_FILE_NAME -l /data/download.log --log-level=notice --allow-overwrite=true --allow-piece-length-change=true
        fi
        SNAPSHOT_DOWNLOAD_STATUS=$?
        pid=$(pidof aria2c)
        wait $pid
        echo "aria2c exit."
        case $SNAPSHOT_DOWNLOAD_STATUS in
                3)
                        echo "File does not exist."
                        exit 3
                        ;;
                9)
                        echo "No space left on device."
                        exit 9
                        ;;
                *)
                        continue
                        ;;
        esac
done
echo "Downloading Snapshot script finished"

sleep 60

echo "Starting snapshot decompression ..."

tar -xvf  $SNAPSHOT_DIR/$SNAPSHOT_FILE_NAME -C /data 2>&1 | tee unzip.log && echo "decompresed successfully..." || echo "decompression failed..." >> snapshots-decompression.log

echo "Decompresed snapshot, cleaning up..."

rm -f /data/juno
mv /data/juno_$STARKNET_NETWORK_ID /data/juno && \
rm -rf $SNAPSHOT_DIR/$SNAPSHOT_FILE_NAME

echo "Snapshot is ready, starting the service.."

chown -R ubuntu:ubuntu /data

sudo systemctl daemon-reload
sudo systemctl enable --now starknet
