#!/bin/bash
# Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
# SPDX-License-Identifier: Apache-2.0

# snapshot-staging.sh - Snapshot Staging Volume Helper
# Provides staging_mount() and staging_cleanup() for blueprints that need
# a separate volume to hold the compressed snapshot during download.
#
# This script is sourced by blueprint-specific download-snapshot.sh scripts.
# It manages a temporary gp3 EBS volume used as a staging area so that the
# compressed archive does not compete for space on the instance-store /data volume.
#
# Reads from /etc/cdk_environment:
#   SNAPSHOT_STAGING_VOL_SIZE  — volume size in GiB (0 = disabled)
#   SNAPSHOT_STAGING_VOL_ID    — volume ID (set by CDK for single-node, empty for HA)
#
# Exports:
#   STAGING_DOWNLOAD_PATH — path where the archive should be downloaded
#                           (/mnt/snapshot-staging if staging enabled, /data otherwise)
#   STAGING_ENABLED       — "true" if staging volume is active

STAGING_MOUNT_POINT="/mnt/snapshot-staging"
STAGING_DEVICE=""
STAGING_ENABLED="false"
STAGING_DOWNLOAD_PATH="/data"

staging_mount() {
    source /etc/cdk_environment 2>/dev/null || true

    local vol_size="${SNAPSHOT_STAGING_VOL_SIZE:-0}"
    if [ "$vol_size" -eq 0 ] 2>/dev/null; then
        echo "Staging volume not configured, downloading to /data"
        STAGING_DOWNLOAD_PATH="/data"
        return 0
    fi

    local vol_id="${SNAPSHOT_STAGING_VOL_ID:-}"

    # HA mode: self-create and attach volume
    if [ -z "$vol_id" ]; then
        echo "HA mode: creating staging volume (${vol_size} GiB)..."
        local token az instance_id region

        token=$(curl -s -X PUT "http://169.254.169.254/latest/api/token" \
            -H "X-aws-ec2-metadata-token-ttl-seconds: 21600")
        instance_id=$(curl -H "X-aws-ec2-metadata-token: $token" -s \
            http://169.254.169.254/latest/meta-data/instance-id)
        az=$(curl -H "X-aws-ec2-metadata-token: $token" -s \
            http://169.254.169.254/latest/meta-data/placement/availability-zone)
        region=$(curl -H "X-aws-ec2-metadata-token: $token" -s \
            http://169.254.169.254/latest/dynamic/instance-identity/document | jq -r .region)

        vol_id=$(aws ec2 create-volume \
            --availability-zone "$az" \
            --size "$vol_size" \
            --volume-type gp3 \
            --throughput 1000 \
            --iops 16000 \
            --encrypted \
            --tag-specifications "ResourceType=volume,Tags=[{Key=Name,Value=snapshot-staging-${instance_id}},{Key=Purpose,Value=snapshot-staging}]" \
            --region "$region" \
            --output text --query VolumeId)

        if [ -z "$vol_id" ]; then
            echo "ERROR: Failed to create staging volume"
            STAGING_DOWNLOAD_PATH="/data"
            return 1
        fi

        echo "Created staging volume: $vol_id"
        aws ec2 wait volume-available --volume-ids "$vol_id" --region "$region"

        aws ec2 attach-volume \
            --volume-id "$vol_id" \
            --instance-id "$instance_id" \
            --device /dev/xvdz \
            --region "$region"

        # Persist vol_id for cleanup
        echo "SNAPSHOT_STAGING_VOL_ID=$vol_id" >> /etc/cdk_environment
    fi

    # Wait for device to appear using /dev/disk/by-id/ symlinks.
    # On Nitro instances (i7i, i3, i4i, etc.), AWS remaps /dev/xvdz to /dev/nvmeXn1
    # unpredictably. The only reliable identifier is the volume ID, which the kernel
    # exposes via udev rules as:
    #   /dev/disk/by-id/nvme-Amazon_Elastic_Block_Store_volXXXXXXXXXXXXXXXXX
    # This is deterministic and unique — no ambiguity with root or data volumes.
    echo "Waiting for staging device to appear (volume: $vol_id)..."
    local vol_id_stripped="${vol_id//-/}"
    local attempts=0
    STAGING_DEVICE=""

    while [ -z "$STAGING_DEVICE" ]; do
        # Primary method: /dev/disk/by-id/ symlink (Ubuntu 24.04+ always has this)
        local by_id_link
        by_id_link=$(find /dev/disk/by-id/ -name "*${vol_id_stripped}*" 2>/dev/null | head -1)
        if [ -n "$by_id_link" ] && [ -b "$by_id_link" ]; then
            STAGING_DEVICE=$(readlink -f "$by_id_link")
            break
        fi

        # Fallback: direct device name (non-NVMe instance types)
        if [ -b /dev/xvdz ]; then
            STAGING_DEVICE="/dev/xvdz"
            break
        fi

        sleep 5
        attempts=$((attempts + 1))
        if [ $attempts -ge 24 ]; then  # 2 minutes
            echo "ERROR: Staging volume device did not appear after 2 minutes"
            echo "Looked for /dev/disk/by-id/*${vol_id_stripped}* and /dev/xvdz"
            STAGING_DOWNLOAD_PATH="/data"
            return 1
        fi
    done

    if [ ! -b "$STAGING_DEVICE" ]; then
        echo "ERROR: Staging device $STAGING_DEVICE is not a block device"
        STAGING_DOWNLOAD_PATH="/data"
        return 1
    fi

    echo "Staging device: $STAGING_DEVICE"

    # Format only if not already formatted (supports resume after reboot)
    if ! blkid "$STAGING_DEVICE" | grep -q "ext4"; then
        echo "Formatting staging volume as ext4..."
        mkfs.ext4 -F "$STAGING_DEVICE"
    fi

    # Mount
    mkdir -p "$STAGING_MOUNT_POINT"
    if ! mount "$STAGING_DEVICE" "$STAGING_MOUNT_POINT"; then
        echo "ERROR: Failed to mount staging device $STAGING_DEVICE at $STAGING_MOUNT_POINT"
        STAGING_DOWNLOAD_PATH="/data"
        return 1
    fi

    STAGING_ENABLED="true"
    # shellcheck disable=SC2034  # global; read by download-snapshot.sh, which consumes this script
    STAGING_DOWNLOAD_PATH="$STAGING_MOUNT_POINT"
    echo "Staging volume mounted at $STAGING_MOUNT_POINT"
    return 0
}

# Standardized, greppable error logging for cleanup failures.
# Always includes the volume ID (when known) so orphaned volumes can be traced
# from cloud-init-output logs.
_log_err() {
    echo "ERROR: staging cleanup: $1" >&2
}

# Resolve the region and instance ID from IMDSv2. Sets the globals
# STAGING_REGION and STAGING_INSTANCE_ID. Returns non-zero if the metadata
# service is unreachable (so callers can surface the failure instead of
# silently proceeding with empty values).
_staging_resolve_metadata() {
    local token
    token=$(curl -s -X PUT "http://169.254.169.254/latest/api/token" \
        -H "X-aws-ec2-metadata-token-ttl-seconds: 21600")
    STAGING_INSTANCE_ID=$(curl -H "X-aws-ec2-metadata-token: $token" -s \
        http://169.254.169.254/latest/meta-data/instance-id)
    STAGING_REGION=$(curl -H "X-aws-ec2-metadata-token: $token" -s \
        http://169.254.169.254/latest/dynamic/instance-identity/document | jq -r .region)

    if [ -z "$STAGING_REGION" ] || [ "$STAGING_REGION" = "null" ] || [ -z "$STAGING_INSTANCE_ID" ]; then
        return 1
    fi
    return 0
}

# Returns 0 (true) if the volume no longer exists in the account.
# A describe-volumes that errors with InvalidVolume.NotFound — or returns no
# volume — means the volume is gone, which is the success condition.
_staging_volume_gone() {
    local vol_id="$1" region="$2"
    local state
    state=$(aws ec2 describe-volumes \
        --volume-ids "$vol_id" \
        --region "$region" \
        --query "Volumes[0].State" \
        --output text 2>/dev/null) || return 0
    if [ -z "$state" ] || [ "$state" = "None" ]; then
        return 0
    fi
    return 1
}

staging_cleanup() {
    # Check both STAGING_ENABLED (set by staging_mount) and SNAPSHOT_STAGING_VOL_ID
    # (persisted in /etc/cdk_environment by CDK or staging_mount). This ensures cleanup
    # runs even if the script exits before staging_mount() sets STAGING_ENABLED=true,
    # e.g. on early-exit paths like "data already exists".
    source /etc/cdk_environment 2>/dev/null || true
    local vol_id="${SNAPSHOT_STAGING_VOL_ID:-}"

    # Backward-compatible no-op: nothing was ever enabled or created.
    if [ "$STAGING_ENABLED" != "true" ] && [ -z "$vol_id" ]; then
        return 0
    fi

    echo "Cleaning up staging volume..."

    # Unmount (best effort — an unmount failure must not stop the detach/delete).
    if mountpoint -q "$STAGING_MOUNT_POINT" 2>/dev/null; then
        umount "$STAGING_MOUNT_POINT" || umount -l "$STAGING_MOUNT_POINT"
    fi

    # Resolve region + instance id. Required for every AWS call below.
    STAGING_REGION=""
    STAGING_INSTANCE_ID=""
    if ! _staging_resolve_metadata; then
        _log_err "could not resolve region/instance from metadata service (vol_id=${vol_id:-unknown})"
        return 1
    fi
    local region="$STAGING_REGION"
    local instance_id="$STAGING_INSTANCE_ID"

    # Reboot / lost-id recovery: if the volume id is not in the environment
    # (e.g. the instance rebooted mid-download before staging_mount persisted it,
    # or this is a fresh shell), try to rediscover the staging volume by its tag
    # and attachment to this instance, rather than silently leaking it.
    if [ -z "$vol_id" ]; then
        echo "No volume ID in environment, attempting tag-based recovery..."
        vol_id=$(aws ec2 describe-volumes \
            --filters "Name=tag:Purpose,Values=snapshot-staging" \
                      "Name=attachment.instance-id,Values=${instance_id}" \
            --region "$region" \
            --query "Volumes[0].VolumeId" \
            --output text 2>/dev/null)
        if [ "$vol_id" = "None" ]; then
            vol_id=""
        fi
    fi

    if [ -z "$vol_id" ]; then
        _log_err "no staging volume id available for cleanup (none in environment and none discoverable by tag)"
        return 1
    fi

    # If the volume is already gone, treat as success (idempotent / race-safe).
    if _staging_volume_gone "$vol_id" "$region"; then
        echo "Volume $vol_id no longer exists — nothing to clean up"
        return 0
    fi

    # Detach (capture failure but continue — delete/verify may still succeed).
    echo "Detaching staging volume $vol_id..."
    if ! aws ec2 detach-volume --volume-id "$vol_id" --region "$region" >/dev/null 2>&1; then
        _log_err "detach failed for $vol_id"
    fi

    # Wait for volume to become available with a timeout (3 minutes max).
    # aws ec2 wait volume-available has no timeout and can hang indefinitely
    # if the detach stalls, blocking the entire script.
    echo "Waiting for volume to detach (up to 3 minutes)..."
    local wait_attempts=0
    local max_wait_attempts=36  # 36 × 5s = 180s = 3 minutes
    while [ $wait_attempts -lt $max_wait_attempts ]; do
        # Distinguish three cases: a transient describe error (retry),
        # the volume being genuinely gone (success), and a known state.
        local vol_state describe_rc
        vol_state=$(aws ec2 describe-volumes \
            --volume-ids "$vol_id" \
            --region "$region" \
            --query "Volumes[0].State" \
            --output text 2>/dev/null)
        describe_rc=$?

        if [ $describe_rc -ne 0 ]; then
            # describe failed. This is either a NotFound (volume gone) or a
            # transient API error. Confirm with the dedicated check so a
            # transient failure is not mistaken for a successful deletion.
            if _staging_volume_gone "$vol_id" "$region"; then
                echo "Volume $vol_id no longer exists"
                return 0
            fi
            # Transient error — keep waiting.
        elif [ "$vol_state" = "available" ]; then
            echo "Volume $vol_id is now available"
            break
        elif [ -z "$vol_state" ] || [ "$vol_state" = "None" ]; then
            echo "Volume $vol_id no longer exists"
            return 0
        fi

        sleep 5
        wait_attempts=$((wait_attempts + 1))
    done

    if [ $wait_attempts -ge $max_wait_attempts ]; then
        echo "WARNING: Timed out waiting for volume $vol_id to detach. Attempting delete anyway."
    fi

    # Delete (capture failure for the verification gate).
    echo "Deleting staging volume $vol_id..."
    if ! aws ec2 delete-volume --volume-id "$vol_id" --region "$region" >/dev/null 2>&1; then
        _log_err "delete failed for $vol_id"
    fi

    # Verification gate: only report success if the volume is provably gone.
    if _staging_volume_gone "$vol_id" "$region"; then
        echo "Staging volume cleanup complete"
        return 0
    fi

    _log_err "staging volume $vol_id still exists after cleanup"
    return 1
}
