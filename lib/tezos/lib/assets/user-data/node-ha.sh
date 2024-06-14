#!/bin/bash
set +e

echo "AWS_REGION=${_AWS_REGION_}" >> /etc/environment
echo "ASSETS_S3_PATH=${_ASSETS_S3_PATH_}" >> /etc/environment
echo "TZ_SNAPSHOTS_URI=${_TZ_SNAPSHOTS_URI_}" >> /etc/environment
echo "STACK_NAME=${_STACK_NAME_}" >> /etc/environment
echo "STACK_ID=${_STACK_ID_}" >> /etc/environment
echo "RESOURCE_ID=${_NODE_CF_LOGICAL_ID_}" >> /etc/environment
echo "TZ_HISTORY_MODE=${_TZ_HISTORY_MODE_}" >> /etc/environment
echo "TZ_NETWORK=${_TZ_NETWORK_}" >> /etc/environment
echo "TZ_DOWNLOAD_SNAPSHOT=${_TZ_DOWNLOAD_SNAPSHOT_}" >> /etc/environment
echo "LIFECYCLE_HOOK_NAME=${_LIFECYCLE_HOOK_NAME_}" >> /etc/environment
echo "AUTOSCALING_GROUP_NAME=${_AUTOSCALING_GROUP_NAME_}" >> /etc/environment
echo "NODE_ROLE=${_NODE_ROLE_}" >> /etc/environment
echo "S3_SYNC_BUCKET=${_S3_SYNC_BUCKET_}" >> /etc/environment
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

if [[ "$STACK_ID" != "none" ]]; then
  echo "Install CloudFormation helper scripts"
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


echo "Install Octez-node and its dependencies"

if [ "$arch" == "x86_64" ]; then
    curl -o /usr/local/bin/octez-node https://gitlab.com/tezos/tezos/-/package_files/130339583/download
    curl -o /usr/local/bin/octez-client https://gitlab.com/tezos/tezos/-/package_files/130339263/download
else
    curl -o /usr/local/bin/octez-node https://gitlab.com/tezos/tezos/-/package_files/130342826/download
    curl -o /usr/local/bin/octez-client https://gitlab.com/tezos/tezos/-/package_files/130342347/download
fi


chmod +x /usr/local/bin/octez-node
chmod +x /usr/local/bin/octez-client
groupadd tezos
adduser -g tezos tezos
#mkdir -p /var/tezos/node
#chown -R tezos:tezos /var/tezos

echo "Changing user to tezos"


echo "Installing zcash dependency"
curl -o  /tmp/fetch-params.sh https://raw.githubusercontent.com/zcash/zcash/713fc761dd9cf4c9087c37b078bdeab98697bad2/zcutil/fetch-params.sh
chmod +x /tmp/fetch-params.sh
su tezos -c "/tmp/fetch-params.sh"

echo "Configuring node"
su tezos -c "octez-node config init --data-dir ~/.tezos-node/node --network=$TZ_NETWORK  --history-mode=$TZ_HISTORY_MODE  --net-addr='[::]:9732' --rpc-addr='[::]:8732'"
su tezos -c "octez-node identity generate"

su tezos -c "aws s3 sync s3://$S3_SYNC_BUCKET/node ~/.tezos-node/node"

echo "Setting up node as service"
cat >/etc/systemd/system/node.service <<EOL
[Unit]
Description="Run the octez-node"

[Service]
User=tezos
Group=tezos
ExecStart=octez-node run --data-dir /home/tezos/.tezos-node/node --rpc-addr 127.0.0.1

[Install]
WantedBy=multi-user.target
EOL

systemctl enable node.service

echo "Running node"
systemctl start node.service

echo "Configuring syncchecker script"
cd /opt
sudo mv /opt/sync-checker/syncchecker-tezos.sh /opt/syncchecker.sh
sudo chmod +x /opt/syncchecker.sh

# TODO // fix
(crontab -l; echo "*/1 * * * * /opt/syncchecker.sh >/tmp/syncchecker.log 2>&1") | crontab -
crontab -l

if [[ "$LIFECYCLE_HOOK_NAME" != "none" ]]; then
  echo "Signaling ASG lifecycle hook to complete"
  TOKEN=$(curl -s -X PUT "http://169.254.169.254/latest/api/token" -H "X-aws-ec2-metadata-token-ttl-seconds: 21600")
  INSTANCE_ID=$(curl -H "X-aws-ec2-metadata-token: $TOKEN" -s http://169.254.169.254/latest/meta-data/instance-id)
  aws autoscaling complete-lifecycle-action --lifecycle-action-result CONTINUE --instance-id $INSTANCE_ID --lifecycle-hook-name "$LIFECYCLE_HOOK_NAME" --auto-scaling-group-name "$AUTOSCALING_GROUP_NAME"  --region $AWS_REGION
fi

echo "All Done!!"
set -e
