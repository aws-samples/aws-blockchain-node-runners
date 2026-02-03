#!/bin/bash
# Setup EBS volume for Bitcoin data
# Usage: setup-volume.sh <mount_point> <filesystem_type> <expected_size_bytes>

set -e

MOUNT_POINT=$1
FS_TYPE=$2
EXPECTED_SIZE=$3

echo "Setting up volume at $MOUNT_POINT"
echo "Expected size: $EXPECTED_SIZE bytes"

# Find the data volume by size (like BSC does)
DATA_VOLUME_ID=/dev/$(lsblk -lnb | awk -v VOLUME_SIZE_BYTES="$EXPECTED_SIZE" '{if ($4== VOLUME_SIZE_BYTES) {print $1}}')

echo "DATA_VOLUME_ID=$DATA_VOLUME_ID"

if [ -z "$DATA_VOLUME_ID" ] || [ "$DATA_VOLUME_ID" == "/dev/" ]; then
    echo "Volume not found by size, trying device names"
    # Fallback to checking common device names
    for device in /dev/nvme1n1 /dev/xvdf /dev/sdf; do
        if [ -b "$device" ]; then
            DATA_VOLUME_ID=$device
            echo "Found device: $DATA_VOLUME_ID"
            break
        fi
    done
fi

if [ -z "$DATA_VOLUME_ID" ] || [ "$DATA_VOLUME_ID" == "/dev/" ]; then
    echo "ERROR: No data device found"
    lsblk -lnb
    exit 1
fi

# Format the volume
echo "Formatting $DATA_VOLUME_ID with $FS_TYPE"
mkfs -t "$FS_TYPE" "$DATA_VOLUME_ID"
sleep 10

# Get UUID
DATA_VOLUME_UUID=$(lsblk -fn -o UUID "$DATA_VOLUME_ID")
echo "DATA_VOLUME_UUID=$DATA_VOLUME_UUID"

# Create mount point
mkdir -p "$MOUNT_POINT"

# Add to fstab
DATA_VOLUME_FSTAB_CONF="UUID=$DATA_VOLUME_UUID $MOUNT_POINT $FS_TYPE defaults,nofail 0 2"
echo "DATA_VOLUME_FSTAB_CONF=$DATA_VOLUME_FSTAB_CONF"
echo "$DATA_VOLUME_FSTAB_CONF" >> /etc/fstab

# Mount
mount -a

echo "Volume setup complete"
lsblk -d
