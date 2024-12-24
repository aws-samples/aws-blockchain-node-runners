#!/bin/bash
set +e

# General system environment variables
DATA_VOLUME_PATH=/var/lib/stacks
CLOUD_ASSETS_DOWNLOAD_PATH=/tmp/assets.zip
CLOUD_ASSETS_PATH=/var/tmp/assets

{
  # Setup environment variables provided by from CDK template on local machine.
  echo "AWS_REGION=${_AWS_REGION_}"
  echo "CLOUD_ASSETS_S3_PATH=${_ASSETS_S3_PATH_}"
  echo "STACK_NAME=${_STACK_NAME_}"
  echo "STACK_ID=${_STACK_ID_}"
  echo "RESOURCE_ID=${_NODE_CF_LOGICAL_ID_}"
  echo "STACKS_VERSION=${_STACKS_VERSION_}"
  echo "STACKS_NODE_CONFIGURATION=${_STACKS_NODE_CONFIGURATION_}"
  # Stacks network config
  echo "STACKS_NETWORK=${_STACKS_NETWORK_}"
  echo "STACKS_BOOTSTRAP_NODE=${_STACKS_BOOTSTRAP_NODE_}"
  echo "STACKS_CHAINSTATE_ARCHIVE=${_STACKS_CHAINSTATE_ARCHIVE_}"
  echo "STACKS_P2P_PORT=${_STACKS_P2P_PORT_}"
  echo "STACKS_RPC_PORT=${_STACKS_RPC_PORT_}"
  # Bitcoin network config
  echo "BITCOIN_PEER_HOST=${_BITCOIN_PEER_HOST_}"
  echo "BITCOIN_RPC_USERNAME=${_BITCOIN_RPC_USERNAME_}"
  echo "BITCOIN_RPC_PASSWORD=${_BITCOIN_RPC_PASSWORD_}"
  echo "BITCOIN_P2P_PORT=${_BITCOIN_P2P_PORT_}"
  echo "BITCOIN_RPC_PORT=${_BITCOIN_RPC_PORT_}"
  # Cloud resource config
  echo "STACKS_MINER_SECRET_ARN=${_STACKS_MINER_SECRET_ARN_}"
  echo "STACKS_SIGNER_SECRET_ARN=${_STACKS_SIGNER_SECRET_ARN_}"
  echo "DATA_VOLUME_TYPE=${_DATA_VOLUME_TYPE_}"
  echo "DATA_VOLUME_SIZE=${_DATA_VOLUME_SIZE_}"
  echo "ASG_NAME=${_ASG_NAME_}"
  echo "LIFECYCLE_HOOK_NAME=${_LIFECYCLE_HOOK_NAME_}"
  echo "BUILD_FROM_SOURCE=${_BUILD_FROM_SOURCE_}"
  echo "DOWNLOAD_CHAINSTATE=${_DOWNLOAD_CHAINSTATE_}"
  # Place shared environment variables here.
  echo "DATA_VOLUME_PATH=$DATA_VOLUME_PATH"
  echo "CLOUD_ASSETS_PATH=$CLOUD_ASSETS_PATH"
} >> /etc/environment

# shellcheck source=/dev/null
source /etc/environment

# Show environment file in the logs.
cat /etc/environment

# Export environment variables so calls to `envsubst` inherit the evironment variables.
while read -r line; do export "$line"; done < /etc/environment

# Update packages.
sudo yum -y update
sudo yum -y install time

# Download cloud assets.
echo "Downloading assets zip file"
aws s3 cp "$CLOUD_ASSETS_S3_PATH" "$CLOUD_ASSETS_DOWNLOAD_PATH" --region "$AWS_REGION"
unzip -qo "$CLOUD_ASSETS_DOWNLOAD_PATH" -d "$CLOUD_ASSETS_PATH"

