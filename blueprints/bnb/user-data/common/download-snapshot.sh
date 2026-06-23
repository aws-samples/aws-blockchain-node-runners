#!/bin/bash
# Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
# SPDX-License-Identifier: Apache-2.0

# BNB Smart Chain - 48Club Snapshot Download Helper
# Shared by all BNB client configurations (geth, reth).
#
# Usage: download-snapshot.sh <client> <snapshot_type>
#   client:        "geth" or "reth" — selects the top-level key in data.json
#   snapshot_type:  sub-key under the client (e.g. "local", "none", "full", "archive")
#
# Environment variables (from /etc/cdk_environment):
#   BC_NETWORK              — must be "mainnet" (snapshots only available for mainnet)
#   BNB_DOWNLOAD_SNAPSHOT   — "true" to enable, anything else to skip
#
# The script:
#   1. Fetches 48Club data.json
#   2. Extracts the download URL for the given client.snapshot_type
#   3. Downloads with aria2c (16 connections)
#   4. Extracts with zstd (--long=31 required by 48Club compression)
#   5. Writes /data/snapshot_downloaded sentinel on success
#
# Exit codes:
#   0 — snapshot downloaded and extracted, OR skipped (already done / not enabled)
#   1 — fatal error during download or extraction

set -eo pipefail

CLIENT="${1:?Usage: download-snapshot.sh <client> <snapshot_type>}"
SNAPSHOT_TYPE="${2:?Usage: download-snapshot.sh <client> <snapshot_type>}"

source /etc/cdk_environment 2>/dev/null || true
source /opt/assets/common/snapshot-staging.sh 2>/dev/null || true

# Ensure staging volume is always cleaned up, even on unexpected exit.
# Without this trap, any exit 1 after staging_mount() leaves the volume
# attached and incurring cost indefinitely.
#
# Do NOT mask the cleanup result: staging_cleanup now returns non-zero and logs
# an ERROR when it cannot confirm the volume was deleted. We surface that failure
# loudly (so an orphaned volume is visible in cloud-init-output / CloudWatch) but
# do not fail the node — the snapshot itself may have extracted successfully.
trap 'staging_cleanup || echo "ERROR: staging cleanup did not confirm volume deletion — check for an orphaned EBS volume tagged Purpose=snapshot-staging"' EXIT

BNB_DOWNLOAD_SNAPSHOT="${BNB_DOWNLOAD_SNAPSHOT:-false}"
if [ "$BNB_DOWNLOAD_SNAPSHOT" != "true" ] || [ "$BC_NETWORK" != "mainnet" ]; then
    echo "Snapshot download not enabled or not mainnet, skipping"
    exit 0
fi

if [ -f /data/snapshot_downloaded ]; then
    echo "Snapshot already downloaded, skipping"
    exit 0
fi

echo "Downloading BSC ${CLIENT} snapshot (type: ${SNAPSHOT_TYPE})..."
apt-get install -y -qq zstd pv aria2

# Fetch 48Club snapshot metadata
SNAPSHOT_DATA=$(curl -s https://raw.githubusercontent.com/48Club/bsc-snapshots/main/data.json)
SNAPSHOT_URL=$(echo "$SNAPSHOT_DATA" | jq -r ".${CLIENT}.${SNAPSHOT_TYPE}.link // empty")
SNAPSHOT_MD5=$(echo "$SNAPSHOT_DATA" | jq -r ".${CLIENT}.${SNAPSHOT_TYPE}.md5 // empty")

if [ -z "$SNAPSHOT_URL" ]; then
    echo "WARNING: ${CLIENT}.${SNAPSHOT_TYPE} snapshot not available from 48Club"
    echo "Available keys:"
    echo "$SNAPSHOT_DATA" | jq -r "keys[]" 2>/dev/null || true
    exit 1
fi

# Enforce HTTPS: the snapshot is downloaded and extracted as root, so it must
# arrive over an authenticated, integrity-protected channel.
case "$SNAPSHOT_URL" in
    https://*) ;;
    *)
        echo "ERROR: refusing non-HTTPS snapshot URL: $SNAPSHOT_URL"
        exit 1
        ;;
esac

