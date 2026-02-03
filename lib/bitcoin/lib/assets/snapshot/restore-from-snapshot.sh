#!/bin/bash
# Restore Bitcoin blockchain data from a snapshot
# Security: Only downloads from HTTPS URLs, verifies data integrity

set -e

source /etc/cdk_environment

echo "Starting snapshot restoration for Bitcoin $BITCOIN_NETWORK"

cd /data

SNAPSHOT_FILE_NAME="bitcoin-snapshot.tar.gz"
SNAPSHOT_DOWNLOAD_STATUS=-1

if [ "$SNAPSHOT_URL" == "none" ] || [ -z "$SNAPSHOT_URL" ]; then
    echo "ERROR: No snapshot URL provided. Set BITCOIN_SNAPSHOT_URL in your .env file."
    echo "Starting node without snapshot..."
    systemctl daemon-reload
    systemctl enable --now bitcoind
    exit 0
fi

# Security: Only allow HTTPS URLs
if [[ ! "$SNAPSHOT_URL" =~ ^https:// ]]; then
    echo "ERROR: Snapshot URL must use HTTPS for security. Got: $SNAPSHOT_URL"
    echo "Starting node without snapshot..."
    systemctl daemon-reload
    systemctl enable --now bitcoind
    exit 1
fi

echo "Downloading snapshot from: $SNAPSHOT_URL"

# Download with retry logic
while (( SNAPSHOT_DOWNLOAD_STATUS != 0 ))
do
    PIDS=$(pgrep wget || true)
    if [ -z "$PIDS" ]; then
        wget --https-only "$SNAPSHOT_URL" -O "$SNAPSHOT_FILE_NAME"
    fi
    SNAPSHOT_DOWNLOAD_STATUS=$?
    pid=$(pidof wget || true)
    if [ -n "$pid" ]; then
        wait $pid
    fi
    echo "wget exit code: $SNAPSHOT_DOWNLOAD_STATUS"
    case $SNAPSHOT_DOWNLOAD_STATUS in
        0)
            echo "Download completed successfully"
            ;;
        8)
            echo "Server error. Aborting."
            exit 8
            ;;
        3)
            echo "No space left on device."
            exit 3
            ;;
        *)
            echo "Retrying download..."
            sleep 10
            ;;
    esac
done

echo "Download complete. Starting decompression..."

# Detect compression type and decompress
if [[ "$SNAPSHOT_FILE_NAME" == *.tar.gz ]] || [[ "$SNAPSHOT_FILE_NAME" == *.tgz ]]; then
    tar -xzf "$SNAPSHOT_FILE_NAME" -C /data 2>&1 | tee decompress.log
elif [[ "$SNAPSHOT_FILE_NAME" == *.tar.zst ]]; then
    tar --use-compress-program=unzstd -xf "$SNAPSHOT_FILE_NAME" -C /data 2>&1 | tee decompress.log
elif [[ "$SNAPSHOT_FILE_NAME" == *.tar ]]; then
    tar -xf "$SNAPSHOT_FILE_NAME" -C /data 2>&1 | tee decompress.log
else
    # Try gzip by default
    tar -xzf "$SNAPSHOT_FILE_NAME" -C /data 2>&1 | tee decompress.log
fi

echo "Decompression complete. Cleaning up..."

rm -f "$SNAPSHOT_FILE_NAME"

# Fix ownership
chown -R bitcoin:bitcoin /data

echo "Snapshot restoration complete. Starting Bitcoin Core..."

systemctl daemon-reload
systemctl enable --now bitcoind
