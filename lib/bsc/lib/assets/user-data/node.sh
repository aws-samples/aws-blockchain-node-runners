#!/bin/bash
set +e

echo "AWS_REGION=${_AWS_REGION_}" >> /etc/environment
echo "ASSETS_S3_PATH=${_ASSETS_S3_PATH_}" >> /etc/environment
echo "BSC_SNAPSHOTS_URI=${_BSC_SNAPSHOTS_URI_}" >> /etc/environment
echo "STACK_NAME=${_STACK_NAME_}" >> /etc/environment
echo "STACK_ID=${_STACK_ID_}" >> /etc/environment
echo "RESOURCE_ID=${_NODE_CF_LOGICAL_ID_}" >> /etc/environment
echo "DATA_VOLUME_TYPE=${_DATA_VOLUME_TYPE_}" >> /etc/environment
echo "DATA_VOLUME_SIZE=${_DATA_VOLUME_SIZE_}" >> /etc/environment
echo "BSC_NODE_TYPE=${_BSC_NODE_TYPE_}" >> /etc/environment
echo "BSC_NETWORK=${_BSC_NETWORK_}" >> /etc/environment
echo "LIFECYCLE_HOOK_NAME=${_LIFECYCLE_HOOK_NAME_}" >> /etc/environment
echo "AUTOSCALING_GROUP_NAME=${_AUTOSCALING_GROUP_NAME_}" >> /etc/environment
echo "NODE_ROLE=${_NODE_ROLE_}" >> /etc/environment
source /etc/environment

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
amazon-linux-extras install epel -y
yum groupinstall "Development Tools" -y
yum -y install amazon-cloudwatch-agent collectd jq gcc ncurses-devel telnet aws-cfn-bootstrap

cd /opt

echo 'Installing AWS CLI v2'
curl $AWS_CLI_BINARY_URI -o "awscliv2.zip"
unzip -q awscliv2.zip
./aws/install
rm /usr/bin/aws
ln /usr/local/bin/aws /usr/bin/aws

echo "Downloading assets zip file"
aws s3 cp $ASSETS_S3_PATH ./assets.zip --region $AWS_REGION
unzip -q assets.zip

echo 'Configuring CloudWatch Agent'
cp /opt/cw-agent.json /opt/aws/amazon-cloudwatch-agent/etc/custom-amazon-cloudwatch-agent.json

echo "Starting CloudWatch Agent"
/opt/aws/amazon-cloudwatch-agent/bin/amazon-cloudwatch-agent-ctl \
-a fetch-config -c file:/opt/aws/amazon-cloudwatch-agent/etc/custom-amazon-cloudwatch-agent.json -m ec2 -s
systemctl status amazon-cloudwatch-agent

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

echo 'Adding bcuser user and group'
sudo groupadd -g 1002 bcuser
sudo useradd -u 1002 -g 1002 -m -s /bin/bash bcuser
sudo usermod -aG sudo bcuser

echo "Install BSC geth client"

# download bsc client and configuration
mkdir -p /home/bcuser/bsc
cd /home/bcuser/bsc