echo "Snapshot URL: $SNAPSHOT_URL"

# Mount staging volume if configured (preserves /data space for extracted data)
staging_mount || {
    echo "WARNING: Staging volume mount failed, falling back to /data"
    STAGING_DOWNLOAD_PATH="/data"
}

cd "$STAGING_DOWNLOAD_PATH"

if ! aria2c -x 16 -s 16 --auto-file-renaming=false -o snapshot.tar.zst "$SNAPSHOT_URL"; then
    echo "WARNING: Snapshot download failed (aria2c exit code $?). Falling back to genesis sync."
    rm -f "$STAGING_DOWNLOAD_PATH/snapshot.tar.zst"
    exit 1
fi

# Verify integrity against the md5 published by 48Club in data.json (fetched
# above over HTTPS from GitHub). This protects against corruption, truncation,
# and on-the-wire tampering. On mismatch we refuse to extract and fall back to
# genesis sync rather than risk seeding the node with a bad/forged state.
# Note: md5 is weak against deliberate collisions but is what the provider
# publishes; it is adequate for integrity-against-corruption/transport.
if [ -n "$SNAPSHOT_MD5" ] && [ "$SNAPSHOT_MD5" != "null" ]; then
    echo "Verifying snapshot integrity (md5)..."
    ACTUAL_MD5=$(md5sum "$STAGING_DOWNLOAD_PATH/snapshot.tar.zst" | awk '{print $1}')
    if [ "$ACTUAL_MD5" != "$SNAPSHOT_MD5" ]; then
        echo "ERROR: snapshot md5 mismatch (expected ${SNAPSHOT_MD5}, got ${ACTUAL_MD5})."
        echo "Refusing to extract a snapshot that failed integrity verification. Falling back to genesis sync."
        rm -f "$STAGING_DOWNLOAD_PATH/snapshot.tar.zst"
        exit 1
    fi
    echo "Snapshot md5 verified: ${ACTUAL_MD5}"
else
    echo "WARNING: no md5 published for ${CLIENT}.${SNAPSHOT_TYPE} in 48Club data.json — skipping integrity verification"
fi

# Extract — --long=31 is required: 48Club compresses with large window sizes
pv "$STAGING_DOWNLOAD_PATH/snapshot.tar.zst" | tar --use-compress-program="zstd -d --long=31" -xf - -C /data/

# Remove archive (staging volume cleanup handled by EXIT trap)
rm -f "$STAGING_DOWNLOAD_PATH/snapshot.tar.zst"

# The tarball may extract into a subdirectory (e.g. server/data-seed/).
# Relocate the client data directory to /data/ if needed.
# For geth: look for geth/chaindata
# For reth: look for db/ (MDBX database directory)
case "$CLIENT" in
    geth)
        if [ ! -d /data/geth ]; then
            EXTRACTED=$(find /data -type d -name "chaindata" -path "*/geth/chaindata" 2>/dev/null | head -1 | sed 's|/geth/chaindata$||')
            if [ -n "$EXTRACTED" ] && [ "$EXTRACTED" != "/data" ]; then
                echo "Snapshot extracted to $EXTRACTED — moving geth/ to /data/"
                mv "$EXTRACTED/geth" /data/geth
                rm -rf "$EXTRACTED"
            elif [ -z "$EXTRACTED" ]; then
                echo "ERROR: Snapshot extraction failed — no geth/chaindata found under /data/"
                exit 1
            fi
        fi
        ;;
    reth)
        if [ ! -d /data/db ]; then
            EXTRACTED=$(find /data -type d -name "db" 2>/dev/null | head -1 | sed 's|/db$||')
            if [ -n "$EXTRACTED" ] && [ "$EXTRACTED" != "/data" ]; then
                echo "Snapshot extracted to $EXTRACTED — moving contents to /data/"
                mv "$EXTRACTED"/* /data/ 2>/dev/null || true
                rm -rf "$EXTRACTED"
            elif [ -z "$EXTRACTED" ]; then
                echo "WARNING: Could not locate reth db directory after extraction"
            fi
        fi
        ;;
esac

touch /data/snapshot_downloaded
echo "Snapshot downloaded and extracted successfully"
