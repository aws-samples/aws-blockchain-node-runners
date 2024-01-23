#!/bin/bash
set +e

# Set by generic single-node and ha-node CDK components
LIFECYCLE_HOOK_NAME=${_LIFECYCLE_HOOK_NAME_}
AUTOSCALING_GROUP_NAME=${_AUTOSCALING_GROUP_NAME_}
RESOURCE_ID=${_NODE_CF_LOGICAL_ID_}
ASSETS_S3_PATH=${_ASSETS_S3_PATH_}
echo "LIFECYCLE_HOOK_NAME=$LIFECYCLE_HOOK_NAME" >> /etc/environment
echo "AUTOSCALING_GROUP_NAME=$AUTOSCALING_GROUP_NAME" >> /etc/environment
echo "ASSETS_S3_PATH=$ASSETS_S3_PATH" >> /etc/environment

arch=$(uname -m)

echo "Architecture detected: $arch"

if [ "$arch" == "x86_64" ]; then
  SSM_AGENT_BINARY_URI=https://s3.amazonaws.com/ec2-downloads-windows/SSMAgent/latest/linux_amd64/amazon-ssm-agent.rpm
  AWS_CLI_BINARY_URI=https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip
  S5CMD_URI=https://github.com/peak/s5cmd/releases/download/v2.1.0/s5cmd_2.1.0_Linux-64bit.tar.gz
else
  SSM_AGENT_BINARY_URI=https://s3.amazonaws.com/ec2-downloads-windows/SSMAgent/latest/linux_arm64/amazon-ssm-agent.rpm
  AWS_CLI_BINARY_URI=https://awscli.amazonaws.com/awscli-exe-linux-aarch64.zip
  S5CMD_URI=https://github.com/peak/s5cmd/releases/download/v2.1.0/s5cmd_2.1.0_Linux-arm64.tar.gz
fi

echo "Updating and installing required system packages"
yum update -y
yum -y install amazon-cloudwatch-agent collectd jq gcc ncurses-devel telnet aws-cfn-bootstrap

cd /opt

echo "Downloading assets zip file"
aws s3 cp $ASSETS_S3_PATH ./assets.zip
unzip -q assets.zip

echo 'Configuring CloudWatch Agent'
cp /opt/cw-agent.json /opt/aws/amazon-cloudwatch-agent/etc/custom-amazon-cloudwatch-agent.json

echo "Starting CloudWatch Agent"
/opt/aws/amazon-cloudwatch-agent/bin/amazon-cloudwatch-agent-ctl \
-a fetch-config -c file:/opt/aws/amazon-cloudwatch-agent/etc/custom-amazon-cloudwatch-agent.json -m ec2 -s
systemctl status amazon-cloudwatch-agent

echo 'Uninstalling AWS CLI v1'
yum remove awscli

echo 'Installing AWS CLI v2'
curl $AWS_CLI_BINARY_URI -o "awscliv2.zip"
unzip -q awscliv2.zip
./aws/install
rm /usr/bin/aws
ln /usr/local/bin/aws /usr/bin/aws

aws configure set default.s3.max_concurrent_requests 50
aws configure set default.s3.multipart_chunksize 256MB

echo 'Installing SSM Agent'
yum install -y $SSM_AGENT_BINARY_URI

echo "Installing s5cmd"
cd /opt
wget -q $S5CMD_URI -O s5cmd.tar.gz
tar -xf s5cmd.tar.gz
chmod +x s5cmd
mv s5cmd /usr/bin
s5cmd version

# Ethereum specific setup starts here

# Set by Ethereum-specic CDK components and stacks
REGION=${_REGION_}
SNAPSHOT_S3_PATH=${_SNAPSHOT_S3_PATH_}
ETH_CLIENT_COMBINATION=${_ETH_CLIENT_COMBINATION_}
STACK_NAME=${_STACK_NAME_}
AUTOSTART_CONTAINER=${_AUTOSTART_CONTAINER_}
FORMAT_DISK=${_FORMAT_DISK_}
NODE_ROLE=${_NODE_ROLE_}

echo "REGION=$REGION" >> /etc/environment
echo "SNAPSHOT_S3_PATH=$SNAPSHOT_S3_PATH" >> /etc/environment
echo "ETH_CLIENT_COMBINATION=$ETH_CLIENT_COMBINATION" >> /etc/environment
echo "NODE_ROLE=$NODE_ROLE" >> /etc/environment

echo "Ethereum Client combination: $ETH_CLIENT_COMBINATION"

# Can add more combination in the future
case $ETH_CLIENT_COMBINATION in
  "besu-teku")
    SYNC_CHECKER_FILE_NAME=syncchecker-besu-teku.sh
    DOCKER_COMPOSE_FILE_NAME=docker-compose-besu-teku.yml
    ;;
  "geth-lighthouse")
    SYNC_CHECKER_FILE_NAME=syncchecker-geth-lighthouse.sh
    DOCKER_COMPOSE_FILE_NAME=docker-compose-geth-lighthouse.yml
    ;;
  "erigon-lighthouse")
    SYNC_CHECKER_FILE_NAME=syncchecker-erigon-lighthouse.sh
    DOCKER_COMPOSE_FILE_NAME=docker-compose-erigon-lighthouse.yml
    ;;
  "erigon-prysm")
    SYNC_CHECKER_FILE_NAME=syncchecker-erigon-prysm.sh
    DOCKER_COMPOSE_FILE_NAME=docker-compose-erigon-prysm.yml
    ;;
  "nethermind-teku")
    SYNC_CHECKER_FILE_NAME=syncchecker-nethermind-teku.sh
    DOCKER_COMPOSE_FILE_NAME=docker-compose-nethermind-teku.yml
    ;;
  *)
    echo "Combination is not valid."
    exit 1
    ;;
