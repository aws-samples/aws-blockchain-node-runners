#!/bin/bash
set +e

# Set by generic single-node and ha-node CDK components
LIFECYCLE_HOOK_NAME=${_LIFECYCLE_HOOK_NAME_}
AUTOSCALING_GROUP_NAME=${_AUTOSCALING_GROUP_NAME_}
RESOURCE_ID=${_NODE_CF_LOGICAL_ID_}
ASSETS_S3_PATH=${_ASSETS_S3_PATH_}
DATA_VOLUME_TYPE=${_DATA_VOLUME_TYPE_}
DATA_VOLUME_SIZE=${_DATA_VOLUME_SIZE_}
{
  echo "LIFECYCLE_HOOK_NAME=$LIFECYCLE_HOOK_NAME"
  echo "AUTOSCALING_GROUP_NAME=$AUTOSCALING_GROUP_NAME"
  echo "ASSETS_S3_PATH=$ASSETS_S3_PATH"
  echo "DATA_VOLUME_TYPE=$DATA_VOLUME_TYPE"
  echo "DATA_VOLUME_SIZE=$DATA_VOLUME_SIZE"
} >> /etc/environment

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

echo " Installing aria2 a p2p downloader"
cd /tmp

if [ "$arch" == "x86_64" ]; then
  wget https://github.com/q3aql/aria2-static-builds/releases/download/v1.36.0/aria2-1.36.0-linux-gnu-64bit-build1.tar.bz2
  tar jxvf aria2-1.36.0-linux-gnu-64bit-build1.tar.bz2
  cd aria2-1.36.0-linux-gnu-64bit-build1/
  make install
else
  wget https://github.com/q3aql/aria2-static-builds/releases/download/v1.36.0/aria2-1.36.0-linux-gnu-arm-rbpi-build1.tar.bz2
  tar jxvf aria2-1.36.0-linux-gnu-arm-rbpi-build1.tar.bz2
  cd aria2-1.36.0-linux-gnu-arm-rbpi-build1/
  make install
fi

echo " Installing s5cmd"
cd /opt
wget -q $S5CMD_URI -O s5cmd.tar.gz
tar -xf s5cmd.tar.gz
chmod +x s5cmd
mv s5cmd /usr/bin
s5cmd version

cd /opt

echo "Downloading assets zip file"
aws s3 cp $ASSETS_S3_PATH ./assets.zip
unzip -q assets.zip

echo 'Uninstalling AWS CLI v1'
yum remove awscli

echo 'Installing AWS CLI v2'
curl $AWS_CLI_BINARY_URI -o "awscliv2.zip"
unzip -q awscliv2.zip
./aws/install
rm /usr/bin/aws
ln /usr/local/bin/aws /usr/bin/aws

echo 'Installing SSM Agent'
yum install -y $SSM_AGENT_BINARY_URI

# Base specific setup starts here

# Set by Base-specic CDK components and stacks
REGION=${_REGION_}
STACK_NAME=${_STACK_NAME_}
RESTORE_FROM_SNAPSHOT=${_RESTORE_FROM_SNAPSHOT_}
NETWORK_ID=${_NETWORK_ID_}
NODE_CONFIG=${_NODE_CONFIG_}
L1_EXECUTION_ENDPOINT=${_L1_EXECUTION_ENDPOINT_}
L1_CONSENSUS_ENDPOINT=${_L1_CONSENSUS_ENDPOINT_}
SNAPSHOT_URL=${_SNAPSHOT_URL_}

{
  echo "REGION=$REGION"
  echo "NETWORK_ID=$NETWORK_ID"
  echo "NODE_CONFIG=$NODE_CONFIG"
  echo "L1_EXECUTION_ENDPOINT=$L1_EXECUTION_ENDPOINT"
  echo "L1_CONSENSUS_ENDPOINT=$L1_CONSENSUS_ENDPOINT"
  echo "SNAPSHOT_URL=$SNAPSHOT_URL"
} >> /etc/environment

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
    OP_CONFIG_FILE_PATH=/home/bcuser/node/.env.mainnet
    ;;
  "sepolia")
    OP_CONFIG_FILE_PATH=/home/bcuser/node/.env.sepolia
    ;;
  *)
    echo "Network id is not valid."
    exit 1
    ;;
esac

case $NODE_CONFIG in
  "full")
    echo "OP_GETH_GCMODE=full" >> $OP_CONFIG_FILE_PATH
    ;;
  "archive")
     echo "OP_GETH_GCMODE=archive" >> $OP_CONFIG_FILE_PATH
    ;;
  *)
    echo "Network id is not valid."
    exit 1
    ;;
esac

case $NETWORK_ID in
  "mainnet")
    sed -i "s#OP_NODE_L1_ETH_RPC=https://1rpc.io/eth#OP_NODE_L1_ETH_RPC=$L1_EXECUTION_ENDPOINT#g" $OP_CONFIG_FILE_PATH
    sed -i '/.env.mainnet/s/^#//g' /home/bcuser/node/docker-compose.yml
    sed -i '/OP_NODE_L1_BEACON/s/^#//g' $OP_CONFIG_FILE_PATH
    sed -i "s#OP_NODE_L1_BEACON=https://your.mainnet.beacon.node/endpoint-here#OP_NODE_L1_BEACON=$L1_CONSENSUS_ENDPOINT#g" $OP_CONFIG_FILE_PATH
    ;;
  "sepolia")
    sed -i "s#OP_NODE_L1_ETH_RPC=https://rpc.sepolia.org#OP_NODE_L1_ETH_RPC=$L1_EXECUTION_ENDPOINT#g" $OP_CONFIG_FILE_PATH
    sed -i "/.env.sepolia/s/^#//g" /home/bcuser/node/docker-compose.yml
    sed -i '/OP_NODE_L1_BEACON/s/^#//g' $OP_CONFIG_FILE_PATH
    sed -i "s#OP_NODE_L1_BEACON=https://your.sepolia.beacon.node/endpoint-here#OP_NODE_L1_BEACON=$L1_CONSENSUS_ENDPOINT#g" $OP_CONFIG_FILE_PATH
    ;;
  *)
    echo "Network id is not valid."
    exit 1
    ;;
