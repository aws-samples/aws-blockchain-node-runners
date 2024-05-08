#!/bin/bash
set +e

source /etc/environment

echo "Downloading FANTOM snapshot."

cd /data

for FILE in `curl https://snapshot.fantom.network/files/snapsync/latest/listtgzfiles.txt`; do
        echo $FILE;
        axel -n 20 https://snapshot.fantom.network/files/snapsync/$FILE && \
        tar --use-compress-program="pigz -d" -xvf ${FILE##*/} && \
        rm ${FILE##*/} || \
        echo "Problem with downloading or expanding file $FILE"
done

echo "Downloading FANTOM snapshot finished"

echo "FANTOM snapshot is ready !!!"
