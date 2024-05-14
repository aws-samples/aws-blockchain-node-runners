#!/bin/bash

source /etc/environment
echo "Downloading snpashot"

cd /data

BASE_SNAPSHOT_FILE_NAME=snapshot.tar.gz
BASE_SNAPSHOT_DIR=/data/
BASE_SNAPSHOT_DOWNLOAD_STATUS=-1

if [ "$SNAPSHOT_URL" == "none" ] || [ -z "${SNAPSHOT_URL}" ]; then
  BASE_LATEST_SNAPSHOT_FILE_NAME=$(curl https://$NETWORK_ID-$NODE_CONFIG-snapshots.base.org/latest)
  SNAPSHOT_URL=https://$NETWORK_ID-$NODE_CONFIG-snapshots.base.org/$BASE_LATEST_SNAPSHOT_FILE_NAME
fi

while (( BASE_SNAPSHOT_DOWNLOAD_STATUS != 0 ))
do
        PIDS=$(pgrep wget)
        if [ -z "$PIDS" ]; then
                wget --continue --retry-connrefused --waitretry=66 --read-timeout=20 --output-document$BASE_SNAPSHOT_DIR/$BASE_SNAPSHOT_FILE_NAME -o download.log -t 0 $SNAPSHOT_URL
        fi
        BASE_SNAPSHOT_DOWNLOAD_STATUS=$?
        pid=$(pidof wget)
        wait $pid
        echo "wget exit."
        case $BASE_SNAPSHOT_DOWNLOAD_STATUS in
                2)
                        echo "CLI parsing error. Check variables."
                        exit 2
                        ;;
                3)
                        echo "File I/O error."
                        exit 3
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

tar -zxvf  $BASE_SNAPSHOT_DIR/$BASE_SNAPSHOT_FILE_NAME -C /data 2>&1 | tee unzip.log && echo "decompresed successfully..." || echo "decompression failed..." >> snapshots-decompression.log
echo "Decompresed snapshot ..."

mv /data/snapshots/$NETWORK_ID/download/* /data && \
rm -rf /data/snapshots && \
rm -rf /data/$BASE_SNAPSHOT_FILE_NAME

echo "Processed snapshot"

chown -R bcuser:bcuser /data && \
sudo su bcuser && \
/usr/local/bin/docker-compose -f /home/bcuser/node/docker-compose.yml up -d
