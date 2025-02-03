#!/bin/bash
set +e

touch /etc/cdk_environment
chmod 600 /etc/cdk_environment

{
  echo "AWS_REGION=${_REGION_}"
  echo "ETH_SNAPSHOT_TYPE=${_ETH_SNAPSHOT_TYPE_}"
  echo "SNAPSHOT_S3_PATH=${_SNAPSHOT_S3_PATH_}"
  echo "ETH_CLIENT_COMBINATION=${_ETH_CLIENT_COMBINATION_}"
  echo "ETH_NETWORK=${_ETH_NETWORK_}"
  echo "ETH_CONSENSUS_CHECKPOINT_SYNC_URL=${_ETH_CONSENSUS_CHECKPOINT_SYNC_URL_}"
  echo "STACK_NAME=${_STACK_NAME_}"
  echo "AUTOSTART_CONTAINER=${_AUTOSTART_CONTAINER_}"
  echo "FORMAT_DISK=${_FORMAT_DISK_}"
  echo "DATA_VOLUME_TYPE=${_DATA_VOLUME_TYPE_}"
  echo "DATA_VOLUME_SIZE=${_DATA_VOLUME_SIZE_}"
  echo "NODE_ROLE=${_NODE_ROLE_}"
  echo "RESOURCE_ID=${_NODE_CF_LOGICAL_ID_}"
  echo "LIFECYCLE_HOOK_NAME=${_LIFECYCLE_HOOK_NAME_}"
  echo "AUTOSCALING_GROUP_NAME=${_AUTOSCALING_GROUP_NAME_}"
  echo "ASSETS_S3_PATH=${_ASSETS_S3_PATH_}"
} >> /etc/cdk_environment
source /etc/cdk_environment

# Export environment variables so calls to `envsubst` inherit the evironment variables.
while read -r line; do export "$line"; done < /etc/cdk_environment

arch=$(uname -m)

echo "Architecture detected: $arch"

if [ "$arch" == "x86_64" ]; then
  SSM_AGENT_BINARY_URI=https://s3.amazonaws.com/ec2-downloads-windows/SSMAgent/latest/linux_amd64/amazon-ssm-agent.rpm
  S5CMD_URI=https://github.com/peak/s5cmd/releases/download/v2.1.0/s5cmd_2.1.0_Linux-64bit.tar.gz
else
  SSM_AGENT_BINARY_URI=https://s3.amazonaws.com/ec2-downloads-windows/SSMAgent/latest/linux_arm64/amazon-ssm-agent.rpm
  S5CMD_URI=https://github.com/peak/s5cmd/releases/download/v2.1.0/s5cmd_2.1.0_Linux-arm64.tar.gz
fi

echo "Updating and installing required system packages"
dnf update -y
dnf -y install amazon-cloudwatch-agent collectd jq gcc ncurses-devel telnet aws-cfn-bootstrap cronie

sudo systemctl enable crond.service
sudo systemctl start crond.service

cd /opt

echo "Downloading assets zip file"
aws s3 cp $ASSETS_S3_PATH ./assets.zip
unzip -q assets.zip

aws configure set default.s3.max_concurrent_requests 50
aws configure set default.s3.multipart_chunksize 256MB

echo 'Upgrading SSM Agent'
yum install -y $SSM_AGENT_BINARY_URI

echo "Installing s5cmd"
cd /opt
wget -q $S5CMD_URI -O s5cmd.tar.gz
tar -xf s5cmd.tar.gz
chmod +x s5cmd
mv s5cmd /usr/bin
s5cmd version

# Ethereum specific setup starts here

echo "Ethereum Client combination: $ETH_CLIENT_COMBINATION"

# Can add more combination in the future
case $ETH_CLIENT_COMBINATION in
  "besu-teku")
    SYNC_CHECKER_FILE_NAME=syncchecker-besu-teku.sh
    DOCKER_COMPOSE_FILE_NAME=docker-compose-besu-teku.yml
    ;;
  "geth-lighthouse")
    SYNC_CHECKER_FILE_NAME=syncchecker-geth-lighthouse.sh
    DOCKER_COMPOSE_FILE_NAME=docker-compose-geth-lighthouse.yml
    ;;
  "erigon-lighthouse")
    SYNC_CHECKER_FILE_NAME=syncchecker-erigon-lighthouse.sh
    DOCKER_COMPOSE_FILE_NAME=docker-compose-erigon-lighthouse.yml
    ;;
  "erigon-prysm")
    SYNC_CHECKER_FILE_NAME=syncchecker-erigon-prysm.sh
    DOCKER_COMPOSE_FILE_NAME=docker-compose-erigon-prysm.yml
    ;;
  "nethermind-teku")
    SYNC_CHECKER_FILE_NAME=syncchecker-nethermind-teku.sh
    DOCKER_COMPOSE_FILE_NAME=docker-compose-nethermind-teku.yml
    ;;
  "reth-lighthouse")
    SYNC_CHECKER_FILE_NAME=syncchecker-reth-lighthouse.sh
    DOCKER_COMPOSE_FILE_NAME=docker-compose-reth-lighthouse.yml
    ;;
  *)
    echo "Combination is not valid."
    exit 1
    ;;