# TODO:
# The "signer" and "miner" configurations will both need access to secret keys that should either be
# produced on startup or retrieved from an existing secret and supplied to the host via an ARN. That
# functionality should be included here.
#
# ```bash
# sudo yum -y install npm
# npm install @stacks/cli
# sudo mkdir -p /etc/stacks
# npx @stacks/cli make_keychain 2>/dev/null | jq > /etc/stacks/$STACKS_NODE_CONFIGURATION-keychain.json
# ```

sudo mkdir -p /etc/stacks/
CONFIG_DIR=$CLOUD_ASSETS_PATH/stacks/config/$STACKS_NODE_CONFIGURATION
envsubst < "$CONFIG_DIR"/stacks.toml > /etc/stacks/stacks.toml

echo "Install CloudWatch Agent"
sudo yum -y install amazon-cloudwatch-agent

echo "Configure Cloudwatch Agent"
sudo mkdir -p /opt/aws/amazon-cloudwatch-agent/etc/
cp "$CONFIG_DIR"/cw-agent.json /opt/aws/amazon-cloudwatch-agent/etc/custom-amazon-cloudwatch-agent.json
# TODO: Publish prometheus metrics as well. We should update the dashboard template in tandem.

echo "Starting CloudWatch Agent"
amazon-cloudwatch-agent-ctl -a fetch-config -c file:/opt/aws/amazon-cloudwatch-agent/etc/custom-amazon-cloudwatch-agent.json -m ec2 -s
systemctl status amazon-cloudwatch-agent

# Set up stacks user.
echo "Adding stacks user and group"
sudo groupadd -g 1002 stacks
sudo useradd -u 1002 -g 1002 -s /bin/bash stacks
sudo usermod -aG wheel stacks
sudo passwd -d stacks # No password.

# Configure CloudFormation helper scripts. -------------------------------------
# Note: This needs to be set up before the volumes will be picked up.
sudo mkdir -p /etc/cfn/hooks.d/
if [[ "$STACK_ID" != "none" ]]; then
  echo "Configuring CloudFormation helper scripts"
  envsubst < $CLOUD_ASSETS_PATH/cfn-hup/cfn-hup.conf > /etc/cfn/cfn-hup.conf
  envsubst < $CLOUD_ASSETS_PATH/cfn-hup/cfn-auto-reloader.conf > /etc/cfn/hooks.d/cfn-auto-reloader.conf

  echo "Starting CloudFormation helper scripts as a service"
  cp $CLOUD_ASSETS_PATH/cfn-hup/cfn-hup.service  /etc/systemd/system/cfn-hup.service

  systemctl daemon-reload
  systemctl enable --now cfn-hup
  systemctl start cfn-hup.service

  cfn-signal --stack "$STACK_NAME" --resource "$RESOURCE_ID" --region "$AWS_REGION"
fi

# Set up volumes -----------------------------------------------------------------
echo "Waiting for volumes to be available"
sleep 60

sudo mkdir -p $DATA_VOLUME_PATH

if [[ "$DATA_VOLUME_TYPE" == "instance-store" ]]; then
  echo "Data volume type is instance store"

  sudo chmod +x $CLOUD_ASSETS_PATH/setup-instance-store-volumes.sh

  (crontab -l; echo "@reboot $CLOUD_ASSETS_PATH/setup-instance-store-volumes.sh > /tmp/setup-instance-store-volumes.log 2>&1") | crontab -
  crontab -l

  sudo $CLOUD_ASSETS_PATH/setup-instance-store-volumes.sh

else
  echo "Data volume type is EBS"

  DATA_VOLUME_ID=/dev/$(lsblk -lnb | awk -v VOLUME_SIZE_BYTES="$DATA_VOLUME_SIZE" '{if ($4== VOLUME_SIZE_BYTES) {print $1}}')
  sudo mkfs -t xfs "$DATA_VOLUME_ID"
  sleep 10
  DATA_VOLUME_UUID=$(lsblk -fn -o UUID  "$DATA_VOLUME_ID")
  DATA_VOLUME_FSTAB_CONF="UUID=$DATA_VOLUME_UUID $DATA_VOLUME_PATH xfs defaults 0 2"
  echo "DATA_VOLUME_ID=$DATA_VOLUME_ID"
  echo "DATA_VOLUME_UUID=$DATA_VOLUME_UUID"
  echo "DATA_VOLUME_FSTAB_CONF=$DATA_VOLUME_FSTAB_CONF"
  echo "$DATA_VOLUME_FSTAB_CONF" | sudo tee -a /etc/fstab
  sudo mount -a
