#!/bin/bash
set +e

source /etc/environment

echo "Downloading TZ snapshot from $TZ_SNAPSHOTS_URI."


TZ_SNAPSHOTS_FILE_NAME=snapshot

mkdir /home/tezos/tezos-snapshots
wget -O /home/tezos/tezos-snapshots/$TZ_SNAPSHOTS_FILE_NAME $TZ_SNAPSHOTS_URI
octez-node snapshot import /home/tezos/tezos-snapshots/$TZ_SNAPSHOTS_FILE_NAME --data-dir=/data
rm /home/tezos/tezos-snapshots/$TZ_SNAPSHOTS_FILE_NAME


echo "TZ snapshot is ready !!!"
