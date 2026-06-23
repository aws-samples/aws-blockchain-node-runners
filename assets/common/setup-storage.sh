#!/bin/bash
# Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
# SPDX-License-Identifier: Apache-2.0

# setup-storage.sh - Universal EBS volume management script
# This script handles EBS volume attachment, formatting, and mounting for blockchain nodes
# 
# Expected input: DATA_VOLUMES environment variable containing a JSON array of StorageVolumeConfig objects
# Example: DATA_VOLUMES='[{"TYPE":"gp3","SIZE":100,"FILESYSTEM":"ext4","MOUNT_PATH":"/data","DEVICE_NAME":"/dev/sdf"}]'

set -euo pipefail

SCRIPT_NAME="[setup-storage]"

echo "$SCRIPT_NAME Source environment variables"
if [[ -f /etc/cdk_environment ]]; then
    # shellcheck source=/dev/null
    source /etc/cdk_environment
fi

make_fs() {
    echo "$SCRIPT_NAME Create filesystem"

    if [ -z "$1" ]; then
        echo "Error: $SCRIPT_NAME No file system type provided."
        echo "Usage: make_fs <file system type [ xfs | ext4 ]> <target_volume_id>"
        exit 1
    fi

    if [ -z "$2" ]; then
        echo "Error: $SCRIPT_NAME No target volume ID provided."
        echo "Usage: make_fs <file system type [ xfs | ext4 ]> <target_volume_id>"
        exit 1
    fi

    local file_system=$1
    local volume_id=$2
    
    echo "$SCRIPT_NAME Creating $file_system filesystem on $volume_id"
    if [ "$file_system" == "ext4" ]; then
        mkfs -t ext4 "$volume_id"
        return "$?"
    else
        mkfs.xfs -f "$volume_id"
        return "$?"
    fi
}

get_all_empty_nvme_disks() {
    echo "$SCRIPT_NAME Get all empty nvme disks that are not mounted and not partitioned" >&2

    local all_not_mounted_nvme_disks
    local all_mounted_nvme_partitions
    local unmounted_nvme_disks=()
    local sorted_unmounted_nvme_disks

    # Resolve the staging EBS volume device name so we can exclude it from RAID assembly.
    # The staging volume is a regular EBS volume and must not be included in the instance-store RAID.
    local staging_device=""
    local staging_vol_id="${SNAPSHOT_STAGING_VOL_ID:-}"
    if [[ -n "$staging_vol_id" ]]; then
        local vol_id_stripped="${staging_vol_id//-/}"
        local by_id_link=""
        local attempts=0

        # Retry for up to 30 seconds — the udev symlink may not exist immediately after boot
        while [[ -z "$by_id_link" ]] && [[ $attempts -lt 6 ]]; do
            by_id_link=$(find /dev/disk/by-id/ -name "*${vol_id_stripped}*" 2>/dev/null | head -1)
            if [[ -n "$by_id_link" ]] && [[ -b "$by_id_link" ]]; then
                break
            fi
            by_id_link=""
            ((attempts++))
            echo "$SCRIPT_NAME Waiting for staging volume $staging_vol_id to appear in /dev/disk/by-id/ (attempt $attempts/6)..." >&2
            sleep 5
        done

        if [[ -n "$by_id_link" ]] && [[ -b "$by_id_link" ]]; then
            staging_device=$(basename "$(readlink -f "$by_id_link")")
            echo "$SCRIPT_NAME Excluding staging EBS volume $staging_vol_id ($staging_device) from RAID assembly" >&2
        else
            echo "$SCRIPT_NAME WARNING: Staging volume $staging_vol_id not found in /dev/disk/by-id/ after 30s — cannot exclude from RAID" >&2
        fi
    fi

    # The disk will only be considered if larger than 100GB to avoid using root EBS disk
    all_not_mounted_nvme_disks=$(lsblk -lnb | awk '{if ($7 == "" && $4 > 100000000000) {print $1}}' | grep nvme || true)
    all_mounted_nvme_partitions=$(mount | awk '{print $1}' | grep /dev/nvme || true)
    
    # Convert string to array, excluding the staging device
    while IFS= read -r disk; do
        if [[ -n "$disk" && ! "$all_mounted_nvme_partitions" =~ $disk ]]; then
            if [[ -n "$staging_device" && "$disk" == "$staging_device" ]]; then
                echo "$SCRIPT_NAME Skipping $disk (staging EBS volume)" >&2
                continue
            fi
            unmounted_nvme_disks+=("$disk")
        fi
    done <<< "$all_not_mounted_nvme_disks"
    
    # Sort the array
    mapfile -t sorted_unmounted_nvme_disks < <(printf '%s\n' "${unmounted_nvme_disks[@]}" | sort)
    echo "${sorted_unmounted_nvme_disks[*]}"
}

