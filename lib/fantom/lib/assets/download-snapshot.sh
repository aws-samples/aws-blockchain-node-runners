#!/bin/bash
set +e

source /etc/environment

echo "Downloading FANTOM snapshot."

cd /data

if [[ -n ${FANTOM_SNAPSHOTS_URI} && ${FANTOM_SNAPSHOTS_URI} != "none" ]]; then
        for FILE in `curl ${FANTOM_SNAPSHOTS_URI}`; do
                echo $FILE;
                axel -n 20 ${FANTOM_SNAPSHOTS_URI%%/latest/listtgzfiles.txt}/$FILE && \
                tar --use-compress-program="pigz -d" -xvf ${FILE##*/} && \
                rm ${FILE##*/} || \
                echo "Problem with downloading or expanding file $FILE"
        done
fi

echo "Downloading FANTOM snapshot finished"

echo "FANTOM snapshot is ready !!!"
