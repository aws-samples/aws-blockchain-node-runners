#!/bin/bash
# Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
# SPDX-License-Identifier: Apache-2.0

# blockchain-snapshots.sh - restore node data from Blockchain Snapshots on AWS
# (https://awslabs.github.io/blockchain-snapshots/) when SNAPSHOT_ENABLED=true
# and SNAPSHOT_PROVIDER=blockchain-snapshots. Called as root by a blueprint's
# node.sh before it starts node.service.
#
# Usage: blockchain-snapshots.sh <output-dir>
#   output-dir: where the snapshot goes. For filesystem snapshots this is the
#   client's data directory; for Solana it is the ledger directory, where
#   Agave finds the full and incremental snapshot archives.
#
# Reads from /etc/cdk_environment: SNAPSHOT_ID, AWS_REGION.
#
# Steps:
#   1. Check the Region's snapshot bucket is reachable (needs an S3 gateway
#      VPC endpoint), before anything is installed or downloaded.
#   2. Install the tool's dependencies from apt. The tool's own --setup is not
#      used: it downloads mountpoint-s3 "latest" and the AWS CLI without a
#      checksum, and the AWS CLI v2 is already installed by the bootstrap.
#   3. Fetch the tool at the pinned commit and verify HEAD is that commit.
#   4. Run snapshot.sh as bcuser so the node user owns the data, with the
#      registry read from the pinned checkout (the default registry URL follows
#      the project's main branch) and --source s3 (no mountpoint-s3).
#
# Markers next to the output directory make re-runs safe:
#   <output-dir>.snapshot-restored     restore finished (holds the --json result)
#   <output-dir>.snapshot-in-progress  restore started; a re-run deletes the
#                                      partial output and starts over
# A non-empty output directory without either marker holds data from
# elsewhere (for example a node that synced before snapshots were enabled)
# and is never overwritten.
#
# The in-progress marker is written before the first step that can fail, and
# a node.service drop-in (ConditionPathExists=!<in-progress marker>) keeps the
# node from starting until the restore finishes. Without both, a failed setup
# on an existing instance (for example an instance-store node after a stop and
# start) could start the client on the empty directory: the bootstrap restarts
# node.service after a failed setup, and the next boot would then find data
# without a marker and never restore.
#
# Exit codes: 0 restored or nothing to do; 1 restore failed.

set -o pipefail

SCRIPT_NAME="[blockchain-snapshots]"

# Pinned tool version. The repository publishes no releases, so a commit is
# the version. To upgrade: review the diff since this commit, update the
# commit here and BlockchainSnapshotsRegions in lib/interfaces/constants.ts
# (which mirrors dist/regions.json), and redeploy a test node.
BLOCKCHAIN_SNAPSHOTS_REPO="https://github.com/awslabs/blockchain-snapshots.git"
BLOCKCHAIN_SNAPSHOTS_COMMIT="7ebcf32ed8f343575cf31ca3f7e729d4d736b4e8"

CDK_ENV_FILE="${CDK_ENV_FILE:-/etc/cdk_environment}"
TOOL_DIR="${BLOCKCHAIN_SNAPSHOTS_TOOL_DIR:-/opt/blockchain-snapshots}"
NODE_SERVICE_DROPIN="${NODE_SERVICE_DROPIN:-/etc/systemd/system/node.service.d/blockchain-snapshots.conf}"
NODE_USER="bcuser"

log() { echo "$SCRIPT_NAME $*"; }
err() { echo "ERROR: $SCRIPT_NAME $*" >&2; }

# Keep node.service from starting while $1 (the in-progress marker) exists.
# A drop-in survives node.sh rewriting node.service, and a skipped condition
# is not a failure, so the unit's Restart= does not loop on it.
hold_node_service() {
    local marker=$1
    mkdir -p "$(dirname "$NODE_SERVICE_DROPIN")"
    cat > "$NODE_SERVICE_DROPIN" <<EOF
# Written by assets/common/blockchain-snapshots.sh: node.service does not
# start until the Blockchain Snapshots on AWS restore finishes.
[Unit]
ConditionPathExists=!$marker
EOF
    systemctl daemon-reload
}

release_node_service() {
    rm -f "$NODE_SERVICE_DROPIN"
    systemctl daemon-reload
}

check_bucket_reachable() {
    local bucket="blockchain-snapshots-$AWS_REGION"
    log "Checking access to s3://$bucket"
    if ! aws s3api head-bucket --bucket "$bucket" --region "$AWS_REGION" >/dev/null 2>&1; then
        err "cannot reach s3://$bucket. Blockchain Snapshots on AWS buckets are reachable only" \
            "through an Amazon S3 gateway VPC endpoint in this instance's VPC, associated with the" \
            "route table of its subnet. Create the endpoint, then reboot the instance to retry." \
            "See docs/blockchain-snapshots.md."
        return 1
    fi
}

