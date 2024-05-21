#!/bin/bash
set +e

source /etc/environment

echo "Downloading TZ snapshot from marigold."


TZ_SNAPSHOTS_FILE_NAME=snapshot
TZ_SNAPSHOTS_DIR=~/.tezos-node/node

wget -O /tmp/$TZ_SNAPSHOTS_FILE_NAME https://snapshots.tezos.marigold.dev/api/mainnet/rolling
octez-node snapshot import /tmp/$TZ_SNAPSHOTS_FILE_NAME --data-dir $TZ_SNAPSHOTS_DIR --no-check
rm /tmp/$TZ_SNAPSHOTS_FILE_NAME


echo "TZ snapshot is ready !!!"