if [ "$arch" == "x86_64" ]; then
  wget -O geth  $(curl -s https://api.github.com/repos/bnb-chain/bsc/releases/latest |grep browser_ |grep geth_linux |cut -d\" -f4)
  chmod -v u+x geth
else
  wget -O geth $(curl -s https://api.github.com/repos/bnb-chain/bsc/releases/latest |grep browser_ |grep geth-linux-arm64 |cut -d\" -f4)
  chmod -v u+x geth
fi

# download network configuration
wget $(curl -s https://api.github.com/repos/bnb-chain/bsc/releases/latest |grep browser_ |grep $BSC_NETWORK |cut -d\" -f4)
unzip $BSC_NETWORK.zip

# install aria2 a p2p downloader

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

# finish download and archive
sudo yum install zstd -y
sudo yum install pv -y
zstd --version
pv --version

echo 'Configuring BSC Node service as a system service'
# Copy startup script to correct location
if [[ "$BSC_NODE_TYPE" == "full" ]]; then
  sudo mkdir /home/bcuser/bin
  sudo mv /opt/bsc/rpc-template.sh /home/bcuser/bin/node.sh
fi

sudo chmod +x /home/bcuser/bin/node.sh
sudo chown bcuser:bcuser -R /home/bcuser/

echo "Starting BSC as a service"
sudo bash -c 'cat > /etc/systemd/system/bsc.service <<EOF
[Unit]
Description=BSC Node
After=network-online.target
[Service]
Type=simple
Restart=always
RestartSec=30
User=bcuser
Environment="PATH=/bin:/usr/bin:/home/bcuser/bin"
ExecStart=/home/bcuser/bin/node.sh
[Install]
WantedBy=multi-user.target
EOF'

echo "Configuring syncchecker script"
cd /opt
mv /opt/bsc-checker/syncchecker-bsc.sh /opt/syncchecker.sh
chmod +x /opt/syncchecker.sh


(crontab -l; echo "*/1 * * * * /opt/syncchecker.sh >/tmp/syncchecker.log 2>&1") | crontab -
crontab -l

if [ "$NODE_ROLE" == "single-node"  ]; then
  echo "Single node. Signaling completion to CloudFormation"
  /opt/aws/bin/cfn-signal --stack $STACK_NAME --resource $RESOURCE_ID --region $AWS_REGION
fi

if [ "$NODE_ROLE" == "single-node"  ]; then
  echo "Single node. Wait for one minute for the volume to be available"
  sleep 60
fi

mkdir -p /data

if [[ "$DATA_VOLUME_TYPE" == "instance-store" ]]; then
  echo "Data volume type is instance store"

  cd /opt
  chmod +x /opt/setup-instance-store-volumes.sh

  (crontab -l; echo "@reboot /opt/setup-instance-store-volumes.sh >/tmp/setup-instance-store-volumes.log 2>&1") | crontab -
  crontab -l

  /opt/setup-instance-store-volumes.sh

else
  echo "Data volume type is EBS"

  DATA_VOLUME_ID=/dev/$(lsblk -lnb | awk -v VOLUME_SIZE_BYTES="$DATA_VOLUME_SIZE" '{if ($4== VOLUME_SIZE_BYTES) {print $1}}')
  mkfs -t xfs $DATA_VOLUME_ID
  sleep 10
  DATA_VOLUME_UUID=$(lsblk -fn -o UUID  $DATA_VOLUME_ID)
  DATA_VOLUME_FSTAB_CONF="UUID=$DATA_VOLUME_UUID /data xfs defaults 0 2"
  echo "DATA_VOLUME_ID="$DATA_VOLUME_ID
  echo "DATA_VOLUME_UUID="$DATA_VOLUME_UUID
  echo "DATA_VOLUME_FSTAB_CONF="$DATA_VOLUME_FSTAB_CONF
  echo $DATA_VOLUME_FSTAB_CONF | tee -a /etc/fstab
  mount -a
fi

lsblk -d

# download snapshot if network is mainnet
if [ "$BSC_NETWORK" == "mainnet"  ]; then
  echo "Downloading BSC snapshot"
  chmod +x /opt/download-snapshot.sh
  /opt/download-snapshot.sh
fi

chown bcuser:bcuser -R /data

sudo systemctl daemon-reload
sudo systemctl enable --now bsc

if [[ "$LIFECYCLE_HOOK_NAME" != "none" ]]; then
  echo "Signaling ASG lifecycle hook to complete"
  TOKEN=$(curl -s -X PUT "http://169.254.169.254/latest/api/token" -H "X-aws-ec2-metadata-token-ttl-seconds: 21600")
  INSTANCE_ID=$(curl -H "X-aws-ec2-metadata-token: $TOKEN" -s http://169.254.169.254/latest/meta-data/instance-id)
  aws autoscaling complete-lifecycle-action --lifecycle-action-result CONTINUE --instance-id $INSTANCE_ID --lifecycle-hook-name "$LIFECYCLE_HOOK_NAME" --auto-scaling-group-name "$AUTOSCALING_GROUP_NAME"  --region $AWS_REGION
fi

echo "All Done!!"
set -e
