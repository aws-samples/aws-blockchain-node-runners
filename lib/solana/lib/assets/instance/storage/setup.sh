#!/bin/bash

make_fs () {
  # If file system = to ext4 use mkfs.ext4, if xfs use mkfs.xfs
  if [ -z "$1" ]; then
    echo "Error: No file system type provided."
    echo "Usage: make_fs <file system type [ xfs | ext4 ]> <target_volume_id>"
    exit 1
  fi

  if [ -z "$2" ]; then
    echo "Error: No target volume ID provided."
    echo "Usage: make_fs <file system type [ xfs | ext4 ]> <target_volume_id>"
    exit 1
  fi

  local file_system=$1
  local volume_id=$2
  if [ "$file_system" == "ext4" ]; then
    mkfs -t ext4 "$volume_id"
    return "$?"
  else
    mkfs.xfs -f "$volume_id"
    return "$?"
  fi
}

# We need an nvme disk that is not mounted and not partitioned
get_all_empty_nvme_disks () {
  local all_not_mounted_nvme_disks
  local all_mounted_nvme_partitions
  local unmounted_nvme_disks=()
  local sorted_unmounted_nvme_disks

  #The disk will only be mounted when the nvme disk is larger than 100GB to avoid storing blockchain node data directly on the root EBS disk (which is 46GB by default)
  all_not_mounted_nvme_disks=$(lsblk -lnb | awk '{if ($7 == "" && $4 > 100000000) {print $1}}' | grep nvme)
  all_mounted_nvme_partitions=$(mount | awk '{print $1}' | grep /dev/nvme)
  for disk in ${all_not_mounted_nvme_disks[*]}; do
    if [[ ! "${all_mounted_nvme_partitions[*]}" =~ $disk ]]; then
      unmounted_nvme_disks+=("$disk")
    fi
  done
  # Sort the array
  sorted_unmounted_nvme_disks=($(printf '%s\n' "${unmounted_nvme_disks[*]}" | sort))
  echo "${sorted_unmounted_nvme_disks[*]}"
}

get_next_empty_nvme_disk () {
  local sorted_unmounted_nvme_disks
  sorted_unmounted_nvme_disks=($(get_all_empty_nvme_disks))
  # Return the first unmounted nvme disk
  echo "/dev/${sorted_unmounted_nvme_disks[0]}"
}

# Add input as command line parameters for name of the directory to mount
if [ -n "$1" ]; then
  DIR_NAME=$1
else
  echo "Error: No data file system mount path is provided."
  echo "Usage: instance/storage/setup.sh <file_system_mount_path> <file_system_type [ xfs | ext4 ]> <target_volume_size_in_bytes> "
  echo "Default file system type is ext4"
  echo "If you skip <target_volume_size_in_bytes>, script will try to use the first unformatted volume ID."
  echo "Usage example: instance/storage/setup.sh /data ext4 300000000000000"
  exit 1
fi

# Case input for $2 between ext4 and xfs, use ext4 as default
case $2 in
  ext4)
    echo "File system set to ext4"
    FILE_SYSTEM="ext4"
    FS_CONFIG="defaults"
    ;;
  xfs)
    echo "File system set to xfs"
    FILE_SYSTEM="xfs"
    FS_CONFIG="noatime,nodiratime,nodiscard" # See more: https://cdrdv2-public.intel.com/686417/rocksdb-benchmark-tuning-guide-on-xeon.pdf
    ;;
  *)
    echo "File system set to ext4"
    FILE_SYSTEM="ext4"
    FS_CONFIG="defaults"
    ;;
esac

if [ -n "$3" ]; then
  VOLUME_SIZE=$3
else
  echo "The size of volume for $DIR_NAME is not specified. Will try to guess volume ID."
fi

  echo "Checking if $DIR_NAME is mounted, and dont do anything if it is"
  if [ $(df --output=target | grep -c "$DIR_NAME") -lt 1 ]; then

    if [ -n "$VOLUME_SIZE" ]; then
      VOLUME_ID=/dev/$(lsblk -lnb | awk -v VOLUME_SIZE_BYTES="$VOLUME_SIZE" '{if ($4== VOLUME_SIZE_BYTES) {print $1}}')
      echo "Data volume size defined, use respective volume id: $VOLUME_ID"
    else 
      VOLUME_ID=$(get_next_empty_nvme_disk)
      echo "Data volume size undefined, trying volume id: $VOLUME_ID"
    fi
    
    make_fs $FILE_SYSTEM "$VOLUME_ID"

    sleep 10
    VOLUME_UUID=$(lsblk -fn -o UUID  "$VOLUME_ID")
    VOLUME_FSTAB_CONF="UUID=$VOLUME_UUID $DIR_NAME $FILE_SYSTEM $FS_CONFIG 0 2"
    echo "VOLUME_ID=$VOLUME_ID"
    echo "VOLUME_UUID=$VOLUME_UUID"
    echo "VOLUME_FSTAB_CONF=$VOLUME_FSTAB_CONF"

    # Check if data disc is already in fstab and replace the line if it is with the new disc UUID
    echo "Checking fstab for volume $DIR_NAME"
    if [ $(grep -c "$DIR_NAME" /etc/fstab) -gt 0 ]; then
      SED_REPLACEMENT_STRING="$(grep -n "$DIR_NAME" /etc/fstab | cut -d: -f1)s#.*#$VOLUME_FSTAB_CONF#"
      # if file exists, delete it
      if [ -f /etc/fstab.bak ]; then
        rm /etc/fstab.bak
      fi
      cp /etc/fstab /etc/fstab.bak
      sed -i "$SED_REPLACEMENT_STRING" /etc/fstab
    else
      echo "$VOLUME_FSTAB_CONF" | tee -a /etc/fstab
    fi

    mount -a
    chown -R bcuser:bcuser "$DIR_NAME"
  else
    echo "$DIR_NAME volume is mounted, nothing changed"
  fi