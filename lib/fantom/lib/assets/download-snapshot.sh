#!/bin/bash
set +e

source /etc/environment

echo "Downloading FANTOM snapshot from 46Club."

cd /data

FANTOM_SNAPSHOTS_FILE_NAME=geth.tar.zst
FANTOM_SNAPSHOTS_DIR=/data/
FANTOM_SNAPSHOTS_DOWNLOAD_STATUS=-1

if [ "$FANTOM_SNAPSHOTS_URI" == "none" ]; then
  FANTOM_SNAPSHOTS_URI=$(curl https://raw.githubusercontent.com/48Club/fantom-snapshots/main/data.json | jq -r .hash.local.link)
fi

# take about 1 hour to download the fantom snapshot
while (( FANTOM_SNAPSHOTS_DOWNLOAD_STATUS != 0 ))
do
        PIDS=$(pgrep aria2c)
        if [ -z "$PIDS" ]; then
                aria2c -s14 -x14 -k100M $FANTOM_SNAPSHOTS_URI -d $FANTOM_SNAPSHOTS_DIR -o $FANTOM_SNAPSHOTS_FILE_NAME
        fi
        FANTOM_SNAPSHOTS_DOWNLOAD_STATUS=$?
        pid=$(pidof aria2c)
        wait $pid
        echo "aria2c exit."
        case $FANTOM_SNAPSHOTS_DOWNLOAD_STATUS in
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
echo "Downloading FANTOM snapshot from 46Club succeed"

sleep 60
# take about 2 hours to decompression the fantom snapshot
echo "Decompression FANTOM snapshot start ..."

zstd -cd geth.tar.zst | pv | tar xvf - 2>&1 | tee unzip.log && echo "decompression success..." || echo "decompression failed..." >> fantom-snapshots-decompression.log
echo "Decompression FANTOM snapshot success ..."

mv /data/geth.full/geth /data/
sudo rm -rf /data/geth.full
sudo rm -rf /data/geth.tar.zst

echo "FANTOM snapshot is ready !!!"
