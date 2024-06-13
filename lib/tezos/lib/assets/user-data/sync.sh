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
echo "S3_SYNC_BUCKET=${_S3_SYNC_BUCKET_}" >> /etc/environment
echo "LIFECYCLE_HOOK_NAME=${_LIFECYCLE_HOOK_NAME_}" >> /etc/environment
echo "AUTOSCALING_GROUP_NAME=${_AUTOSCALING_GROUP_NAME_}" >> /etc/environment
echo "NODE_CF_LOGICAL_ID=${_NODE_CF_LOGICAL_ID_}" >> /etc/environment
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

aws configure set default.s3.max_concurrent_requests 50
aws configure set default.s3.multipart_chunksize 256MB


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


# download snapshot if network is mainnet
if [ "$TZ_NETWORK" == "mainnet"  ] && [ "$TZ_DOWNLOAD_SNAPSHOT" == "true" ]; then
  echo "Downloading Tezos snapshot and importing"
  chmod +x /opt/download-snapshot.sh
  su tezos -c "/opt/download-snapshot.sh"
fi


su tezos -c "aws s3 sync ~/.tezos-node/ s3://$S3_SYNC_BUCKET/"
echo "Synced node to S3"


cfn-signal --stack $STACK_NAME --resource $RESOURCE_ID --region $AWS_REGION

echo "All Done!!"