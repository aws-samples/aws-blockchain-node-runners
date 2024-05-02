#!/bin/bash
set +e

echo "AWS_REGION=${_AWS_REGION_}" >> /etc/environment
echo "ASSETS_S3_PATH=${_ASSETS_S3_PATH_}" >> /etc/environment
echo "STACK_NAME=${_STACK_NAME_}" >> /etc/environment
echo "STACK_ID=${_STACK_ID_}" >> /etc/environment
echo "RESOURCE_ID=${_NODE_CF_LOGICAL_ID_}" >> /etc/environment
echo "DATA_VOLUME_TYPE=${_DATA_VOLUME_TYPE_}" >> /etc/environment
echo "DATA_VOLUME_SIZE=${_DATA_VOLUME_SIZE_}" >> /etc/environment
echo "HUBBLE_NODE_TYPE=${_HUBBLE_NODE_TYPE_}" >> /etc/environment
echo "LIFECYCLE_HOOK_NAME=${_LIFECYCLE_HOOK_NAME_}" >> /etc/environment
echo "ASG_NAME=${_ASG_NAME_}" >> /etc/environment
echo "ETH_MAINNET_RPC_URL=${_ETH_MAINNET_RPC_URL_}" >> /etc/environment
echo "OPTIMISM_L2_RPC_URL=${_OPTIMISM_L2_RPC_URL_}" >> /etc/environment
echo "HUB_OPERATOR_FID=${_HUB_OPERATOR_FID_}" >> /etc/environment
echo "FC_NETWORK_ID=${_FC_NETWORK_ID_}" >> /etc/environment
echo "BOOTSTRAP_NODE=${_BOOTSTRAP_NODE_}" >> /etc/environment
source /etc/environment

sudo apt-get -yqq update
sudo apt-get -yqq install awscli jq unzip python3-pip curl git docker.io

echo "install docker-compose"
sudo systemctl start docker
sudo apt-get -y update
curl -L https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m) -o /usr/local/bin/docker-compose
sudo chmod +x /usr/local/bin/docker-compose
sudo usermod -a -G docker ubuntu

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

echo "Preparing EBS Volume"
DATA_VOLUME_ID=/dev/$(lsblk -lnb | awk -v VOLUME_SIZE_BYTES="$DATA_VOLUME_SIZE" '{if ($4== VOLUME_SIZE_BYTES) {print $1}}')
sudo mkfs -t xfs $DATA_VOLUME_ID
sleep 10
DATA_VOLUME_UUID=$(lsblk -fn -o UUID  $DATA_VOLUME_ID)
DATA_VOLUME_FSTAB_CONF="UUID=$DATA_VOLUME_UUID /home/ubuntu/l2geth-source/l2geth-datadir xfs defaults 0 2"
echo "DATA_VOLUME_ID="$DATA_VOLUME_ID
echo "DATA_VOLUME_UUID="$DATA_VOLUME_UUID
echo "DATA_VOLUME_FSTAB_CONF="$DATA_VOLUME_FSTAB_CONF
echo $DATA_VOLUME_FSTAB_CONF | sudo tee -a /etc/fstab
sudo mkdir "l2geth-datadir"
sudo mount -a

echo "Install Go 1.18 Version"
sudo snap info go
sudo snap install go --channel=1.18/stable --classic
whereis go
export GOPATH=/snap/bin/go
go env|grep CACHE
sudo su - ubuntu

echo "Install Yarn"
curl -sS https://dl.yarnpkg.com/debian/pubkey.gpg | sudo apt-key add -
echo "deb https://dl.yarnpkg.com/debian/ stable main" | sudo tee /etc/apt/sources.list.d/yarn.list
sudo apt -yqq update
sudo apt install -yqq yarn

echo "Build Hubble"
cd /home/
git clone https://github.com/farcasterxyz/hub-monorepo.git

echo "Run Hubble"
sudo chown -R 1000:1000 /home/hub-monorepo/apps/hubble/
cd /home/hub-monorepo/apps/hubble/
touch .env
sudo chown ubuntu:ubuntu .env .hub/ .rocks/
docker-compose run hubble yarn identity create
echo FC_NETWORK_ID=1 >> .env
echo BOOTSTRAP_NODE=/dns/nemes.farcaster.xyz/tcp/2282 >> .env
echo ETH_MAINNET_RPC_URL=$ETH_MAINNET_RPC_URL >> .env
echo OPTIMISM_L2_RPC_URL=$OPTIMISM_L2_RPC_URL >> .env
echo HUB_OPERATOR_FID=$HUB_OPERATOR_FID >> .env

sudo mkdir /var/log/hubble
sudo chown ubuntu:ubuntu /var/log/hubble


echo "Starting hubble as a service"
sudo bash -c 'cat > /etc/systemd/system/hubble.service <<EOF
[Unit]
Description=Hubble Node
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
ExecStart=docker-compose up hubble -d
WorkingDirectory=/home/hub-monorepo/apps/hubble/
StandardOutput=file:/var/log/hubble/std.log
StandardError=file:/var/log/hubble/error.log
[Install]
WantedBy=multi-user.target
EOF'

sudo systemctl daemon-reload
sudo systemctl enable --now hubble

echo "Configuring syncchecker script"
cd /opt
sudo mv /opt/sync-checker/syncchecker-hubble.sh /opt/syncchecker.sh
sudo chmod +x /opt/syncchecker.sh

(crontab -l; echo "*/1 * * * * /opt/syncchecker.sh >/tmp/syncchecker.log 2>&1") | crontab -
crontab -l

if [[ "$LIFECYCLE_HOOK_NAME" != "none" ]]; then
  echo "Signaling ASG lifecycle hook to complete"
  TOKEN=$(curl -s -X PUT "http://169.254.169.254/latest/api/token" -H "X-aws-ec2-metadata-token-ttl-seconds: 21600")
  INSTANCE_ID=$(curl -H "X-aws-ec2-metadata-token: $TOKEN" -s http://169.254.169.254/latest/meta-data/instance-id)
  aws autoscaling complete-lifecycle-action --lifecycle-action-result CONTINUE --instance-id $INSTANCE_ID --lifecycle-hook-name "$LIFECYCLE_HOOK_NAME" --auto-scaling-group-name "$ASG_NAME"  --region $AWS_REGION
fi

echo "All Done!!"
