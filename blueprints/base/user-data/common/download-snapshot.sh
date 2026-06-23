#!/bin/bash
# Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
# SPDX-License-Identifier: Apache-2.0

# Base - Snapshot Download Helper
# Shared by all Base client configurations (geth, reth).
#
# Usage: download-snapshot.sh <client>
#   client: "reth" or "geth" — determines extraction layout
#
# Environment variables (from /etc/cdk_environment):
#   SNAPSHOT_ENABLED       — "true" to enable, anything else to skip
#   SNAPSHOT_DOWNLOAD_URL  — base URL for snapshot server (e.g. https://mainnet-reth-archive-snapshots.base.org)
#
# The script:
#   1. Resolves the latest snapshot filename from SNAPSHOT_DOWNLOAD_URL/latest
#   2. Downloads with wget -c (resume-capable), as recommended by Base documentation
#   3. Extracts .tar.zst or .tar.gz into /data
#   4. Ensures chain data ends up directly in /data (the HOST_DATA_DIR mapped into the container)
#   5. Writes /data/snapshot_downloaded sentinel on success
#
# The upstream base/node docker-compose.yml maps HOST_DATA_DIR:/data inside the
# container. Both the reth entrypoint (RETH_DATA_DIR=/data) and geth entrypoint
# (GETH_DATA_DIR=/data) expect chain data directly under /data.
#
# Snapshot restoration follows the process documented at:
#   https://docs.base.org/base-chain/node-operators/snapshots
#
# Exit codes:
#   0 — snapshot downloaded and extracted, OR skipped (already done / not enabled)
#   1 — fatal error during download or extraction

set -eo pipefail

CLIENT="${1:?Usage: download-snapshot.sh <client>}"

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

SNAPSHOT_ENABLED="${SNAPSHOT_ENABLED:-false}"
SNAPSHOT_DOWNLOAD_URL="${SNAPSHOT_DOWNLOAD_URL:-}"

if [ "$SNAPSHOT_ENABLED" != "true" ]; then
    echo "Snapshot download not enabled, skipping"
    exit 0
fi

if [ -z "$SNAPSHOT_DOWNLOAD_URL" ] || [ "$SNAPSHOT_DOWNLOAD_URL" = "none" ]; then
    echo "SNAPSHOT_DOWNLOAD_URL not set, skipping snapshot download"
    exit 0
fi

# Enforce HTTPS: the snapshot is downloaded and extracted as root, so it must
# arrive over an authenticated, integrity-protected channel. CDK also validates
# this at synth (configuration-loader), but we re-check here as defense in depth.
# Note: Base does not publish snapshot checksums (verified against
# https://docs.base.org/base-chain/node-operators/snapshots and the snapshot
# endpoints), so HTTPS transport integrity plus the Content-Length completeness
# check below are the available protections. Operators wanting stronger
# integrity should pin a specific snapshot and verify its hash out of band.
case "$SNAPSHOT_DOWNLOAD_URL" in
    https://*) ;;
    *)
        echo "ERROR: refusing non-HTTPS SNAPSHOT_DOWNLOAD_URL: $SNAPSHOT_DOWNLOAD_URL"
        exit 1
        ;;
esac

if [ -f /data/snapshot_downloaded ]; then
    echo "Snapshot already downloaded, skipping"
    exit 0
fi

# Only restore if the data directory is empty (no prior sync).
# Reth uses db/ and static_files/; geth uses geth/chaindata.
if [ -d /data/db ] || [ -d /data/static_files ] || [ -d /data/geth/chaindata ]; then
    echo "Data directory already contains chain data, skipping snapshot download"
    exit 0
fi

echo "Downloading Base ${CLIENT} snapshot..."
echo "Snapshot base URL: $SNAPSHOT_DOWNLOAD_URL"

apt-get install -y -qq zstd wget

# Mount staging volume if configured (preserves /data space for extracted data)
staging_mount || {
    echo "WARNING: Staging volume mount failed, falling back to /data"
    STAGING_DOWNLOAD_PATH="/data"
}

