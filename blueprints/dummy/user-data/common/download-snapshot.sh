#!/bin/bash
# Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
# SPDX-License-Identifier: Apache-2.0

# Dummy - Snapshot Staging Debug Helper
#
# Purpose: exercise the FULL snapshot staging lifecycle
#   (mount -> download -> extract -> unmount -> detach -> delete)
# cheaply and quickly, so the staging_cleanup() behavior can be regression-tested
# WITHOUT a multi-TB real snapshot download.
#
# It reuses the REAL shared helper (assets/common/snapshot-staging.sh) — the same
# staging_mount()/staging_cleanup() used by Base and BNB — so this validates the
# actual cleanup code, not a mock.
#
# Instead of downloading a real archive, it generates a small SYNTHETIC archive
# on the staging volume, extracts it to /data, and then lets the EXIT trap run
# the real cleanup. The final result is logged as a single greppable line:
#   STAGING DEBUG: PASS
#   STAGING DEBUG: FAIL (orphaned volume <id>)
#
# Environment variables (from /etc/cdk_environment):
#   SNAPSHOT_ENABLED            — "true" to run the debug path
#   SNAPSHOT_STAGING_VOL_SIZE   — >0 to actually create/exercise a staging volume
#                                 (0/unset => no-op, matching production)
#
# Exit codes:
#   0 — debug path completed (cleanup result reported separately via STAGING DEBUG)
#   0 — skipped (not enabled)

set -eo pipefail

source /etc/cdk_environment 2>/dev/null || true
source /opt/assets/common/snapshot-staging.sh 2>/dev/null || true

# Capture the cleanup result on exit and emit a single greppable verdict line.
# We deliberately do not abort on cleanup failure — we report it so a developer
# or an automated check can detect an orphaned volume.
_staging_debug_report() {
    local rc=$?
    if [ "${STAGING_DEBUG_RAN:-false}" != "true" ]; then
        return 0
    fi
    if staging_cleanup; then
        echo "STAGING DEBUG: PASS"
    else
        echo "STAGING DEBUG: FAIL (orphaned volume ${SNAPSHOT_STAGING_VOL_ID:-unknown})"
    fi
    return $rc
}
trap '_staging_debug_report' EXIT

SNAPSHOT_ENABLED="${SNAPSHOT_ENABLED:-false}"
STAGING_VOL_SIZE="${SNAPSHOT_STAGING_VOL_SIZE:-0}"

if [ "$SNAPSHOT_ENABLED" != "true" ]; then
    echo "STAGING DEBUG: snapshot not enabled, skipping debug path"
    exit 0
fi

# No-op when staging is disabled — mirrors production backward compatibility.
if [ "$STAGING_VOL_SIZE" -eq 0 ] 2>/dev/null; then
    echo "STAGING DEBUG: SNAPSHOT_STAGING_VOL_SIZE=0, staging disabled — no volume to exercise"
    exit 0
fi

echo "STAGING DEBUG: starting staging lifecycle exercise (vol size ${STAGING_VOL_SIZE} GiB)"

apt-get install -y -qq zstd 2>/dev/null || true

# Mount the staging volume using the real helper.
staging_mount || {
    echo "STAGING DEBUG: staging_mount failed — falling back to /data (no volume to clean up)"
    exit 0
}

# From here on, a staging volume exists and MUST be cleaned up — arm the report.
STAGING_DEBUG_RAN="true"

# Generate a small synthetic archive on the staging volume (a few hundred MB),
# then extract it to /data. This drives a realistic write -> extract cycle
# without downloading anything.
SYN_DIR="$STAGING_DOWNLOAD_PATH/synthetic"
mkdir -p "$SYN_DIR"
dd if=/dev/zero of="$SYN_DIR/payload.bin" bs=1M count=256 2>/dev/null
tar -I zstd -cf "$STAGING_DOWNLOAD_PATH/snapshot-archive" -C "$SYN_DIR" payload.bin
rm -rf "$SYN_DIR"

echo "STAGING DEBUG: extracting synthetic archive to /data..."
mkdir -p /data
tar -I zstd -xf "$STAGING_DOWNLOAD_PATH/snapshot-archive" -C /data/
rm -f "$STAGING_DOWNLOAD_PATH/snapshot-archive"

echo "STAGING DEBUG: synthetic extract complete; cleanup will run on exit"
# The EXIT trap (_staging_debug_report) runs the real staging_cleanup and emits
# the PASS/FAIL verdict.
exit 0
