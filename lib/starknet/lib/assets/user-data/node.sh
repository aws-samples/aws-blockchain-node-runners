#!/bin/bash
set +e

{
  echo "AWS_REGION=${_AWS_REGION_}"
  echo "ASSETS_S3_PATH=${_ASSETS_S3_PATH_}"
  echo "STACK_NAME=${_STACK_NAME_}"
  echo "STACK_ID=${_STACK_ID_}"
  echo "RESOURCE_ID=${_NODE_CF_LOGICAL_ID_}"
  echo "DATA_VOLUME_TYPE=${_DATA_VOLUME_TYPE_}"
  echo "DATA_VOLUME_SIZE=${_DATA_VOLUME_SIZE_}"
  echo "STARKNET_NODE_VERSION=${_STARKNET_NODE_VERSION_}"
  echo "STARKNET_NETWORK_ID=${_STARKNET_NETWORK_ID_}"
  echo "STARKNET_L1_ENDPOINT=${_STARKNET_L1_ENDPOINT_}"
  echo "SNAPSHOT_URL=${_SNAPSHOT_URL_}"
} >> /etc/environment

source /etc/environment

arch=$(uname -m)

apt-get -yqq update
apt-get -yqq install -y build-essential cargo pkg-config git upx-ucl libjemalloc-dev libjemalloc2 awscli jq unzip python3-pip

cd /tmp

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

cd /opt

echo "Downloading assets zip file"
aws s3 cp $ASSETS_S3_PATH ./assets.zip
unzip -q assets.zip


echo "Install and configure CloudWatch agent"
wget -q https://s3.amazonaws.com/amazoncloudwatch-agent/ubuntu/amd64/latest/amazon-cloudwatch-agent.deb
dpkg -i -E amazon-cloudwatch-agent.deb

echo 'Configuring CloudWatch Agent'
mkdir -p /opt/aws/amazon-cloudwatch-agent/etc/
cp /opt/cw-agent.json /opt/aws/amazon-cloudwatch-agent/etc/custom-amazon-cloudwatch-agent.json

echo "Starting CloudWatch Agent"
/opt/aws/amazon-cloudwatch-agent/bin/amazon-cloudwatch-agent-ctl \
-a fetch-config -c file:/opt/aws/amazon-cloudwatch-agent/etc/custom-amazon-cloudwatch-agent.json -m ec2 -s
systemctl status amazon-cloudwatch-agent

# Once the EC2 instance ready, notify Cloudformation the instance is ready
if [[ "$STACK_ID" != "none" ]]; then
  echo "Install and enable CloudFormation helper scripts"
  mkdir -p /opt/aws/
  pip3 install https://s3.amazonaws.com/cloudformation-examples/aws-cfn-bootstrap-py3-latest.tar.gz
  sudo ln -s /usr/local/init/ubuntu/cfn-hup /etc/init.d/cfn-hup

  echo "Configuring CloudFormation helper scripts"
  mkdir -p /etc/cfn/
  mv /opt/cfn-hup/cfn-hup.conf /etc/cfn/cfn-hup.conf
  sed -i "s;__AWS_STACK_ID__;\"$STACK_ID\";g" /etc/cfn/cfn-hup.conf
  sed -i "s;__AWS_REGION__;\"$AWS_REGION\";g" /etc/cfn/cfn-hup.conf

  mkdir -p /etc/cfn/hooks.d/
  mv /opt/cfn-hup/cfn-auto-reloader.conf /etc/cfn/hooks.d/cfn-auto-reloader.conf
  sed -i "s;__AWS_STACK_NAME__;\"$STACK_NAME\";g" /etc/cfn/hooks.d/cfn-auto-reloader.conf
  sed -i "s;__AWS_REGION__;\"$AWS_REGION\";g" /etc/cfn/hooks.d/cfn-auto-reloader.conf

  echo "Starting CloudFormation helper scripts as a service"
  mv /opt/cfn-hup/cfn-hup.service  /etc/systemd/system/cfn-hup.service

  systemctl daemon-reload
  systemctl enable --now cfn-hup
  systemctl start cfn-hup.service

  cfn-signal --stack $STACK_NAME --resource $RESOURCE_ID --region $AWS_REGION
