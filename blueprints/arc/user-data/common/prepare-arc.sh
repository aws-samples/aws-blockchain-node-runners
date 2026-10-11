#!/bin/bash
# Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
# SPDX-License-Identifier: Apache-2.0

# One-time Arc node preparation, run as the node service's ExecStartPre.
#
# 1. Restore the Circle-published snapshot pair (EL + CL). Arc cannot sync
#    from genesis. arc-snapshots (shipped in the execution image) resolves the
#    newest complete storage-v2 pair from https://snapshots.arc.network,
#    downloads and extracts it. Upstream's compose re-runs it on every start,
#    which re-downloads the whole EL whenever Circle publishes a newer snapshot
#    (every ~4 h); the sentinel below makes it run exactly once per volume.
# 2. Generate the CL network-identity key (idempotent; never overwritten).
#
# Inputs (arc.env written by node.sh): ARC_CHAIN, ARC_EL_IMAGE, ARC_CL_IMAGE.

set -euo pipefail

: "${ARC_CHAIN:?}" "${ARC_EL_IMAGE:?}" "${ARC_CL_IMAGE:?}"

# Kept outside /data/arc so it is never inside a layer that a forced restore
# rebuilds. /data is owned by bcuser, the service user.
SENTINEL=/data/.arc-snapshot-restored

if [ ! -f "$SENTINEL" ]; then
    echo "Restoring ${ARC_CHAIN} snapshot (EL profile: full)..."
    restored=false
    for attempt in 1 2 3; do
        # After an interrupted download arc-snapshots refuses to touch the
        # partially restored layers unless --force is given.
        force=""
        [ "$attempt" -gt 1 ] && force="--force"
        if docker run --rm --name arc-snapshots --user 1002:1002 \
            --security-opt no-new-privileges:true \
            -v /data/arc:/data \
            --entrypoint /usr/local/bin/arc-snapshots \
            "$ARC_EL_IMAGE" \
            download \
            --chain="$ARC_CHAIN" \
            --el-profile=full \
            --execution-path=/data/execution \
            --consensus-path=/data/consensus \
            $force; then
            restored=true
            break
        fi
        echo "Snapshot restore attempt $attempt failed; retrying in 60s with --force..."
        sleep 60
    done
    if [ "$restored" != "true" ]; then
        echo "ERROR: snapshot restore failed after 3 attempts" >&2
        exit 1
    fi
    touch "$SENTINEL"
    echo "Snapshot restored"
else
    echo "Snapshot already restored ($SENTINEL); skipping download"
fi

# CL key: `init` skips an existing key file and never overwrites it.
docker run --rm --name arc-consensus-init --user 1002:1002 \
    --security-opt no-new-privileges:true \
    -v /data/arc/consensus:/data/consensus \
    "$ARC_CL_IMAGE" \
    init --home=/data/consensus

# Clear stale IPC sockets left by an unclean stop.
find /data/arc/run -maxdepth 1 -name '*.ipc' -delete 2>/dev/null || true
