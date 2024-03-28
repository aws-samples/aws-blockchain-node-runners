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
  YQ_URI=https://github.com/mikefarah/yq/releases/latest/download/yq_linux_amd64
else
  SSM_AGENT_BINARY_URI=https://s3.amazonaws.com/ec2-downloads-windows/SSMAgent/latest/linux_arm64/amazon-ssm-agent.rpm
  AWS_CLI_BINARY_URI=https://awscli.amazonaws.com/awscli-exe-linux-aarch64.zip
  S5CMD_URI=https://github.com/peak/s5cmd/releases/download/v2.1.0/s5cmd_2.1.0_Linux-arm64.tar.gz
  YQ_URI=https://github.com/mikefarah/yq/releases/latest/download/yq_linux_arm64
fi

echo "Updating and installing required system packages"
yum update -y
yum -y install amazon-cloudwatch-agent collectd jq yq gcc ncurses-devel aws-cfn-bootstrap zstd
wget $YQ_URI -O /usr/bin/yq && chmod +x /usr/bin/yq

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

# Base specific setup starts here

# Set by Base-specic CDK components and stacks
REGION=${_REGION_}
STACK_NAME=${_STACK_NAME_}
RESTORE_FROM_SNAPSHOT=${_RESTORE_FROM_SNAPSHOT_}
FORMAT_DISK=${_FORMAT_DISK_}
NETWORK_ID=${_NETWORK_ID_}
L1_EXECUTION_ENDPOINT=${_L1_EXECUTION_ENDPOINT_}
L1_CONSENSUS_ENDPOINT=${_L1_CONSENSUS_ENDPOINT_}

echo "REGION=$REGION" >> /etc/environment
echo "NETWORK_ID=$NETWORK_ID" >> /etc/environment
echo "L1_EXECUTION_ENDPOINT=$L1_EXECUTION_ENDPOINT" >> /etc/environment
echo "L1_CONSENSUS_ENDPOINT=$L1_CONSENSUS_ENDPOINT" >> /etc/environment

GIT_URL=https://github.com/base-org/node.git
SYNC_CHECKER_FILE_NAME=syncchecker-base.sh

yum -y install docker python3-pip cronie cronie-anacron gcc python3-devel git
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

mkdir -p /data

# Creating run user and making sure it has all necessary permissions
groupadd -g 1002 bcuser
useradd -u 1002 -g 1002 -m -s /bin/bash bcuser
usermod -a -G docker bcuser
usermod -a -G docker ec2-user
chmod -R 755 /home/bcuser

echo "Starting docker"
service docker start
systemctl enable docker

echo "Clonning node repo"
cd /home/bcuser
git clone $GIT_URL
cd ./node

echo "Configuring node"

case $NETWORK_ID in
  "mainnet")
    sed -i "s#OP_NODE_L1_ETH_RPC=https://1rpc.io/eth#OP_NODE_L1_ETH_RPC=$L1_EXECUTION_ENDPOINT#g" /home/bcuser/node/.env.mainnet
    sed -i '/.env.mainnet/s/^#//g' /home/bcuser/node/docker-compose.yml
    sed -i '/OP_NODE_L1_BEACON/s/^#//g' /home/bcuser/node/.env.mainnet
    sed -i "s#OP_NODE_L1_BEACON=https://your.mainnet.beacon.node/endpoint-here#OP_NODE_L1_BEACON=$L1_CONSENSUS_ENDPOINT#g" /home/bcuser/node/.env.mainnet
    ;;
  "sepolia")
    sed -i "s#OP_NODE_L1_ETH_RPC=https://rpc.sepolia.org#OP_NODE_L1_ETH_RPC=$L1_EXECUTION_ENDPOINT#g" /home/bcuser/node/.env.sepolia
    sed -i "/.env.sepolia/s/^#//g" /home/bcuser/node/docker-compose.yml
    sed -i '/OP_NODE_L1_BEACON/s/^#//g' /home/bcuser/node/.env.sepolia
    sed -i "s#OP_NODE_L1_BEACON=https://your.sepolia.beacon.node/endpoint-here#OP_NODE_L1_BEACON=$L1_CONSENSUS_ENDPOINT#g" /home/bcuser/node/.env.sepolia
    ;;
  *)
    echo "Network id is not valid."
    exit 1
    ;;
esac

sed -i "s#GETH_HOST_DATA_DIR=./geth-data#GETH_HOST_DATA_DIR=/data/geth#g" /home/bcuser/node/.env

chown -R bcuser:bcuser /home/bcuser/node

echo "Configuring syncchecker script"
cp /opt/sync-checker/$SYNC_CHECKER_FILE_NAME /opt/syncchecker.sh
chmod 766 /opt/syncchecker.sh

echo "*/5 * * * * /opt/syncchecker.sh" | crontab
crontab -l

echo "Signaling completion to CloudFormation to continue with volume mount"
/opt/aws/bin/cfn-signal --stack $STACK_NAME --resource $RESOURCE_ID --region $REGION

echo "Preparing data volume"

echo "Wait for one minute for the volume to be available"
sleep 60

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

chown -R bcuser:bcuser /data
chmod -R 755 /data

if [ "$RESTORE_FROM_SNAPSHOT" == "false" ]; then
  echo "Skipping restoration from snapshot. Starting docker-compose in 3 min."
  cd /home/bcuser/node
  echo "sudo su bcuser && /usr/local/bin/docker-compose -f /home/bcuser/node/docker-compose.yml up -d" | at now +3 minutes
else
  echo "Restoring data from snapshot"
  chmod 766 /opt/restore-from-snapshot.sh
  echo "/opt/restore-from-snapshot.sh" | at now +3 minutes
fi

echo "All Done!!"
