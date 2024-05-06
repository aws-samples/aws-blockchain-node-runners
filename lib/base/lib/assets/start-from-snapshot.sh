#!/bin/bash

source /etc/environment
echo "Downloading snpashot"

cd /data

BASE_SNAPSHOT_FILE_NAME=snalshot.tar.gz
BASE_SNAPSHOT_DIR=/data/
BASE_SNAPSHOT_DOWNLOAD_STATUS=-1
BASE_LATEST_SNAPSHOT_FILE_NAME=$(curl https://$NETWORK_ID-$NODE_CONFIG-snapshots.base.org/latest)

if [ "$SNAPSHOT_URL" == "none" ] || [ -z "${SNAPSHOT_URL}" ]; then
  SNAPSHOT_URL=https://$NETWORK_ID-$NODE_CONFIG-snapshots.base.org/$BASE_LATEST_SNAPSHOT_FILE_NAME
fi

while (( BASE_SNAPSHOT_DOWNLOAD_STATUS != 0 ))
do
        PIDS=$(pgrep aria2c)
        if [ -z "$PIDS" ]; then
                aria2c -x3 $SNAPSHOT_URL -d $BASE_SNAPSHOT_DIR -o $BASE_SNAPSHOT_FILE_NAME -l aria2c.log --log-level=warn --allow-piece-length-change=true
        fi
        BASE_SNAPSHOT_DOWNLOAD_STATUS=$?
        pid=$(pidof aria2c)
        wait $pid
        echo "aria2c exit."
        case $BASE_SNAPSHOT_DOWNLOAD_STATUS in
                3)
                        echo "file not exist."
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

echo "Downloading snapshot succeed"

sleep 60
# take about 2 hours to decompress the snapshot
echo "Decompression snapshot start ..."

tar -I zstdmt -xf  $BASE_SNAPSHOT_DIR/$BASE_SNAPSHOT_FILE_NAME -C /data 2>&1 | tee unzip.log && echo "decompression success..." || echo "decompression failed..." >> snapshots-decompression.log
echo "Decompressing snapshot success ..."

mv /data/snapshots/$NETWORK_ID/download/* /data && \
rm -rf /data/snapshots && \
rm -rf /data/$BASE_SNAPSHOT_FILE_NAME

echo "Snapshot is ready !!!"

chown -R bcuser:bcuser /data && \
sudo su bcuser && \
/usr/local/bin/docker-compose -f /home/bcuser/node/docker-compose.yml up -d
