#!/bin/bash

# Grab `DATA_VOLUME_PATH` from environment file.
source /etc/environment

exec >> /setup-instance-store-volumes.sh.log

# Note, it's bad if the DATA_VOLUME_TYPE is `instance-store` because it is
# temporary. We should consider preventing this from being an option.
if [[ "$DATA_VOLUME_TYPE" == "instance-store" ]]; then
  echo "Data volume type is instance store"
  export DATA_VOLUME_ID=/dev/nvme1n1
fi

if [ -n "$DATA_VOLUME_ID" ]; then
  echo "If Data volume is mounted, dont do anything"
  if [ $(df --output=target | grep -c "$DATA_VOLUME_PATH") -lt 1 ]; then
    echo "Checking fstab for Data volume"

    sudo mkfs.xfs -f $DATA_VOLUME_ID
    sleep 10
    DATA_VOLUME_UUID=$(lsblk -fn -o UUID  $DATA_VOLUME_ID)
    DATA_VOLUME_FSTAB_CONF="UUID=$DATA_VOLUME_UUID $DATA_VOLUME_PATH xfs defaults 0 2"
    echo "DATA_VOLUME_ID="$DATA_VOLUME_ID
    echo "DATA_VOLUME_UUID="$DATA_VOLUME_UUID
    echo "DATA_VOLUME_FSTAB_CONF="$DATA_VOLUME_FSTAB_CONF

    # Check if data disc is already in fstab and replace the line if it is with the new disc UUID
    if [ $(grep -c "data" /etc/fstab) -gt 0 ]; then
      SED_REPLACEMENT_STRING="$(grep -n "$DATA_VOLUME_PATH" /etc/fstab | cut -d: -f1)s#.*#$DATA_VOLUME_FSTAB_CONF#"
      sudo cp /etc/fstab /etc/fstab.bak
      sudo sed -i "$SED_REPLACEMENT_STRING" /etc/fstab
    else
      echo $DATA_VOLUME_FSTAB_CONF | sudo tee -a /etc/fstab
    fi

    sudo mount -a

    sudo chown -R stacks:stacks $DATA_VOLUME_PATH
  else
    echo "Data volume is mounted, nothing changed"
  fi
fi