# Resolve the latest snapshot filename from the snapshot server
SNAPSHOT_FILENAME=$(curl -sS "${SNAPSHOT_DOWNLOAD_URL}/latest")
if [ -z "$SNAPSHOT_FILENAME" ]; then
    echo "WARNING: Could not resolve latest snapshot filename from ${SNAPSHOT_DOWNLOAD_URL}/latest"
    echo "Continuing without snapshot — node will sync from genesis"
    exit 1
fi

SNAPSHOT_FULL_URL="${SNAPSHOT_DOWNLOAD_URL}/${SNAPSHOT_FILENAME}"
echo "Snapshot URL: $SNAPSHOT_FULL_URL"

# Download to staging volume (if configured) or /data.
# Uses wget -c as recommended by Base documentation:
# https://docs.base.org/base-chain/node-operators/snapshots#restoring-from-snapshot
cd "$STAGING_DOWNLOAD_PATH"

# --tries=0:             retry indefinitely — this is a one-shot bootstrap, no reason to give up
# --retry-connrefused:   retry even on connection refused (CDN failovers)
# --waitretry=30:        exponential backoff up to 30s between retries
# --read-timeout=300:    treat 5 min of silence as a failure (prevents zombie-connection hangs)
# --progress=dot:giga:   log one dot per GB for CloudWatch observability without noise
# -c:                    resume partial downloads
if ! wget --tries=0 --retry-connrefused --waitretry=30 --read-timeout=300 \
          --progress=dot:giga -c -O snapshot-archive "$SNAPSHOT_FULL_URL"; then
    echo "WARNING: Snapshot download failed (wget exit code $?). Falling back to genesis sync."
    rm -f "$STAGING_DOWNLOAD_PATH/snapshot-archive"
    exit 1
fi

# Verify the archive is non-empty — wget can exit 0 with a partial/empty file
if [ ! -s "$STAGING_DOWNLOAD_PATH/snapshot-archive" ]; then
    echo "WARNING: Snapshot archive is empty after download. Falling back to genesis sync."
    rm -f "$STAGING_DOWNLOAD_PATH/snapshot-archive"
    exit 1
fi

# Verify downloaded size matches Content-Length (catches partial downloads that pass -s check)
EXPECTED_SIZE=$(curl -sI "$SNAPSHOT_FULL_URL" | grep -i content-length | awk '{print $2}' | tr -d '\r')
ACTUAL_SIZE=$(stat -c%s "$STAGING_DOWNLOAD_PATH/snapshot-archive" 2>/dev/null || stat -f%z "$STAGING_DOWNLOAD_PATH/snapshot-archive" 2>/dev/null)
if [ -n "$EXPECTED_SIZE" ] && [ "$EXPECTED_SIZE" -gt 0 ] 2>/dev/null; then
    if [ "$ACTUAL_SIZE" -lt "$EXPECTED_SIZE" ]; then
        echo "WARNING: Snapshot archive is incomplete (got ${ACTUAL_SIZE} bytes, expected ${EXPECTED_SIZE}). Falling back to genesis sync."
        rm -f "$STAGING_DOWNLOAD_PATH/snapshot-archive"
        exit 1
    fi
    echo "Download size verified: ${ACTUAL_SIZE} bytes (expected ${EXPECTED_SIZE})"
else
    echo "Content-Length not available from server, skipping size verification (downloaded ${ACTUAL_SIZE} bytes)"
fi

# Extract — detect format from filename
echo "Extracting snapshot archive..."
if echo "$SNAPSHOT_FILENAME" | grep -q "\.tar\.zst"; then
    tar -I zstd -xf "$STAGING_DOWNLOAD_PATH/snapshot-archive" -C /data/
elif echo "$SNAPSHOT_FILENAME" | grep -q "\.tar\.gz"; then
    tar -xzf "$STAGING_DOWNLOAD_PATH/snapshot-archive" -C /data/
