#!/bin/bash
set +e

source /etc/environment

echo "Downloading BSC snapshot from 46Club."

cd /data

BSC_SNAPSHOTS_FILE_NAME=geth.tar.zst
BSC_SNAPSHOTS_DIR=/data/
BSC_SNAPSHOTS_DOWNLOAD_STATUS=-1

if [ "$BSC_SNAPSHOTS_URI" == "none" ]; then
  BSC_SNAPSHOTS_URI=$(curl https://raw.githubusercontent.com/48Club/bsc-snapshots/main/data.json | jq -r .hash.local.link)
fi

# take about 1 hour to download the bsc snapshot
while (( BSC_SNAPSHOTS_DOWNLOAD_STATUS != 0 ))
do
        PIDS=$(pgrep aria2c)
        if [ -z "$PIDS" ]; then
                aria2c -s14 -x14 -k100M $BSC_SNAPSHOTS_URI -d $BSC_SNAPSHOTS_DIR -o $BSC_SNAPSHOTS_FILE_NAME
        fi
        BSC_SNAPSHOTS_DOWNLOAD_STATUS=$?
        pid=$(pidof aria2c)
        wait $pid
        echo "aria2c exit."
        case $BSC_SNAPSHOTS_DOWNLOAD_STATUS in
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
echo "Downloading BSC snapshot from 46Club succeed"

sleep 60
# take about 2 hours to decompression the bsc snapshot
echo "Decompression BSC snapshot start ..."

zstd -cd geth.tar.zst | pv | tar xvf - 2>&1 | tee unzip.log && echo "decompression success..." || echo "decompression failed..." >> bsc-snapshots-decompression.log
echo "Decompression BSC snapshot success ..."

mv /data/geth.full/geth /data/
sudo rm -rf /data/geth.full
sudo rm -rf /data/geth.tar.zst

echo "BSC snapshot is ready !!!"