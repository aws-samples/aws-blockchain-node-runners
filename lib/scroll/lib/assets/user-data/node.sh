#!/bin/bash
set +e

echo "AWS_REGION=${_AWS_REGION_}" >> /etc/environment
echo "ASSETS_S3_PATH=${_ASSETS_S3_PATH_}" >> /etc/environment
echo "STACK_NAME=${_STACK_NAME_}" >> /etc/environment
echo "STACK_ID=${_STACK_ID_}" >> /etc/environment
echo "RESOURCE_ID=${_NODE_CF_LOGICAL_ID_}" >> /etc/environment
echo "DATA_VOLUME_TYPE=${_DATA_VOLUME_TYPE_}" >> /etc/environment
echo "DATA_VOLUME_SIZE=${_DATA_VOLUME_SIZE_}" >> /etc/environment
echo "SCROLL_VERSION=${_SCROLL_VERSION_}" >> /etc/environment
echo "SCROLL_NODE_TYPE=${_SCROLL_NODE_TYPE_}" >> /etc/environment
echo "NODE_IDENTITY_SECRET_ARN=${_NODE_IDENTITY_SECRET_ARN_}" >> /etc/environment
echo "VOTE_ACCOUNT_SECRET_ARN=${_VOTE_ACCOUNT_SECRET_ARN_}" >> /etc/environment
echo "AUTHORIZED_WITHDRAWER_ACCOUNT_SECRET_ARN=${_AUTHORIZED_WITHDRAWER_ACCOUNT_SECRET_ARN_}" >> /etc/environment
echo "REGISTRATION_TRANSACTION_FUNDING_ACCOUNT_SECRET_ARN=${_REGISTRATION_TRANSACTION_FUNDING_ACCOUNT_SECRET_ARN_}" >> /etc/environment
echo "SCROLL_CLUSTER=${_SCROLL_CLUSTER_}" >> /etc/environment
echo "LIFECYCLE_HOOK_NAME=${_LIFECYCLE_HOOK_NAME_}" >> /etc/environment
echo "ASG_NAME=${_ASG_NAME_}" >> /etc/environment
echo "L2GETH_L1_ENDPOINT=${_L2GETH_L1_ENDPOINT_}" >> /etc/environment
source /etc/environment

sudo apt-get -yqq update
sudo apt-get -yqq install awscli jq unzip python3-pip

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
sudo mount -a

echo "Install Scroll L2Geth agent"
pwd
whoami
cd /home/ubuntu
pwd
git clone https://github.com/scroll-tech/go-ethereum l2geth-source
cd /home/ubuntu/l2geth-source
git checkout scroll-v5.0.0

echo "Install Go 1.18 Version"
sudo snap info go
sudo snap install go --channel=1.18/stable --classic

echo "Install Build Tools"
sudo apt install build-essential
cd /home/ubuntu/l2geth-source
echo "Build now"
make nccc_geth
alias l2geth=./build/bin/geth
sudo chown ubuntu:ubuntu -R ../l2geth-source

# Copy startup script to correct location
if [[ "$SCROLL_NODE_TYPE" == "baserpc" ]]; then
  mkdir "/home/ubuntu/bin/"
  mv /opt/scroll/rpc-template.sh /home/ubuntu/bin/validator.sh
fi

sudo sed -i "s#__L2GETH_L1_ENDPOINT__#$L2GETH_L1_ENDPOINT#g" /home/ubuntu/bin/validator.sh
sudo chmod +x /home/ubuntu/bin/validator.sh

sudo mkdir /var/log/scroll
sudo chown ubuntu:ubuntu /var/log/scroll


echo "Starting scroll as a service"
sudo bash -c 'cat > /etc/systemd/system/scroll.service <<EOF
[Unit]
Description=Scroll Validator
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
ExecStart=/home/ubuntu/bin/validator.sh
StandardOutput=file:/var/log/scroll/std.log
StandardError=file:/var/log/scroll/error.log
[Install]
WantedBy=multi-user.target
EOF'

sudo systemctl daemon-reload
sudo systemctl enable --now scroll

echo "Configuring syncchecker script"
cd /opt
sudo mv /opt/sync-checker/syncchecker-scroll.sh /opt/syncchecker.sh
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