esac

yum -y install docker python3-pip cronie cronie-anacron gcc python3-devel
yum -y remove python-requests
pip3 install docker-compose
pip3 install hapless
pip3 uninstall -y urllib3
pip3 install 'urllib3<2.0'

echo "Assigning Swap Space"
# Check if a swap file already exists
if [ -f /swapfile ]; then
  # Remove the existing swap file
  swapoff /swapfile
  rm -rf /swapfile
fi

# Create a new swap file
total_mem=$(grep MemTotal /proc/meminfo | awk '{print $2}')
# Calculate the swap size
swap_size=$((total_mem / 3))
# Convert the swap size to MB
swap_size_mb=$((swap_size / 1024))
unit=M
fallocate -l $swap_size_mb$unit /swapfile
chmod 600 /swapfile
mkswap /swapfile
swapon /swapfile

# Enable the swap space to persist after reboot.
echo "/swapfile none swap sw 0 0" | sudo tee -a /etc/fstab

sysctl vm.swappiness=6
sysctl vm.vfs_cache_pressure=10
echo "vm.swappiness=10" | sudo tee -a /etc/sysctl.conf
echo "vm.vfs_cache_pressure=10"  | sudo tee -a /etc/sysctl.conf

free -h

echo 'Preparing secrets'
mkdir -p /secrets
openssl rand -hex 32 | tr -d "\n" | sudo tee /secrets/jwtsecret

mkdir -p /data

# Creating run user and making sure it has all necessary permissions
groupadd -g 1002 ethereum
useradd -u 1002 -g 1002 -m -s /bin/bash ethereum
usermod -a -G docker ethereum
usermod -a -G docker ec2-user
chown -R ethereum:ethereum /secrets
chmod -R 755 /home/ethereum
chmod -R 755 /secrets

echo "Starting docker"
service docker start
systemctl enable docker

echo "Copying docker-compose file"
cp ./docker-compose/$DOCKER_COMPOSE_FILE_NAME /home/ethereum/docker-compose.yml

if [ "$ETH_CLIENT_COMBINATION" = "erigon-lighthouse" ] || [ "$ETH_CLIENT_COMBINATION" = "erigon-prysm" ]; then
    echo "Configuring correct image architecture for Erigon"
    if [ "$arch" = "x86_64" ]; then
        sed -i 's/__IMAGE_ARCH__/amd64/g' /home/ethereum/docker-compose.yml
    else
        sed -i 's/__IMAGE_ARCH__/arm64/g' /home/ethereum/docker-compose.yml
    fi
    chown -R ethereum:ethereum /home/ethereum/docker-compose.yml
fi

echo "Configuring syncchecker script"
cp /opt/sync-checker/$SYNC_CHECKER_FILE_NAME /opt/syncchecker.sh
chmod 766 /opt/syncchecker.sh

echo "*/5 * * * * /opt/syncchecker.sh" | crontab
crontab -l

if [ "$NODE_ROLE" == "sync-node" ]; then
  echo "Sync node. Configuring snapshotting script."
  chmod 766 /opt/copy-data-to-s3.sh
fi

if [ "$NODE_ROLE" == "sync-node" ] || [ "$NODE_ROLE" == "single-node"  ]; then
  echo "Single node. Signaling completion to CloudFormation"
  /opt/aws/bin/cfn-signal --stack $STACK_NAME --resource $RESOURCE_ID --region $REGION
fi

echo "Preparing data volume"

if [ "$NODE_ROLE" == "sync-node" ] || [ "$NODE_ROLE" == "single-node"  ]; then
  # echo "Sync node. Wait for the volume to be attached"
  # aws ec2 wait volume-available --volume-ids $DATA_VOLUME_ID --region $REGION

  echo "Single node. Wait for one minute for the volume to be available"
  sleep 60
fi

if $(lsblk | grep -q nvme1n1); then
  echo "nvme1n1 is found. Configuring attached storage"

  if [ "$FORMAT_DISK" == "false" ]; then
    echo "Not creating a new filesystem in the disk. Existing data might be present!!"
  else
    mkfs -t ext4 /dev/nvme1n1
  fi

  sleep 10
  # Define the line to add to fstab
  uuid=$(lsblk -n -o UUID /dev/nvme1n1)
  line="UUID=$uuid /data ext4 defaults 0 2"

  # Write the line to fstab
  echo $line | sudo tee -a /etc/fstab

  mount -a

else
  echo "nvme1n1 is not found. Not doing anything"
fi

lsblk -d

mkdir -p /data/execution
mkdir -p /data/consensus
mkdir -p /data/execution/data
mkdir -p /data/execution/others
mkdir -p /data/consensus/data

chown -R ethereum:ethereum /data
chmod -R 755 /data

if [ "$NODE_ROLE" == "sync-node" ] || [ "$NODE_ROLE" == "single-node"  ]; then
  if [ "$AUTOSTART_CONTAINER" == "false" ]; then
    echo "Single node. Autostart disabled. Start docker-compose manually!"
  else
    echo "Single node. Autostart enabled. Starting docker-compose in 3 min."
    echo "sudo su ethereum && /usr/local/bin/docker-compose -f /home/ethereum/docker-compose.yml up -d" | at now +3 minutes
  fi
fi

if [ "$NODE_ROLE" == "rpc-node" ]; then
  echo "RPC node. Starting copy data script"
  chmod 766 /opt/copy-data-from-s3.sh
  echo "/opt/copy-data-from-s3.sh" | at now +3 minutes
fi

echo "All Done!!"
