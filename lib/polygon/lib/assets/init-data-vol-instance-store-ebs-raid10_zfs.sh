#!/bin/bash
set +e

# https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/raid-config.html 

# 1.	 Use MADM to create a RAID 0 array with the two instance store volumes, resulting in a single 15000 GiB hybrid volume.
# a.	sudo mdadm --create –verbose --assume-clean /dev/md0 --level=0 --name=DATA_RAID --raid-devices=2 /dev/nvme1n1 2 /dev/nvme2n1

# 2.	Allow time for the RAID array to initialize and synchronize. You can track the progress of these operations with the following command:
# a.	sudo cat /proc/mdstat

# 4.	In general, you can display detailed information about your RAID array with the following command:
# a.	sudo mdadm --detail /dev/md0

# 5.	Use MADM to configure RAID 1 mirror between the newly created hybrid storage volume with the EBS gp3 volume and used a “write mostly” flag for the latter. 
# a.	sudo mdadm --create –verbose --assume-clean /dev/md0 --level=1 --name=DATA_RAID --raid-devices=2 /dev/md0 --write-mostly /dev/nvme3n1

# 6.	Install and configure OpenZFS file system to further optimise the use of storage using it transparent compression feature….
# a.	Install
# i.	https://unix.stackexchange.com/questions/412442/zfs-on-amazon-linux-ami 
# ii.	https://zfsonlinux.org/  
# b.	Add ZFS pool
# i.	https://wiki.ubuntu.com/Kernel/Reference/ZFS
# c.	Create ZFS file system in the pool
# d.	Enable ZFS compression in the pool
# More on ZFS: https://github.com/allada/eth-archive-snapshot

# TODO: Include the detailed commands to execute on the EC2 instance to configure the setup.
# Explore: https://raid.wiki.kernel.org/index.php/Write-mostly


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