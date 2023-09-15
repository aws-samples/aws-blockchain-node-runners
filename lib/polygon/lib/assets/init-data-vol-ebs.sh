#!/bin/bash
set +e

FORMAT_VOLUME=${_FORMAT_VOLUME_}

# Check if all parameters are provided
if [ "$#" -ne 1 ]; then
    echo "Usage: bash [FORMAT_VOLUME]"
    echo "FORMAT_VOLUME: true or false"
    exit 1
fi

# Assign parameters to variables
FORMAT_VOLUME="$1"

export DATA_VOLUME_NAME=nvme1n1
export DATA_VOLUME_ID=/dev/$DATA_VOLUME_NAME
export DATA_DIRECTORY=/data

mkdir -p $DATA_DIRECTORY

echo "Preparing EBS data volume"

echo "Wait for one minute for the volume to be available"
sleep 60

if $(lsblk | grep -q $DATA_VOLUME_NAME); then
  echo "$DATA_VOLUME_NAME is found. Configuring attached storage"

  if [ "$FORMAT_VOLUME" == "false" ]; then
    echo "Not creating a new filesystem in the VOLUME. Existing data might be present!!"
  else
    mkfs -t ext4 $DATA_VOLUME_ID
  fi

  sleep 10
  # Define the line to add to fstab
  DATA_VOLUME_UUID=$(lsblk -n -o UUID $DATA_VOLUME_ID)
  line="UUID=$DATA_VOLUME_UUID $DATA_DIRECTORY ext4 defaults 0 2"

  # Write the line to fstab
  echo $line | sudo tee -a /etc/fstab
  
  mount -a

else
  echo "nvme1n1 is not found. Not doing anything"
fi

lsblk -d

chown -R bcuser:bcuser $DATA_DIRECTORY
chmod -R 755 $DATA_DIRECTORY