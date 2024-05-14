#!/bin/bash
set +e

echo "AWS_REGION=${_AWS_REGION_}" >> /etc/environment
echo "ASSETS_S3_PATH=${_ASSETS_S3_PATH_}" >> /etc/environment
echo "STACK_NAME=${_STACK_NAME_}" >> /etc/environment
echo "STACK_ID=${_STACK_ID_}" >> /etc/environment
echo "RESOURCE_ID=${_NODE_CF_LOGICAL_ID_}" >> /etc/environment
echo "DATA_VOLUME_TYPE=${_DATA_VOLUME_TYPE_}" >> /etc/environment
echo "DATA_VOLUME_SIZE=${_DATA_VOLUME_SIZE_}" >> /etc/environment
echo "STARKNET_NODE_VERSION=${_STARKNET_NODE_VERSION_}" >> /etc/environment
echo "STARKNET_NETWORK_ID=${_STARKNET_NETWORK_ID_}" >> /etc/environment
echo "STARKNET_L1_ENDPOINT=${_STARKNET_L1_ENDPOINT_}" >> /etc/environment
source /etc/environment

sudo apt-get -yqq update
sudo apt-get -yqq install -y build-essential cargo pkg-config git upx-ucl libjemalloc-dev libjemalloc2 awscli jq unzip python3-pip

cd /opt

echo "Downloading assets zip file"
aws s3 cp $ASSETS_S3_PATH ./assets.zip
unzip -q assets.zip


echo "Install and configure CloudWatch agent"
wget -q https://s3.amazonaws.com/amazoncloudwatch-agent/ubuntu/amd64/latest/amazon-cloudwatch-agent.deb
sudo dpkg -i -E amazon-cloudwatch-agent.deb

echo 'Configuring CloudWatch Agent'
mkdir -p /opt/aws/amazon-cloudwatch-agent/etc/
cp /opt/cw-agent.json /opt/aws/amazon-cloudwatch-agent/etc/custom-amazon-cloudwatch-agent.json

echo "Starting CloudWatch Agent"
sudo /opt/aws/amazon-cloudwatch-agent/bin/amazon-cloudwatch-agent-ctl \
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

echo "Install Juno Starknet agent"
pwd
whoami
cd /home/ubuntu
pwd
git clone --branch $STARKNET_NODE_VERSION --single-branch https://github.com/NethermindEth/juno.git juno-source
cd /home/ubuntu/juno-source

echo "Preparing EBS Volume"
DATA_VOLUME_ID=/dev/$(lsblk -lnb | awk -v VOLUME_SIZE_BYTES="$DATA_VOLUME_SIZE" '{if ($4== VOLUME_SIZE_BYTES) {print $1}}')
sudo mkfs -t xfs $DATA_VOLUME_ID
sleep 10
DATA_VOLUME_UUID=$(lsblk -fn -o UUID  $DATA_VOLUME_ID)
DATA_VOLUME_FSTAB_CONF="UUID=$DATA_VOLUME_UUID /home/ubuntu/juno-source/juno-datadir xfs defaults 0 2"
echo "DATA_VOLUME_ID="$DATA_VOLUME_ID
echo "DATA_VOLUME_UUID="$DATA_VOLUME_UUID
echo "DATA_VOLUME_FSTAB_CONF="$DATA_VOLUME_FSTAB_CONF
echo $DATA_VOLUME_FSTAB_CONF | sudo tee -a /etc/fstab
sudo mkdir "juno-datadir"
sudo mount -a

echo "Install Go 1.22 Version"
sudo snap info go
sudo snap install go --channel=1.22/stable --classic
whereis go
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

echo "Starting starknet as a service"
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

sudo systemctl daemon-reload
sudo systemctl enable --now starknet

echo "Configuring syncchecker script"
cd /opt
sudo mv /opt/sync-checker/syncchecker-starknet.sh /opt/syncchecker.sh
sudo chmod +x /opt/syncchecker.sh

(crontab -l; echo "*/1 * * * * /opt/syncchecker.sh >/tmp/syncchecker.log 2>&1") | crontab -
crontab -l
