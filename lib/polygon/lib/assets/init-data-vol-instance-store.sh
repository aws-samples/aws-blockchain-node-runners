#!/bin/bash
set +e

echo "Preparing instance store data volume"
export DATA_VOLUME_ID=/dev/nvme1n1
export DATA_DIRECTORY=/data

mkdir -p $DATA_DIRECTORY

echo "If Data volume is mounted, dont do anything"
if [ $(df --output=target | grep -c "$DATA_DIRECTORY") -lt 1 ]; then
  echo "Checking fstab for Data volume"

  sudo mkfs.xfs -f $DATA_VOLUME_ID
  sleep 10
  DATA_VOLUME_UUID=$(lsblk -fn -o UUID  $DATA_VOLUME_ID)
  DATA_VOLUME_FSTAB_CONF="UUID=$DATA_VOLUME_UUID $DATA_DIRECTORY xfs defaults 0 2"
  echo "DATA_VOLUME_ID="$DATA_VOLUME_ID
  echo "DATA_VOLUME_UUID="$DATA_VOLUME_UUID
  echo "DATA_VOLUME_FSTAB_CONF="$DATA_VOLUME_FSTAB_CONF

  # Check if data disc is already in fstab and replace the line if it is with the new disc UUID
  if [ $(grep -c "$DATA_DIRECTORY" /etc/fstab) -gt 0 ]; then
    SED_REPLACEMENT_STRING="$(grep -n "$DATA_DIRECTORY" /etc/fstab | cut -d: -f1)s#.*#$DATA_VOLUME_FSTAB_CONF#"
    sudo cp /etc/fstab /etc/fstab.bak
    sudo sed -i "$SED_REPLACEMENT_STRING" /etc/fstab
  else
    echo $DATA_VOLUME_FSTAB_CONF | sudo tee -a /etc/fstab
  fi

  sudo mount -a

  chown -R bcuser:bcuser $DATA_DIRECTORY
  chmod -R 755 $DATA_DIRECTORY
else
  echo "Data volume is mounted, nothing changed"
fi