esac

echo "Installing Docker"
dnf remove -y docker docker-client docker-client-latest docker-common docker-latest docker-latest-logrotate docker-logrotate docker-engine
dnf -y install dnf-plugins-core
dnf config-manager --add-repo https://download.docker.com/linux/centos/docker-ce.repo
sed -i 's/$releasever/9/g' /etc/yum.repos.d/docker-ce.repo
dnf -y install docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
systemctl enable --now docker

echo 'Preparing secrets'
mkdir -p /secrets
openssl rand -hex 32 | tr -d "\n" | sudo tee /secrets/jwtsecret

echo "Creating run user and making sure it has all necessary permissions"
groupadd -g 1002 bcuser
useradd -u 1002 -g 1002 -m -s /bin/bash bcuser
usermod -a -G docker bcuser
usermod -a -G docker ec2-user
chown -R bcuser:bcuser /secrets
chmod -R 755 /home/bcuser
chmod -R 755 /secrets

echo "Starting docker"
service docker start
systemctl enable docker

echo "Copying docker-compose file"
cp ./node/$DOCKER_COMPOSE_FILE_NAME /home/bcuser/docker-compose.yml

sed -i 's/__ETH_NETWORK__/'"$ETH_NETWORK"'/g' /home/bcuser/docker-compose.yml
sed -i 's,__ETH_CONSENSUS_CHECKPOINT_SYNC_URL__,'"$ETH_CONSENSUS_CHECKPOINT_SYNC_URL"',g' /home/bcuser/docker-compose.yml
chown -R bcuser:bcuser /home/bcuser/docker-compose.yml

echo "Configuring and starting sync-checker"
/opt/sync-checker/setup.sh "/opt/sync-checker/$SYNC_CHECKER_FILE_NAME"

# If in Single Node stack (have Stack ID), configuring ClodFormation helpers to signal the completion of deployment"
if [[ "$STACK_ID" != "none" ]]; then
  #If cfn-signal is not available, install it
  if ! command -v cfn-signal &> /dev/null
  then
    echo "cfn-signal could not be found, installing"
    /opt/instance/cfn-hup/setup.sh "$STACK_NAME" "$AWS_REGION"
  else
    echo "cfn-signal is available, skipping installation"
  fi
  cfn-signal --stack "$STACK_NAME" --resource "$RESOURCE_ID" --region "$AWS_REGION"
fi

echo "Preparing data volume"

mkdir -p /data

if [[ "$DATA_VOLUME_TYPE" == "instance-store" ]]; then
  echo "Data volume type is instance store"

  (crontab -l; echo "@reboot /opt/instance/storage/setup.sh /data ext4 > /tmp/setup-store-volume-data.log 2>&1") | crontab -
  crontab -l

  /opt/instance/storage/setup.sh /data ext4
else
  echo "Data volume type is EBS"
  echo "Waiting for EBS volume to become available"
  sleep 60
  /opt/instance/storage/setup.sh /data ext4
fi

lsblk -d

mkdir -p /data/execution
mkdir -p /data/consensus
mkdir -p /data/execution/data
mkdir -p /data/execution/others
mkdir -p /data/consensus/data

chown -R bcuser:bcuser /data
chmod -R 755 /data

echo 'Configuring CloudWatch Agent'
cp /opt/cw-agent.json /opt/aws/amazon-cloudwatch-agent/etc/custom-amazon-cloudwatch-agent.json

echo "Starting CloudWatch Agent"
/opt/aws/amazon-cloudwatch-agent/bin/amazon-cloudwatch-agent-ctl \
-a fetch-config -c file:/opt/aws/amazon-cloudwatch-agent/etc/custom-amazon-cloudwatch-agent.json -m ec2 -s
systemctl restart amazon-cloudwatch-agent

if [ "$NODE_ROLE" == "sync-node" ] || [ "$NODE_ROLE" == "single-node"  ]; then
  if [ "$AUTOSTART_CONTAINER" == "false" ]; then
    echo "Single node. Autostart disabled. Start docker-compose manually!"
  else
    if [ "$ETH_SNAPSHOT_TYPE" == "none" ]; then
      echo "Snapshot is not provided. Autostart enabled. Starting docker compose"
      docker compose -f /home/bcuser/docker-compose.yml up -d
    fi
  fi
fi

if [ "$NODE_ROLE" == "sync-node" ]; then
  echo "Sync node. Configuring snapshotting script."
  chmod 766 /opt/instance/storage/copy-data-to-s3.sh
fi

if [ "$NODE_ROLE" == "rpc-node" ] || [ "$NODE_ROLE" == "single-node"  ]; then
  if [ "$ETH_SNAPSHOT_TYPE" == "s3" ]; then
    echo "RPC node. Snapshot on S3. Starting copy data script"
    chmod 766 /opt/instance/storage/copy-data-from-s3.sh
    echo "/opt/instance/storage/copy-data-from-s3.sh" | at now +3 minutes
  fi
fi

echo "All Done!!"