esac

echo "OP_NODE_L1_TRUST_RPC=true"  >> $OP_CONFIG_FILE_PATH

sed -i "s#GETH_HOST_DATA_DIR=./geth-data#GETH_HOST_DATA_DIR=/data/geth#g" /home/bcuser/node/.env

chown -R bcuser:bcuser /home/bcuser/node

echo "Configuring syncchecker script"
cp /opt/sync-checker/$SYNC_CHECKER_FILE_NAME /opt/syncchecker.sh
chmod 766 /opt/syncchecker.sh

echo "*/5 * * * * /opt/syncchecker.sh" | crontab
crontab -l

echo "Configuring node as a service"
mkdir /home/bcuser/bin
mv /opt/base/node-start.sh /home/bcuser/bin/node-start.sh
mv /opt/base/node-stop.sh /home/bcuser/bin/node-stop.sh
chmod 766 /home/bcuser/bin/*
chown -R bcuser:bcuser /home/bcuser

sudo bash -c 'cat > /etc/systemd/system/base.service <<EOF
[Unit]
Description=Base Node
After=network-online.target
[Service]
Type=simple
Restart=always
RestartSec=30
User=bcuser
Environment="PATH=/bin:/usr/bin:/home/bcuser/bin"
ExecStart=/home/bcuser/bin/node-start.sh
[Install]
WantedBy=multi-user.target
EOF'

if [[ "$LIFECYCLE_HOOK_NAME" == "none" ]]; then
  echo "We run single node setup. Signaling completion to CloudFormation to continue with volume mount"
  /opt/aws/bin/cfn-signal --stack $STACK_NAME --resource $RESOURCE_ID --region $REGION
fi

echo "Preparing data volume"

echo "Wait for one minute for the volume to become available"
sleep 60s

if [[ "$DATA_VOLUME_TYPE" == "instance-store" ]]; then
  echo "Data volume type is instance store"

  cd /opt
  chmod +x /opt/setup-instance-store-volumes.sh

  (crontab -l; echo "@reboot /opt/setup-instance-store-volumes.sh >/tmp/setup-instance-store-volumes.log 2>&1") | crontab -
  crontab -l

  DATA_VOLUME_ID=/dev/$(lsblk -lnb | awk 'max < $4 {max = $4; vol = $1} END {print vol}')

else
  echo "Data volume type is EBS"

  DATA_VOLUME_ID=/dev/$(lsblk -lnb | awk -v VOLUME_SIZE_BYTES="$DATA_VOLUME_SIZE" '{if ($4== VOLUME_SIZE_BYTES) {print $1}}')
fi

mkfs -t ext4 $DATA_VOLUME_ID
echo "waiting for volume to get UUID"
  OUTPUT=0;
  while [ "$OUTPUT" = 0 ]; do
    DATA_VOLUME_UUID=$(lsblk -fn -o UUID $DATA_VOLUME_ID)
    OUTPUT=$(echo $DATA_VOLUME_UUID | grep -c - $2)
    echo $OUTPUT
  done
DATA_VOLUME_FSTAB_CONF="UUID=$DATA_VOLUME_UUID /data ext4 defaults 0 2"
echo "DATA_VOLUME_ID="$DATA_VOLUME_ID
echo "DATA_VOLUME_UUID="$DATA_VOLUME_UUID
echo "DATA_VOLUME_FSTAB_CONF="$DATA_VOLUME_FSTAB_CONF
echo $DATA_VOLUME_FSTAB_CONF | tee -a /etc/fstab
mount -a

lsblk -d

chown -R bcuser:bcuser /data
chmod -R 755 /data

echo 'Configuring CloudWatch Agent'
cp /opt/cw-agent.json /opt/aws/amazon-cloudwatch-agent/etc/custom-amazon-cloudwatch-agent.json

echo "Starting CloudWatch Agent"
/opt/aws/amazon-cloudwatch-agent/bin/amazon-cloudwatch-agent-ctl \
-a fetch-config -c file:/opt/aws/amazon-cloudwatch-agent/etc/custom-amazon-cloudwatch-agent.json -m ec2 -s
systemctl restart amazon-cloudwatch-agent

if [ "$RESTORE_FROM_SNAPSHOT" == "false" ]; then
  echo "Skipping restoration from snapshot. Starting node"
  systemctl daemon-reload
  systemctl enable --now base
else
  echo "Restoring full node from snapshot over http"
  chmod +x /opt/restore-from-snapshot-http.sh
  echo "/opt/restore-from-snapshot-http.sh" | at now + 1 min
fi

if [[ "$LIFECYCLE_HOOK_NAME" != "none" ]]; then
  echo "Signaling ASG lifecycle hook to complete"
  TOKEN=$(curl -s -X PUT "http://169.254.169.254/latest/api/token" -H "X-aws-ec2-metadata-token-ttl-seconds: 21600")
  INSTANCE_ID=$(curl -H "X-aws-ec2-metadata-token: $TOKEN" -s http://169.254.169.254/latest/meta-data/instance-id)
  aws autoscaling complete-lifecycle-action --lifecycle-action-result CONTINUE --instance-id $INSTANCE_ID --lifecycle-hook-name "$LIFECYCLE_HOOK_NAME" --auto-scaling-group-name "$AUTOSCALING_GROUP_NAME"  --region $REGION
fi

echo "All Done!!"
set -e