fi

echo "Waiting for volumes to be available"
sleep 60

mkdir "/data"

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
sleep 10
DATA_VOLUME_UUID=$(lsblk -fn -o UUID $DATA_VOLUME_ID)
DATA_VOLUME_FSTAB_CONF="UUID=$DATA_VOLUME_UUID /data ext4 defaults 0 2"
echo "DATA_VOLUME_ID="$DATA_VOLUME_ID
echo "DATA_VOLUME_UUID="$DATA_VOLUME_UUID
echo "DATA_VOLUME_FSTAB_CONF="$DATA_VOLUME_FSTAB_CONF
echo $DATA_VOLUME_FSTAB_CONF | tee -a /etc/fstab
mount -a

mkdir "/data/juno"
mount -a
chown ubuntu:ubuntu -R /data

echo "Install Juno Starknet agent"

cd /home/ubuntu

git clone --branch $STARKNET_NODE_VERSION --single-branch https://github.com/NethermindEth/juno.git juno-source
cd /home/ubuntu/juno-source

echo "Install Go 1.22 Version"
snap info go
snap install go --channel=1.22/stable --classic

export GOPATH=/snap/bin/go
go env|grep CACHE
sudo su - ubuntu

echo "Build"
cd /home/ubuntu/juno-source
echo "Build: running..."
sudo make juno
alias juno=./build/bin/juno
sudo chown ubuntu:ubuntu -R ../juno-source
echo "Build: done"

# Copy startup script to correct location
sudo mkdir "/home/ubuntu/bin/"
sudo mv /opt/starknet/rpc-template.sh /home/ubuntu/bin/node.sh
sudo chmod +x /home/ubuntu/bin/node.sh
sudo mkdir /var/log/starknet
sudo chown ubuntu:ubuntu /var/log/starknet

echo "Configuring starknet as a service"
sudo bash -c 'cat > /etc/systemd/system/starknet.service <<EOF
[Unit]
Description=Starknet Node
After=network.target
StartLimitIntervalSec=0

[Service]
Type=simple
Restart=always
RestartSec=1
User=ubuntu
LimitNOFILE=1000000
LogRateLimitIntervalSec=0
Environment="PATH=/bin:/usr/bin:/home/ubuntu/bin"
Environment="_STARKNET_NETWORK_ID_=$(echo $STARKNET_NETWORK_ID)"
Environment="_STARKNET_L1_ENDPOINT_=$(echo $STARKNET_L1_ENDPOINT)"
ExecStart=/home/ubuntu/bin/node.sh
StandardOutput=file:/var/log/starknet/std.log
StandardError=file:/var/log/starknet/error.log

[Install]
WantedBy=multi-user.target
EOF'

if [ "$RESTORE_FROM_SNAPSHOT" == "false" ]; then
  echo "Skipping restoration from snapshot. Starting node"
  systemctl daemon-reload
  systemctl enable --now starknet
else
  echo "Restoring node from snapshot"
  chmod +x /opt/restore-from-snapshot.sh
  echo "/opt/restore-from-snapshot.sh" | at now + 1 min
fi

# Configuring logrotate
sudo bash -c 'sudo cat > logrotate.starkneterr <<EOF
/var/log/starknet/error.log {
  rotate 7
  daily
  missingok
  postrotate
    systemctl kill -s USR1 starknet.service
  endscript
}
EOF'

sudo cp logrotate.starkneterr /etc/logrotate.d/starkneterr
sudo systemctl restart logrotate.service

echo "Configuring syncchecker script"
cd /opt
sudo mv /opt/sync-checker/syncchecker-starknet.sh /opt/syncchecker.sh
sudo chmod +x /opt/syncchecker.sh

echo "*/5 * * * * /opt/syncchecker.sh" | crontab
crontab -l 
echo "All done!"