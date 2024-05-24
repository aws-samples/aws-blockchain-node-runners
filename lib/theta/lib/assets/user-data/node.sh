#!/bin/bash
set +e

echo "AWS_REGION=${_AWS_REGION_}" >> /etc/environment
echo "ASSETS_S3_PATH=${_ASSETS_S3_PATH_}" >> /etc/environment
echo "STACK_NAME=${_STACK_NAME_}" >> /etc/environment
echo "STACK_ID=${_STACK_ID_}" >> /etc/environment
echo "RESOURCE_ID=${_NODE_CF_LOGICAL_ID_}" >> /etc/environment
echo "DATA_VOLUME_TYPE=${_DATA_VOLUME_TYPE_}" >> /etc/environment
echo "DATA_VOLUME_SIZE=${_DATA_VOLUME_SIZE_}" >> /etc/environment
echo "EDGE_NETWORK=${_EDGE_NETWORK_}" >> /etc/environment
echo "EDGE_LAUNCHER_VERSION=${_EDGE_LAUNCHER_VERSION_}" >> /etc/environment
echo "EDGE_NODE_GPU=${_EDGE_NODE_GPU_}" >> /etc/environment
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
yum -y install amazon-cloudwatch-agent collectd jq gcc10-10.5.0-1.amzn2.0.2 ncurses-devel telnet aws-cfn-bootstrap


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

if [ "$EDGE_NODE_GPU" == "enabled"  ]; then
  echo "Installing nvidia drivers"
  yum install kernel-devel-$(uname -r) kernel-headers-$(uname -r) -y

  sudo mv /usr/bin/gcc /usr/bin/gcc.bak
  sudo mv /usr/bin/cc /usr/bin/cc.bak


  sudo ln -s /usr/bin/x86_64-redhat-linux-gcc10-gcc /usr/bin/gcc
  sudo ln -s /usr/bin/x86_64-redhat-linux-gcc10-gcc /usr/bin/cc

  wget https://us.download.nvidia.com/tesla/535.161.08/NVIDIA-Linux-x86_64-535.161.08.run
  chmod +x NVIDIA-Linux-x86_64-535.161.08.run
  yes Y | sudo bash NVIDIA-Linux-x86_64-535.161.08.run --ui=none
  rm NVIDIA-Linux-x86_64-535.161.08.run

  distribution=$(. /etc/os-release;echo $ID$VERSION_ID) \
   && curl -s -L https://nvidia.github.io/nvidia-docker/$distribution/nvidia-docker.repo | sudo tee /etc/yum.repos.d/nvidia-docker.repo

  yum install -y nvidia-docker2

  sudo rm /usr/bin/gcc
  sudo rm /usr/bin/cc

  sudo mv /usr/bin/gcc.bak /usr/bin/gcc
  sudo mv /usr/bin/cc.bak /usr/bin/cc
fi



echo "Installing docker"
yum install docker -y
sudo service docker start
sudo systemctl enable docker





echo 'Adding edgeuser user and group'
sudo groupadd -g 1002 edgeuser
sudo useradd -u 1002 -g 1002 -m -s /bin/bash edgeuser
sudo usermod -aG sudo edgeuser
sudo usermod -aG docker edgeuser

echo "Configuring metricscollector script"
cd /opt
mv /opt/theta_metrics/metricscollector.sh /opt/metricscollector.sh
chmod +x /opt/metricscollector.sh


(crontab -l; echo "*/1 * * * * /opt/metricscollector.sh >/tmp/metricscollector.log 2>&1") | crontab -
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

chown edgeuser:edgeuser -R /data

docker pull thetalabsorg/edgelauncher_mainnet:latest


export EDGE_NODE_PASSWORD=`aws secretsmanager get-secret-value --secret-id edgeNodePassword --query SecretString --output text`

if [[ "$EDGE_NODE_GPU" == "enabled" ]]; then
  docker run -d --gpus all -e EDGELAUNCHER_CONFIG_PATH=/edgelauncher/data/$EDGE_NETWORK -e PASSWORD=$EDGE_NODE_PASSWORD -v /data/edgelauncher:/edgelauncher/data/$EDGE_NETWORK -p 127.0.0.1:15888:15888 -p 127.0.0.1:17888:17888 -p 127.0.0.1:17935:17935 --name edgelauncher --restart unless-stopped -it thetalabsorg/edgelauncher_$EDGE_NETWORK:$EDGE_LAUNCHER_VERSION

else
    docker run -d -e EDGELAUNCHER_CONFIG_PATH=/edgelauncher/data/$EDGE_NETWORK -e PASSWORD=$EDGE_NODE_PASSWORD -v /data/edgelauncher:/edgelauncher/data/$EDGE_NETWORK -p 127.0.0.1:15888:15888 -p 127.0.0.1:17888:17888 -p 127.0.0.1:17935:17935 --name edgelauncher --restart unless-stopped -it thetalabsorg/edgelauncher_$EDGE_NETWORK:$EDGE_LAUNCHER_VERSION
fi


echo "All Done!!"
set -e
