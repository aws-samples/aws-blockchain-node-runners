#!/bin/bash
set +e

# Set by generic single-node and ha-node CDK components
LIFECYCLE_HOOK_NAME=${_LIFECYCLE_HOOK_NAME_}
AUTOSCALING_GROUP_NAME=${_AUTOSCALING_GROUP_NAME_}
ASSETS_S3_PATH=${_ASSETS_S3_PATH_}

# Saving just in case for future use
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

# To be replaced by CDK
NETWORK=${_NETWORK_}

echo "NETWORK=$NETWORK" >> /etc/environment

echo "Updating and installing required system packages"
yum -y install docker python3-pip cronie cronie-anacron gcc python3-devel
yum -y remove python-requests
pip3 install docker-compose
pip3 install hapless
pip3 uninstall -y urllib3
pip3 install 'urllib3<2.0'

echo "Making sure the user has all necessary permissions"
chown -R bcuser:bcuser /data
chmod -R 755 /data
chmod -R 755 /home/bcuser

echo "Starting docker"
service docker start
systemctl enable docker

# RPC node scripts start here

REGION=${_REGION_}
SNAPSHOT_S3_PATH=${_SNAPSHOT_S3_PATH_}
CLIENT_COMBINATION=${_CLIENT_COMBINATION_}
STACK_NAME=${_STACK_NAME_}
FORMAT_DISK=${_FORMAT_DISK_}
DATA_VOLUME_TYPE=${_DATA_VOLUME_TYPE_}

echo "REGION=$REGION" >> /etc/environment
echo "SNAPSHOT_S3_PATH=$SNAPSHOT_S3_PATH" >> /etc/environment
echo "CLIENT_COMBINATION=$CLIENT_COMBINATION" >> /etc/environment
echo "DATA_VOLUME_TYPE=$DATA_VOLUME_TYPE" >> /etc/environment

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

# Select the right docker-compose based on client combination
case $CLIENT_COMBINATION in
  "bor-heimdall")
    # Copy docker-compose file
    cp /opt/docker-compose/docker-compose-bor-heimdall.yml /home/bcuser/docker-compose.yml
    # Configure clients
    /opt/polygon/configure-bor-heimdall.sh $NETWORK
    ;;
  *)
    echo "Combination is not valid."
    exit 1
    ;;
esac

# Copy data from S3 and start clients
  echo "RPC node. Starting copy data script"
  chmod +x /opt/copy-data-from-s3.sh
  echo "/opt/copy-data-from-s3.sh $SNAPSHOT_S3_PATH" | at now +3 minutes