#!/bin/bash
set +e

# Set by generic single-node and ha-node CDK components
ASSETS_S3_PATH=${_ASSETS_S3_PATH_}

# Saving just in case for future use
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

echo "Adding blockchain user and group"
groupadd -g 1002 bcuser
useradd -u 1002 -g 1002 -m -s /bin/bash bcuser
usermod -a -G docker bcuser
usermod -a -G docker ec2-user

# Setting up sync node

REGION=${_REGION_}
STACK_NAME=${_STACK_NAME_}
RESOURCE_ID=${_RESOURCE_ID_}
SNAPSHOT_S3_PATH=${_SNAPSHOT_S3_PATH_}
CLIENT_COMBINATION=${_CLIENT_COMBINATION_}
NETWORK=${_NETWORK_}
DATA_VOLUME_TYPE=${_DATA_VOLUME_TYPE_}
FORMAT_DISK=${_FORMAT_DISK_}

# Saving just in case for future use
echo "REGION=$REGION" >> /etc/environment
echo "STACK_NAME=$STACK_NAME" >> /etc/environment
echo "RESOURCE_ID=$RESOURCE_ID" >> /etc/environment
echo "SNAPSHOT_S3_PATH=$SNAPSHOT_S3_PATH" >> /etc/environment
echo "NETWORK=$NETWORK" >> /etc/environment
echo "DATA_VOLUME_TYPE=$DATA_VOLUME_TYPE" >> /etc/environment
echo "FORMAT_DISK=$FORMAT_DISK" >> /etc/environment

# Check if aria2c is installed
sudo yum update -y
sudo amazon-linux-extras install epel -y
sudo yum install zstd  pv aria2 -y 

echo "Signaling completion to CloudFormation"
/opt/aws/bin/cfn-signal --stack $STACK_NAME --resource $RESOURCE_ID --region $REGION

# Configure data volume
if [ "$DATA_VOLUME_TYPE" == "instance-store" ]; then
    chmod +x /opt/init-data-vol-instance-store.sh

    (crontab -l; echo "@reboot /opt/init-data-vol-instance-store.sh >/tmp/init-data-vol-instance-store.log 2>&1") | crontab -
    crontab -l

    /opt/init-data-vol-instance-store.sh
else
  chmod +x /opt/init-data-vol-ebs.sh
  /opt/init-data-vol-ebs.sh $FORMAT_DISK
fi

chmod +x /opt/polygon/download-extract-polygon-snapshot.sh

# Download the snapshot
case $CLIENT_COMBINATION in
  "bor-heimdall")
    mkdir -p /data/polygon/bor/bor/chaindata
    mkdir -p /data/polygon/heimdall/data
    echo "/opt/polygon/download-extract-polygon-snapshot.sh -n $NETWORK -c bor -d /data/polygon/bor/bor/chaindata -v true -s3 $SNAPSHOT_S3_PATH" | at now +3 minutes
    echo "/opt/polygon/download-extract-polygon-snapshot.sh -n $NETWORK -c heimdall -d /data/polygon/heimdall/data -v true -s3 $SNAPSHOT_S3_PATH" | at now +4 minutes
    ;;
  *)
    echo "Combination is not valid."
    exit 1
    ;;
esac