install_dependencies() {
    log "Installing dependencies"
    while fuser /var/lib/dpkg/lock-frontend >/dev/null 2>&1; do
        sleep 5
    done
    DEBIAN_FRONTEND=noninteractive apt-get -yqq install git python3-boto3 python3-zstandard zstd tar curl
}

fetch_tool() {
    local attempt
    log "Fetching $BLOCKCHAIN_SNAPSHOTS_REPO at $BLOCKCHAIN_SNAPSHOTS_COMMIT"
    rm -rf "$TOOL_DIR"
    mkdir -p "$TOOL_DIR"
    git -C "$TOOL_DIR" init -q || return 1
    for attempt in 1 2 3; do
        if git -C "$TOOL_DIR" fetch -q --depth 1 "$BLOCKCHAIN_SNAPSHOTS_REPO" "$BLOCKCHAIN_SNAPSHOTS_COMMIT"; then
            break
        fi
        if [ "$attempt" -eq 3 ]; then
            err "could not fetch commit $BLOCKCHAIN_SNAPSHOTS_COMMIT from $BLOCKCHAIN_SNAPSHOTS_REPO"
            return 1
        fi
        sleep 10
    done
    git -C "$TOOL_DIR" -c advice.detachedHead=false checkout -q FETCH_HEAD || return 1
    if [ "$(git -C "$TOOL_DIR" rev-parse HEAD)" != "$BLOCKCHAIN_SNAPSHOTS_COMMIT" ]; then
        err "checked-out commit $(git -C "$TOOL_DIR" rev-parse HEAD) is not the pinned $BLOCKCHAIN_SNAPSHOTS_COMMIT"
        return 1
    fi
}

run_snapshot_tool() {
    local out=$1 result=$2
    # A clean environment: nothing inherited can redirect the registry
    # (REGISTRY_URL) or change how the tool runs.
    runuser -u "$NODE_USER" -- env -i \
        HOME="/home/$NODE_USER" \
        PATH="/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin:/snap/bin" \
        "$TOOL_DIR/dist/snapshot.sh" \
        --snapshot "$SNAPSHOT_ID" \
        --region "$AWS_REGION" \
        --registry "$TOOL_DIR/dist/regions.json" \
        --source s3 \
        --out "$out" \
        --json > "$result"
}

main() {
    local out=${1%/}
    if [ -z "$out" ]; then
        err "usage: blockchain-snapshots.sh <output-dir>"
        return 1
    fi

    # shellcheck source=/dev/null
    source "$CDK_ENV_FILE"
    if [ -z "$SNAPSHOT_ID" ] || [ -z "$AWS_REGION" ]; then
        err "SNAPSHOT_ID and AWS_REGION must be set in $CDK_ENV_FILE"
        return 1
    fi

    local restored="$out.snapshot-restored" in_progress="$out.snapshot-in-progress"
    if [ -f "$restored" ]; then
        log "Snapshot already restored into $out, skipping"
        return 0
    fi
    if [ -f "$in_progress" ]; then
        # Delete the partial output here rather than with snapshot.sh --force:
        # the tool checks free space before it clears the output, so the
        # partial data would count against the space the snapshot needs.
        log "A previous restore into $out did not finish; deleting it and starting over"
        rm -rf "${out:?}"
        install -d -o "$NODE_USER" -g "$NODE_USER" "$out"
    elif [ -n "$(ls -A "$out" 2>/dev/null)" ]; then
        log "$out already contains data that was not restored by this script; not restoring"
        return 0
    fi

    # From here on, any failure leaves the marker, so the next run deletes
    # whatever the output directory holds by then and restores again.
    mkdir -p "$(dirname "$out")"
    touch "$in_progress"
    hold_node_service "$in_progress"

    check_bucket_reachable || return 1
    install_dependencies || { err "dependency installation failed"; return 1; }
    fetch_tool || return 1

    log "Restoring snapshot $SNAPSHOT_ID into $out (this can take a few hours for large snapshots)"
    local result
    result=$(mktemp)
    if ! run_snapshot_tool "$out" "$result"; then
        err "snapshot.sh failed for $SNAPSHOT_ID; see the messages above. Reboot the instance to retry."
        rm -f "$result"
        return 1
    fi

    log "Restored $(jq -r '"\(.snapshot_id) version \(.version), \(.size_bytes) bytes in \(.duration_seconds)s via \(.method)"' "$result")"
    mv -f "$result" "$restored"
    chmod 644 "$restored"
    rm -f "$in_progress"
    release_node_service
}

# NODE_RUNNER_SOURCE_ONLY=1 lets unit tests load the functions without running.
if [ "${NODE_RUNNER_SOURCE_ONLY:-}" != "1" ]; then
    main "$@"
    exit $?
fi
