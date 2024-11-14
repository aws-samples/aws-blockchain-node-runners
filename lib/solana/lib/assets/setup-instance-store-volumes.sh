#!/bin/bash

source /etc/environment

if [[ "$DATA_VOLUME_TYPE" == "instance-store" ]]; then
  echo "Data volume type is instance store"
  export DATA_VOLUME_ID=/dev/nvme1n1
fi

if [[ "$ACCOUNTS_VOLUME_TYPE" == "instance-store" ]]; then
  echo "Accounts volume type is instance store"
  if [[ "$DATA_VOLUME_TYPE" == "instance-store" ]]; then
    export ACCOUNTS_VOLUME_ID=/dev/nvme2n1
  else
    export ACCOUNTS_VOLUME_ID=/dev/nvme1n1
  fi
fi

if [ -n "$DATA_VOLUME_ID" ]; then
  echo "If Data volume is mounted, dont do anything"
  if [ $(df --output=target | grep -c "/data/solana/data") -lt 1 ]; then
    echo "Checking fstab for Data volume"

    sudo mkfs.xfs -f $DATA_VOLUME_ID
    sleep 10
    DATA_VOLUME_UUID=$(lsblk -fn -o UUID  $DATA_VOLUME_ID)
    DATA_VOLUME_FSTAB_CONF="UUID=$DATA_VOLUME_UUID /data/solana/data xfs defaults 0 2"
    echo "DATA_VOLUME_ID="$DATA_VOLUME_ID
    echo "DATA_VOLUME_UUID="$DATA_VOLUME_UUID
    echo "DATA_VOLUME_FSTAB_CONF="$DATA_VOLUME_FSTAB_CONF

    # Check if data disc is already in fstab and replace the line if it is with the new disc UUID
    if [ $(grep -c "data" /etc/fstab) -gt 0 ]; then
      SED_REPLACEMENT_STRING="$(grep -n "/data/solana/data" /etc/fstab | cut -d: -f1)s#.*#$DATA_VOLUME_FSTAB_CONF#"
      sudo cp /etc/fstab /etc/fstab.bak
      sudo sed -i "$SED_REPLACEMENT_STRING" /etc/fstab
    else
      echo $DATA_VOLUME_FSTAB_CONF | sudo tee -a /etc/fstab
    fi

    sudo mount -a

    sudo mkdir /data/solana/data/ledger
    sudo chown -R solana:solana /data/solana
  else
    echo "Data volume is mounted, nothing changed"
  fi
fi

if [ -n "$ACCOUNTS_VOLUME_ID" ]; then
  echo "If Accounts volume is mounted, dont do anything"
  if [ $(df --output=target | grep -c "/data/solana/accounts") -lt 1 ]; then
    echo "Checking fstab for Accounts volume"

    sudo mkfs.xfs -f $ACCOUNTS_VOLUME_ID
    sleep 10
    ACCOUNTS_VOLUME_UUID=$(lsblk -fn -o UUID $ACCOUNTS_VOLUME_ID)
    ACCOUNTS_VOLUME_FSTAB_CONF="UUID=$ACCOUNTS_VOLUME_UUID /data/solana/accounts xfs defaults 0 2"
    echo "ACCOUNTS_VOLUME_ID="$ACCOUNTS_VOLUME_ID
    echo "ACCOUNTS_VOLUME_UUID="$ACCOUNTS_VOLUME_UUID
    echo "ACCOUNTS_VOLUME_FSTAB_CONF="$ACCOUNTS_VOLUME_FSTAB_CONF

    # Check if accounts disc is already in fstab and replace the line if it is with the new disc UUID
    if [ $(grep -c "/data/solana/accounts" /etc/fstab) -gt 0 ]; then
      SED_REPLACEMENT_STRING="$(grep -n "/data/solana/accounts" /etc/fstab | cut -d: -f1)s#.*#$ACCOUNTS_VOLUME_FSTAB_CONF#"
      sudo cp /etc/fstab /etc/fstab.bak
      sudo sed -i "$SED_REPLACEMENT_STRING" /etc/fstab
    else
      echo $ACCOUNTS_VOLUME_FSTAB_CONF | sudo tee -a /etc/fstab
    fi

    sudo mount -a

    sudo chown -R solana:solana /data/solana
  else
    echo "Accounts volume is mounted, nothing changed"
  fi
fi