get_next_empty_nvme_disk() {
    echo "$SCRIPT_NAME Get the next available empty nvme disk" >&2

    local sorted_unmounted_nvme_disks
    sorted_unmounted_nvme_disks=$(get_all_empty_nvme_disks)
    
    # Convert to array and get first element
    read -ra disk_array <<< "$sorted_unmounted_nvme_disks"
    
    if [[ ${#disk_array[@]} -eq 0 ]]; then
        echo "" >&2
        echo "Error: No available NVMe disks found" >&2
        return 1
    fi
    
    # Return the first unmounted nvme disk
    echo "/dev/${disk_array[0]}"
}

setup_volume() {
    echo "$SCRIPT_NAME Setup a single volume"

    local mount_path=$1
    local file_system=${2:-ext4}
    local volume_size_bytes=${3:-}
    
    if [ -z "$mount_path" ]; then
        echo "Error: $SCRIPT_NAME No mount path provided."
        echo "Usage: setup_volume <mount_path> [file_system] [volume_size_bytes]"
        exit 1
    fi
    
    # Set filesystem configuration based on type
    case $file_system in
        ext4)
            echo "$SCRIPT_NAME File system set to ext4"
            FS_CONFIG="defaults,nofail"
            ;;
        xfs)
            echo "$SCRIPT_NAME File system set to xfs"
            FS_CONFIG="noatime,nodiratime,nodiscard,nofail"
            ;;
        *)
            echo "$SCRIPT_NAME File system set to ext4 (default)"
            file_system="ext4"
            FS_CONFIG="defaults,nofail"
            ;;
    esac
    
    echo "$SCRIPT_NAME Checking if $mount_path is mounted, and skip if it is"
    if [ "$(df --output=target | grep -c "$mount_path")" -lt 1 ]; then
        
        # Determine volume ID based on size or use next available
        if [ -n "$volume_size_bytes" ]; then
            VOLUME_ID=/dev/$(lsblk -lnb | awk -v VOLUME_SIZE_BYTES="$volume_size_bytes" '{if ($4== VOLUME_SIZE_BYTES) {print $1}}')
            echo "$SCRIPT_NAME Data volume size defined, use respective volume id: $VOLUME_ID"
        else
            VOLUME_ID=$(get_next_empty_nvme_disk)
            echo "$SCRIPT_NAME Data volume size undefined, trying volume id: $VOLUME_ID"
        fi
        
        # Check if we found a valid volume
        if [ -z "$VOLUME_ID" ] || [ "$VOLUME_ID" == "/dev/" ]; then
            echo "Error: $SCRIPT_NAME No suitable volume found for $mount_path"
            return 1
        fi
        
        # Create the mount point
        mkdir -p "$mount_path"
        
        # Format the volume
        make_fs "$file_system" "$VOLUME_ID"
        
        # Wait a bit for the filesystem to be ready
        sleep 10
        
        # Get volume UUID for fstab
        VOLUME_UUID=$(lsblk -fn -o UUID "$VOLUME_ID")
        VOLUME_FSTAB_CONF="UUID=$VOLUME_UUID $mount_path $file_system $FS_CONFIG 0 2"
        
        echo "VOLUME_ID=$VOLUME_ID"
        echo "VOLUME_UUID=$VOLUME_UUID"
        echo "VOLUME_FSTAB_CONF=$VOLUME_FSTAB_CONF"
        
        # Check if mount path is already in fstab and replace if it is
        echo "$SCRIPT_NAME Checking fstab for volume $mount_path"
        if [ "$(grep -c "$mount_path" /etc/fstab)" -gt 0 ]; then
            SED_REPLACEMENT_STRING="$(grep -n "$mount_path" /etc/fstab | cut -d: -f1)s#.*#$VOLUME_FSTAB_CONF#"
            # Backup fstab
            if [ -f /etc/fstab.bak ]; then
                rm /etc/fstab.bak
            fi
            cp /etc/fstab /etc/fstab.bak
            sed -i "$SED_REPLACEMENT_STRING" /etc/fstab
        else
            echo "$VOLUME_FSTAB_CONF" | tee -a /etc/fstab
        fi
        
        echo "$SCRIPT_NAME Mount all filesystems"
        mount -a
        
        echo "$SCRIPT_NAME Set ownership to bcuser user (universal default)"
        chown -R bcuser:bcuser "$mount_path"
        
        echo "Successfully set up volume at $mount_path"
    else
        echo "$SCRIPT_NAME $mount_path volume is already mounted, nothing changed"
    fi
}


