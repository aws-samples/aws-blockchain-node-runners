#!/bin/bash
set +e

source /etc/cdk_environment

echo "Downloading Snapshot."

cd /data

SNAPSHOT_FILE_NAME=snapshot.tar.gz
SNAPSHOT_DIR=/data
SNAPSHOT_DOWNLOAD_STATUS=-1

if [ "$SNAPSHOT_URL" == "none" ] || [ -z "${SNAPSHOT_URL}" ]; then
  LATEST_SNAPSHOT_FILE_NAME=$(curl https://$NETWORK_ID-$NODE_CONFIG-snapshots.base.org/latest)
  SNAPSHOT_URL=https://$NETWORK_ID-$NODE_CONFIG-snapshots.base.org/$LATEST_SNAPSHOT_FILE_NAME
fi

while (( SNAPSHOT_DOWNLOAD_STATUS != 0 ))
do
        PIDS=$(pgrep aria2c)
        if [ -z "$PIDS" ]; then
            aria2c --max-connection-per-server=1 $SNAPSHOT_URL -d $SNAPSHOT_DIR -o $SNAPSHOT_FILE_NAME -l /data/download.log --log-level=notice --allow-overwrite=true --allow-piece-length-change=true
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

tar --use-compress-program=unzstd -xvf  $SNAPSHOT_DIR/$SNAPSHOT_FILE_NAME -C /data 2>&1 | tee unzip.log && echo "decompresed successfully..." || echo "decompression failed..." >> snapshots-decompression.log

echo "Decompresed snapshot, cleaning up..."

mv /data/snapshots/$NETWORK_ID/download/* /data && \
rm -rf /data/snapshots && \
rm -rf $SNAPSHOT_DIR/$SNAPSHOT_FILE_NAME

echo "Snapshot is ready, starting the service.."

chown -R bcuser:bcuser /data

sudo systemctl daemon-reload
sudo systemctl enable --now node
