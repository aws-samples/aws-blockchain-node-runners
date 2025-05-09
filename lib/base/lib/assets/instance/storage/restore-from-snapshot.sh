#!/bin/bash
set +e

source /etc/cdk_environment

echo "Downloading Snapshot."

cd /data

SNAPSHOT_FILE_NAME=snapshot.tar.gz
SNAPSHOT_DIR=/data
SNAPSHOT_DOWNLOAD_STATUS=-1

if [ "$SNAPSHOT_URL" == "none" ] || [ -z "${SNAPSHOT_URL}" ]; then

  case $BASE_CLIENT in
    "geth")
      LATEST_SNAPSHOT_FILE_NAME=$(curl https://$NETWORK_ID-full-snapshots.base.org/latest)
      SNAPSHOT_URL=https://$NETWORK_ID-full-snapshots.base.org/$LATEST_SNAPSHOT_FILE_NAME
      ;;
    "reth")
      LATEST_SNAPSHOT_FILE_NAME=$(curl https://$NETWORK_ID-reth-archive-snapshots.base.org/latest)
      SNAPSHOT_URL=https://$NETWORK_ID-reth-archive-snapshots.base.org/$LATEST_SNAPSHOT_FILE_NAME
      ;;
    *)
      # Geth
      LATEST_SNAPSHOT_FILE_NAME=$(curl https://$NETWORK_ID-full-snapshots.base.org/latest)
      SNAPSHOT_URL=https://$NETWORK_ID-full-snapshots.base.org/$LATEST_SNAPSHOT_FILE_NAME
      ;;
  esac
fi

while (( SNAPSHOT_DOWNLOAD_STATUS != 0 ))
do
        PIDS=$(pgrep wget)
        if [ -z "$PIDS" ]; then
            wget $SNAPSHOT_URL -P $SNAPSHOT_DIR -O $SNAPSHOT_FILE_NAME
        fi
        SNAPSHOT_DOWNLOAD_STATUS=$?
        pid=$(pidof wget)
        wait $pid
        echo "wget exit."
        case $SNAPSHOT_DOWNLOAD_STATUS in
                8)
                        echo "Server error."
                        exit 8
                        ;;
                3)
                        echo "No space left on device."
                        exit 3
                        ;;
                *)
                        continue
                        ;;
        esac
done
echo "Downloading Snapshot script finished"

sleep 60

echo "Starting snapshot decompression ..."

tar --use-compress-program=unzstd -xvf  $SNAPSHOT_DIR/$SNAPSHOT_FILE_NAME -C /data 2>&1 | tee unzip.log && echo "decompressed successfully..." || echo "decompression failed..." >> snapshots-decompression.log

echo "Decompressed snapshot, cleaning up..."

mv /data/snapshots/$NETWORK_ID/download/* /data && \
rm -rf /data/snapshots && \
rm -rf $SNAPSHOT_DIR/$SNAPSHOT_FILE_NAME

echo "Snapshot is ready, starting the service.."

chown -R bcuser:bcuser /data

sudo systemctl daemon-reload
sudo systemctl enable --now node
