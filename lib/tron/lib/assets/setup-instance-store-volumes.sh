#!/bin/bash

source /etc/environment

if [[ "$DATA_VOLUME_TYPE" == "instance-store" ]]; then
  echo "Data volume type is instance store"
  export DATA_VOLUME_ID=/dev/$(lsblk -lnb | awk -v VOLUME_SIZE_BYTES="$DATA_VOLUME_SIZE" '{if ($4== VOLUME_SIZE_BYTES) {print $1}}')
fi

if [ -n "$DATA_VOLUME_ID" ]; then
  if [ $(df --output=target | grep -c "/data") -lt 1 ]; then
    echo "Checking fstab for Data volume"

    sudo mkfs.xfs -f $DATA_VOLUME_ID
    sleep 10
    DATA_VOLUME_UUID=$(lsblk -fn -o UUID  $DATA_VOLUME_ID)
    DATA_VOLUME_FSTAB_CONF="UUID=$DATA_VOLUME_UUID /data xfs defaults 0 2"
    echo "DATA_VOLUME_ID="$DATA_VOLUME_ID
    echo "DATA_VOLUME_UUID="$DATA_VOLUME_UUID
    echo "DATA_VOLUME_FSTAB_CONF="$DATA_VOLUME_FSTAB_CONF

    # Check if data disc is already in fstab and replace the line if it is with the new disc UUID
    if [ $(grep -c "data" /etc/fstab) -gt 0 ]; then
      SED_REPLACEMENT_STRING="$(grep -n "/data" /etc/fstab | cut -d: -f1)s#.*#$DATA_VOLUME_FSTAB_CONF#"
      sudo cp /etc/fstab /etc/fstab.bak
      sudo sed -i "$SED_REPLACEMENT_STRING" /etc/fstab
    else
      echo $DATA_VOLUME_FSTAB_CONF | sudo tee -a /etc/fstab
    fi

    sudo mount -a

    /opt/download-snapshot.sh

    chown bcuser:bcuser -R /data
  else
    echo "Data volume is mounted, nothing changed"
  fi
fi