ensure_mdadm() {
    echo "$SCRIPT_NAME Checking if mdadm is installed..."

    if command -v mdadm &>/dev/null; then
        echo "$SCRIPT_NAME mdadm is already installed"
    else
        echo "$SCRIPT_NAME mdadm not found, installing..."
        apt-get update
        apt-get install -y mdadm
        echo "$SCRIPT_NAME mdadm installed successfully"
    fi
}

setup_single_raid() {
    echo "$SCRIPT_NAME Setting up single RAID 0 array..."

    local mount_path=$1
    local filesystem=${2:-ext4}

    if [ -z "$mount_path" ]; then
        echo "Error: $SCRIPT_NAME No mount path provided to setup_single_raid."
        echo "Usage: setup_single_raid <mount_path> <filesystem>"
        exit 1
    fi

    # Set filesystem mount options based on type
    local fs_config
    case $filesystem in
        xfs)
            fs_config="noatime,nodiratime,nodiscard,nofail"
            ;;
        *)
            fs_config="defaults,nofail"
            ;;
    esac

    # Discover available NVMe drives
    echo "$SCRIPT_NAME Discovering available NVMe drives..."
    local nvme_disks_str
    nvme_disks_str=$(get_all_empty_nvme_disks)

    local nvme_disks=()
    read -ra nvme_disks <<< "$nvme_disks_str"

    local drive_count=${#nvme_disks[@]}
    echo "$SCRIPT_NAME Found $drive_count NVMe drive(s): ${nvme_disks[*]}"

    if [[ $drive_count -lt 1 ]]; then
        echo "Error: $SCRIPT_NAME No NVMe drives found for single RAID assembly. Expected at least 1 drive."
        exit 1
    fi

    # Build device paths array
    local devices=()
    for disk in "${nvme_disks[@]}"; do
        devices+=("/dev/$disk")
    done

    # Create RAID 0 array
    echo "$SCRIPT_NAME Creating RAID 0 array at /dev/md0 with ${#devices[@]} drive(s): ${devices[*]}"
    mdadm --create /dev/md0 --level=0 --raid-devices=${#devices[@]} "${devices[@]}" --force --run

    # Wait for RAID array to initialize
    sleep 2

    # Format the RAID array
    echo "$SCRIPT_NAME Formatting /dev/md0 with $filesystem filesystem"
    make_fs "$filesystem" "/dev/md0"

    # Wait for filesystem to be ready
    sleep 5

    # Create mount point and mount
    echo "$SCRIPT_NAME Creating mount point $mount_path and mounting /dev/md0"
    mkdir -p "$mount_path"
    mount /dev/md0 "$mount_path"

    # Add UUID-based fstab entry
    local raid_uuid
    raid_uuid=$(lsblk -fn -o UUID /dev/md0)
    local fstab_entry="UUID=$raid_uuid $mount_path $filesystem $fs_config 0 2"

    echo "$SCRIPT_NAME Adding fstab entry: $fstab_entry"
    if [ "$(grep -c "$mount_path" /etc/fstab)" -gt 0 ]; then
        local sed_replacement
        sed_replacement="$(grep -n "$mount_path" /etc/fstab | cut -d: -f1)s#.*#$fstab_entry#"
        cp /etc/fstab /etc/fstab.bak
        sed -i "$sed_replacement" /etc/fstab
    else
        echo "$fstab_entry" | tee -a /etc/fstab
    fi

    # Save RAID configuration
    echo "$SCRIPT_NAME Saving RAID configuration to /etc/mdadm/mdadm.conf"
    mkdir -p /etc/mdadm
    mdadm --detail --scan >> /etc/mdadm/mdadm.conf

    # Set ownership
    echo "$SCRIPT_NAME Setting ownership of $mount_path to bcuser:bcuser"
    chown -R bcuser:bcuser "$mount_path"

    echo "$SCRIPT_NAME Single RAID 0 setup complete: /dev/md0 -> $mount_path (drives: ${devices[*]})"
}

setup_dual_raid() {
    echo "$SCRIPT_NAME Setting up dual RAID 0 arrays..."

    local mount1=$1
    local fs1=${2:-ext4}
    local size1=${3:-0}
    local mount2=$4
    local fs2=${5:-ext4}
    local size2=${6:-0}

    if [ -z "$mount1" ] || [ -z "$mount2" ]; then
        echo "Error: $SCRIPT_NAME Both mount paths must be provided to setup_dual_raid."
        echo "Usage: setup_dual_raid <mount1> <fs1> <size1> <mount2> <fs2> <size2>"
        exit 1
    fi

    # Set filesystem mount options based on type for each array
    local fs1_config
    case $fs1 in
        xfs)
            fs1_config="noatime,nodiratime,nodiscard,nofail"
            ;;
        *)
            fs1_config="defaults,nofail"
            ;;
    esac

    local fs2_config
    case $fs2 in
        xfs)
            fs2_config="noatime,nodiratime,nodiscard,nofail"
            ;;
        *)
            fs2_config="defaults,nofail"
            ;;
    esac

    # Discover available NVMe drives
    echo "$SCRIPT_NAME Discovering available NVMe drives..."
    local nvme_disks_str
    nvme_disks_str=$(get_all_empty_nvme_disks)

    local nvme_disks=()
    read -ra nvme_disks <<< "$nvme_disks_str"

    local drive_count=${#nvme_disks[@]}
    echo "$SCRIPT_NAME Found $drive_count NVMe drive(s): ${nvme_disks[*]}"

    if [[ $drive_count -lt 2 ]]; then
        echo "Error: $SCRIPT_NAME Not enough NVMe drives found for dual RAID assembly. Expected at least 2, found $drive_count."
        exit 1
    fi

    local md0_members=()
    local md1_members=()

    if [[ $drive_count -ge 4 ]]; then
        # Strategy: split whole drives into two groups proportionally
        echo "$SCRIPT_NAME Using whole-drive allocation strategy ($drive_count drives >= 4)"

        # Calculate proportional split: first_count = max(1, round(N * S1 / (S1 + S2)))
        local total_size=$((size1 + size2))
        local first_count=$(( (drive_count * size1 + total_size / 2) / total_size ))

        # Ensure first_count >= 1
        if [[ $first_count -lt 1 ]]; then
            first_count=1
        fi

        # Ensure second group has >= 1 drive
        local second_count=$((drive_count - first_count))
        if [[ $second_count -lt 1 ]]; then
            first_count=$((drive_count - 1))
            second_count=1
        fi

        echo "$SCRIPT_NAME Drive allocation: $first_count drive(s) for md0 ($mount1), $second_count drive(s) for md1 ($mount2)"

        # First group: first first_count drives (sorted alphabetically)
        for ((i=0; i<first_count; i++)); do
            md0_members+=("/dev/${nvme_disks[$i]}")
        done

        # Second group: remaining drives
        for ((i=first_count; i<drive_count; i++)); do
            md1_members+=("/dev/${nvme_disks[$i]}")
        done

        echo "$SCRIPT_NAME md0 members: ${md0_members[*]}"
        echo "$SCRIPT_NAME md1 members: ${md1_members[*]}"

        # Create RAID 0 arrays from whole drives
        echo "$SCRIPT_NAME Creating RAID 0 array at /dev/md0 with ${#md0_members[@]} drive(s): ${md0_members[*]}"
        mdadm --create /dev/md0 --level=0 --raid-devices=${#md0_members[@]} "${md0_members[@]}" --force --run

        echo "$SCRIPT_NAME Creating RAID 0 array at /dev/md1 with ${#md1_members[@]} drive(s): ${md1_members[*]}"
        mdadm --create /dev/md1 --level=0 --raid-devices=${#md1_members[@]} "${md1_members[@]}" --force --run
    else
        # Strategy: partition each drive proportionally, then assemble partition sets
        echo "$SCRIPT_NAME Using partition-based allocation strategy ($drive_count drives < 4)"

        # Calculate partition percentage: partition1_pct = S1 * 100 / (S1 + S2)
        local total_size=$((size1 + size2))
        local partition1_pct=$((size1 * 100 / total_size))

        echo "$SCRIPT_NAME Partition split: ${partition1_pct}% for md0 ($mount1), $((100 - partition1_pct))% for md1 ($mount2)"

        # Partition each drive
        for disk in "${nvme_disks[@]}"; do
            local dev="/dev/$disk"

            # Compute partition 1 size in GiB from the device size. sgdisk does
            # NOT accept percentage sizes (that is a parted/sfdisk convention),
            # so pass an absolute "+<N>G" size for partition 1 and let partition
            # 2 take the remainder (end "0" = end of disk).
            local dev_bytes p1_gib
            dev_bytes=$(blockdev --getsize64 "$dev")
            p1_gib=$(( dev_bytes * partition1_pct / 100 / 1024 / 1024 / 1024 ))
            if [[ $p1_gib -lt 1 ]]; then
                p1_gib=1
            fi

            echo "$SCRIPT_NAME Partitioning $dev: partition 1 = +${p1_gib}G (~${partition1_pct}%), partition 2 = remainder"

            # Clear existing partition table
            sgdisk --zap-all "$dev"

            # Create both partitions in a SINGLE sgdisk invocation. Issuing two
            # separate sgdisk calls rewrites the partition table twice, and the
            # back-to-back BLKRRPART kernel re-reads race with udev: the
            # partition nodes created by the first call can be torn down by the
            # second and never recreated. One call means one re-read.
            # Partition 1: first p1_gib. Partition 2: remainder of the disk.
            sgdisk --new=1:0:+"${p1_gib}"G --new=2:0:0 "$dev"

            # Inform the kernel of the new partition table and wait for udev to
            # materialize the device nodes. partprobe alone can silently no-op
            # on some kernels/devices, so also force a per-device partition
            # re-scan with partx and settle udev between steps.
            partprobe "$dev" 2>/dev/null || true
            udevadm settle 2>/dev/null || true
            partx -u "$dev" 2>/dev/null || partx -a "$dev" 2>/dev/null || true
            udevadm settle 2>/dev/null || true

            # Post-condition: both partition device nodes must exist before we
            # try to assemble RAID from them. Wait for udev to create them, and
            # fail loudly if partitioning silently did not take.
            local part_attempts=0
            while { [[ ! -b "${dev}p1" ]] || [[ ! -b "${dev}p2" ]]; } && [[ $part_attempts -lt 15 ]]; do
                udevadm settle 2>/dev/null || true
                sleep 1
                ((part_attempts++)) || true
            done
            if [[ ! -b "${dev}p1" ]] || [[ ! -b "${dev}p2" ]]; then
                echo "Error: $SCRIPT_NAME Failed to partition $dev (${dev}p1 / ${dev}p2 missing after partprobe)"
                exit 1
            fi

            md0_members+=("${dev}p1")
            md1_members+=("${dev}p2")
        done

        # Wait for partition devices to appear
        sleep 2

        echo "$SCRIPT_NAME md0 members (partitions): ${md0_members[*]}"
        echo "$SCRIPT_NAME md1 members (partitions): ${md1_members[*]}"

        # Create RAID 0 arrays from partition sets
        echo "$SCRIPT_NAME Creating RAID 0 array at /dev/md0 with ${#md0_members[@]} partition(s): ${md0_members[*]}"
        mdadm --create /dev/md0 --level=0 --raid-devices=${#md0_members[@]} "${md0_members[@]}" --force --run

        echo "$SCRIPT_NAME Creating RAID 0 array at /dev/md1 with ${#md1_members[@]} partition(s): ${md1_members[*]}"
        mdadm --create /dev/md1 --level=0 --raid-devices=${#md1_members[@]} "${md1_members[@]}" --force --run
    fi

    # Wait for RAID arrays to initialize
    sleep 2

    # Format both RAID arrays
    echo "$SCRIPT_NAME Formatting /dev/md0 with $fs1 filesystem"
    make_fs "$fs1" "/dev/md0"

    echo "$SCRIPT_NAME Formatting /dev/md1 with $fs2 filesystem"
    make_fs "$fs2" "/dev/md1"

    # Wait for filesystems to be ready
    sleep 5

    # Create mount points and mount both arrays
    echo "$SCRIPT_NAME Creating mount point $mount1 and mounting /dev/md0"
    mkdir -p "$mount1"
    mount /dev/md0 "$mount1"

    echo "$SCRIPT_NAME Creating mount point $mount2 and mounting /dev/md1"
    mkdir -p "$mount2"
    mount /dev/md1 "$mount2"

    # Add UUID-based fstab entries for both arrays
    local raid0_uuid
    raid0_uuid=$(lsblk -fn -o UUID /dev/md0)
    local fstab_entry0="UUID=$raid0_uuid $mount1 $fs1 $fs1_config 0 2"

    echo "$SCRIPT_NAME Adding fstab entry: $fstab_entry0"
    if [ "$(grep -c "$mount1" /etc/fstab)" -gt 0 ]; then
        local sed_replacement0
        sed_replacement0="$(grep -n "$mount1" /etc/fstab | cut -d: -f1)s#.*#$fstab_entry0#"
        cp /etc/fstab /etc/fstab.bak
        sed -i "$sed_replacement0" /etc/fstab
    else
        echo "$fstab_entry0" | tee -a /etc/fstab
    fi

    local raid1_uuid
    raid1_uuid=$(lsblk -fn -o UUID /dev/md1)
    local fstab_entry1="UUID=$raid1_uuid $mount2 $fs2 $fs2_config 0 2"

    echo "$SCRIPT_NAME Adding fstab entry: $fstab_entry1"
    if [ "$(grep -c "$mount2" /etc/fstab)" -gt 0 ]; then
        local sed_replacement1
        sed_replacement1="$(grep -n "$mount2" /etc/fstab | cut -d: -f1)s#.*#$fstab_entry1#"
        cp /etc/fstab /etc/fstab.bak
        sed -i "$sed_replacement1" /etc/fstab
    else
        echo "$fstab_entry1" | tee -a /etc/fstab
    fi

    # Save RAID configuration
    echo "$SCRIPT_NAME Saving RAID configuration to /etc/mdadm/mdadm.conf"
    mkdir -p /etc/mdadm
    mdadm --detail --scan >> /etc/mdadm/mdadm.conf

    # Set ownership for both mount paths
    echo "$SCRIPT_NAME Setting ownership of $mount1 to bcuser:bcuser"
    chown -R bcuser:bcuser "$mount1"

    echo "$SCRIPT_NAME Setting ownership of $mount2 to bcuser:bcuser"
    chown -R bcuser:bcuser "$mount2"

    echo "$SCRIPT_NAME Dual RAID 0 setup complete: /dev/md0 -> $mount1 (members: ${md0_members[*]}), /dev/md1 -> $mount2 (members: ${md1_members[*]})"
}

collect_instance_store_configs() {
    echo "$SCRIPT_NAME Collecting instance-store volume configurations..."

    IS_MOUNT_PATHS=()
    IS_FILESYSTEMS=()
    IS_SIZES=()
    IS_COUNT=0

    local volumes_count=${DATA_VOLUMES_COUNT:-0}

    for ((i=1; i<=volumes_count; i++)); do
        local vol_type_var="DATA_VOL_${i}_TYPE"
        local vol_mount_var="DATA_VOL_${i}_MOUNT_PATH"
        local vol_fs_var="DATA_VOL_${i}_FILESYSTEM"
        local vol_size_var="DATA_VOL_${i}_SIZE"

        local volume_type="${!vol_type_var:-}"

        if [[ "$volume_type" == "instance-store" ]]; then
            IS_MOUNT_PATHS+=("${!vol_mount_var:-}")
            IS_FILESYSTEMS+=("${!vol_fs_var:-ext4}")
            IS_SIZES+=("${!vol_size_var:-0}")
            ((IS_COUNT++)) || true
        fi
    done

    echo "$SCRIPT_NAME Found $IS_COUNT instance-store volume(s)"
}

# Main execution - supports multiple volumes via flattened DATA_VOL_* variables
main() {
    echo "$SCRIPT_NAME Starting universal storage setup..."
    
    echo "$SCRIPT_NAME Get the number of data volumes to configure"
    local volumes_count=$DATA_VOLUMES_COUNT
    
    if [[ "$volumes_count" -eq 0 ]] || [[ -z "$volumes_count" ]]; then
        echo "$SCRIPT_NAME No data volumes configured, skipping storage setup"
        return 0
    fi
    
    echo "$SCRIPT_NAME Configuring $volumes_count data volumes..."

    # Collect instance-store configurations and determine RAID mode
    collect_instance_store_configs

    if [[ $IS_COUNT -eq 0 ]]; then
        echo "$SCRIPT_NAME RAID mode: none (no instance-store volumes detected)"
    elif [[ $IS_COUNT -eq 1 ]]; then
        echo "$SCRIPT_NAME RAID mode: single (1 instance-store volume detected)"
        ensure_mdadm
        setup_single_raid "${IS_MOUNT_PATHS[0]}" "${IS_FILESYSTEMS[0]}"
    elif [[ $IS_COUNT -eq 2 ]]; then
        echo "$SCRIPT_NAME RAID mode: dual (2 instance-store volumes detected)"
        ensure_mdadm
        setup_dual_raid "${IS_MOUNT_PATHS[0]}" "${IS_FILESYSTEMS[0]}" "${IS_SIZES[0]}" "${IS_MOUNT_PATHS[1]}" "${IS_FILESYSTEMS[1]}" "${IS_SIZES[1]}"
    else
        echo "Error: $SCRIPT_NAME Unsupported number of instance-store volumes: $IS_COUNT (maximum is 2)"
        exit 1
    fi

    # Process remaining EBS volumes (skip instance-store entries already handled by RAID)
    echo "$SCRIPT_NAME Setup EBS volumes"
    for ((i=1; i<=volumes_count; i++)); do
        # Get volume configuration from flattened environment variables
        local vol_type_var="DATA_VOL_${i}_TYPE"
        local vol_size_var="DATA_VOL_${i}_SIZE"
        local vol_fs_var="DATA_VOL_${i}_FILESYSTEM"
        local vol_mount_var="DATA_VOL_${i}_MOUNT_PATH"
        
        local volume_type="${!vol_type_var:-gp3}"
        local volume_size="${!vol_size_var:-}"
        local filesystem="${!vol_fs_var:-ext4}"
        local mount_path="${!vol_mount_var:-}"

        # Skip instance-store volumes (already handled by RAID assembly above)
        if [[ "$volume_type" == "instance-store" ]]; then
            echo "$SCRIPT_NAME Skipping volume $i ($mount_path) - already handled by RAID assembly"
            continue
        fi
        
        if [[ -z "$mount_path" ]]; then
            echo "$SCRIPT_NAME Skipping volume $i - missing mount path configuration"
            continue
        fi
        
        echo "$SCRIPT_NAME Convert size from GiB to bytes if provided"
        local volume_size_bytes=""
        if [[ -n "$volume_size" && "$volume_size" != "null" && "$volume_size" != "0" ]]; then
            volume_size_bytes=$((volume_size * 1024 * 1024 * 1024))
        fi
        
        echo "$SCRIPT_NAME Setting up volume $i: $mount_path (type: $volume_type, filesystem: $filesystem)"
        setup_volume "$mount_path" "$filesystem" "$volume_size_bytes"
    done
    
    echo "$SCRIPT_NAME Storage setup completed successfully"
    
    # Log final storage layout
    echo "$SCRIPT_NAME Final storage layout:"
    lsblk
}

# Run main function if script is executed directly
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    main "$@"
fi
