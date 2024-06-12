#!/bin/bash

source /etc/environment

if [[ "$DATA_VOLUME_TYPE" == "instance-store" ]]; then
  echo "Data volume type is instance store"
  export DATA_VOLUME_ID=/dev/$(lsblk -lnb | awk 'max < $4 {max = $4; vol = $1} END {print vol}')
fi

if [ -n "$DATA_VOLUME_ID" ]; then
  if [ $(df --output=target | grep -c "/data") -lt 1 ]; then
    echo "Checking fstab for Data volume"

    mkfs.ext4 $DATA_VOLUME_ID
    echo "Data volume formatted. Mounting..."
    echo "waiting for volume to get UUID"
    OUTPUT=0;
    while [ "$OUTPUT" = 0 ]; do
      DATA_VOLUME_UUID=$(lsblk -fn -o UUID $DATA_VOLUME_ID)
      OUTPUT=$(echo $DATA_VOLUME_UUID | grep -c - $2)
      echo $OUTPUT
    done
    DATA_VOLUME_UUID=$(lsblk -fn -o UUID  $DATA_VOLUME_ID)
    DATA_VOLUME_FSTAB_CONF="UUID=$DATA_VOLUME_UUID /data ext4 defaults 0 2"
    echo "DATA_VOLUME_ID="$DATA_VOLUME_ID
    echo "DATA_VOLUME_UUID="$DATA_VOLUME_UUID
    echo "DATA_VOLUME_FSTAB_CONF="$DATA_VOLUME_FSTAB_CONF

    # Check if data disc is already in fstab and replace the line if it is with the new disc UUID
    if [ $(grep -c "data" /etc/fstab) -gt 0 ]; then
      SED_REPLACEMENT_STRING="$(grep -n "/data" /etc/fstab | cut -d: -f1)s#.*#$DATA_VOLUME_FSTAB_CONF#"
      cp /etc/fstab /etc/fstab.bak
      sed -i "$SED_REPLACEMENT_STRING" /etc/fstab
    else
      echo $DATA_VOLUME_FSTAB_CONF | sudo tee -a /etc/fstab
    fi

    sudo mount -a

  else
    echo "Data volume is mounted, nothing changed"
  fi
fi