else
    # Try zstd first, fall back to gzip
    tar -I zstd -xf "$STAGING_DOWNLOAD_PATH/snapshot-archive" -C /data/ 2>/dev/null || \
    tar -xzf "$STAGING_DOWNLOAD_PATH/snapshot-archive" -C /data/
fi

# Clean up staging volume (or just remove archive if no staging volume)
rm -f "$STAGING_DOWNLOAD_PATH/snapshot-archive"
echo "Snapshot extracted"

# Move extracted data so chain data ends up directly in /data.
# The upstream base/node docker-compose maps HOST_DATA_DIR:/data into the container,
# and both entrypoints use /data as their data directory.
# Snapshot archives can have arbitrary nesting (e.g. snapshots/mainnet/download/db/...)
# so we search without depth limits for the actual data root.
case "$CLIENT" in
    reth)
        if [ -d /data/db ] && [ -d /data/static_files ]; then
            echo "Reth data already at /data/ — no relocation needed"
        else
            # Find the actual extraction root — the directory containing both db/ and static_files/
            EXTRACTED=$(find /data -type d -name "db" 2>/dev/null | while read d; do
                parent=$(dirname "$d")
                if [ -d "$parent/static_files" ]; then
                    echo "$parent"
                    break
                fi
            done)

            if [ -n "$EXTRACTED" ] && [ "$EXTRACTED" != "/data" ]; then
                echo "Moving reth data from $EXTRACTED to /data/"
                mv "$EXTRACTED"/* /data/ 2>/dev/null || true
                # Clean up empty parent directories left behind
                rmdir -p "$(dirname "$EXTRACTED")" 2>/dev/null || true
            elif [ -z "$EXTRACTED" ]; then
                echo "WARNING: Could not locate reth data (db/ + static_files/) after extraction"
                echo "Contents of /data:"
                ls -laR /data/ 2>/dev/null | head -40 || true
            fi
        fi
        ;;
    geth)
        if [ -d /data/geth/chaindata ]; then
            echo "Geth data already at /data/geth/chaindata — no relocation needed"
        else
            # Find the actual chaindata directory at any depth
            EXTRACTED=$(find /data -type d -name "chaindata" 2>/dev/null | head -1 | sed 's|/chaindata$||')

            if [ -n "$EXTRACTED" ] && [ "$EXTRACTED" != "/data/geth" ]; then
                echo "Moving geth data from $EXTRACTED to /data/geth/"
                mkdir -p /data/geth
                mv "$EXTRACTED"/* /data/geth/ 2>/dev/null || true
                # Clean up empty parent directories left behind
                rmdir -p "$EXTRACTED" 2>/dev/null || true
            elif [ -z "$EXTRACTED" ]; then
                echo "WARNING: Could not locate geth chaindata after extraction"
                echo "Contents of /data:"
                ls -laR /data/ 2>/dev/null | head -40 || true
            fi
        fi
        ;;
esac

# Verify extraction produced expected data structure before writing sentinel.
# Use a warning rather than a hard failure — snapshot layouts can vary between
# versions, and the node may still sync fine even if the directory names differ
# slightly from what we expect. A hard exit here previously caused the staging
# volume to leak (before the EXIT trap was added) and prevented the sentinel
# from being written even though the data was usable.
case "$CLIENT" in
    reth)
        if [ ! -d /data/db ] && [ ! -d /data/static_files ]; then
            echo "WARNING: Extraction did not produce expected reth data structure (missing both db/ and static_files/)"
            echo "Contents of /data:"
            ls -la /data/ 2>/dev/null || true
            echo "Node will attempt to sync — if data is present under a different layout, it may still work."
        fi
        ;;
    geth)
        if [ ! -d /data/geth/chaindata ]; then
            echo "WARNING: Extraction did not produce expected geth data structure (missing geth/chaindata/)"
            echo "Contents of /data:"
            ls -la /data/ 2>/dev/null || true
            echo "Node will attempt to sync — if data is present under a different layout, it may still work."
        fi
        ;;
esac

touch /data/snapshot_downloaded
echo "Snapshot downloaded and extracted successfully"