fi

# Ensure proper ownership of the directories
sudo chown -R stacks:stacks $DATA_VOLUME_PATH

# Show the final state of the drives
lsblk

# Build Binaries & Download Chainstate -----------------------------------------

if [[ "$DOWNLOAD_CHAINSTATE" = "true" ]]; then
  (
    # Impropperly using the data volume path temporarily because it will have the
    # space required to store the compressed chainstate.
    sudo mkdir -p $DATA_VOLUME_PATH/tmp
    wget -q "$STACKS_CHAINSTATE_ARCHIVE" \
      -O "$DATA_VOLUME_PATH/tmp/chainstate.tar.gz"
    tar -vxf "$DATA_VOLUME_PATH/tmp/chainstate.tar.gz" \
      -C "$DATA_VOLUME_PATH"
    rm -rf "$DATA_VOLUME_PATH/tmp"
  ) &
fi

if [[ "$BUILD_FROM_SOURCE" = "true" ]]; then
  (
    # build-binaries.sh will ensure that the working directory the script is called from
    # has a ./src and a ./bin directory and will populate the ./src with the source code
    # and the ./bin with the compiled binaries.
    cd /usr/local || return
    "$CLOUD_ASSETS_PATH"/build-binaries.sh
  ) &
else
  cd /usr/local || return
  "$CLOUD_ASSETS_PATH"/download-binaries.sh
fi

wait # Wait for download or build or both to finish in background, if they were started

# No new directories are made at this point; ensure that the stacks
# user has all necessary permissions.
sudo mkdir -p /var/log/stacks/
sudo chown -R stacks:stacks /var/log/stacks/
sudo chown -R stacks:stacks /etc/stacks/
sudo chown -R stacks:stacks /var/lib/stacks/

# Setup stacks as a service.
echo "Seting up stacks as a service."
sudo cp $CLOUD_ASSETS_PATH/stacks.service /etc/systemd/system/stacks.service
sudo systemctl daemon-reload
sudo systemctl enable --now stacks

# Configure logrotate to rotate stacks logs.
echo 'Configuring logrotate to rotate Stacks logs.'
sudo cp $CLOUD_ASSETS_PATH/stacks.logrotate /etc/logrotate.d/stacks
sudo systemctl restart logrotate.service

# Configure syncchecker script.
echo "Configuring syncchecker script."
sudo cp $CLOUD_ASSETS_PATH/sync-checker/syncchecker-stacks.sh /usr/local/bin/syncchecker.sh
sudo chmod +x /usr/local/bin/syncchecker.sh

# Install cronie and set it to run the syncchecker every minute.
echo "Installing cronie and setting it to run the syncchecker every minute."
sudo yum -y install cronie
sudo systemctl enable crond
sudo systemctl start crond
(crontab -l; echo "*/1 * * * * /usr/local/bin/syncchecker.sh > /tmp/syncchecker.log 2>&1") | crontab -
crontab -l

if [[ "$LIFECYCLE_HOOK_NAME" != "none" ]]; then
  echo "Signaling ASG lifecycle hook to complete"
  TOKEN=$(curl -s -X PUT "http://169.254.169.254/latest/api/token" -H "X-aws-ec2-metadata-token-ttl-seconds: 21600")
  INSTANCE_ID=$(curl -H "X-aws-ec2-metadata-token: $TOKEN" -s http://169.254.169.254/latest/meta-data/instance-id)
  aws autoscaling complete-lifecycle-action --lifecycle-action-result CONTINUE --instance-id "$INSTANCE_ID" --lifecycle-hook-name "$LIFECYCLE_HOOK_NAME" --auto-scaling-group-name "$ASG_NAME" --region "$AWS_REGION"
fi

echo "All Done!!"
