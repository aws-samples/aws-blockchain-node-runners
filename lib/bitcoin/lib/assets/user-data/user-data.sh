#!/bin/bash
set +e

touch /etc/cdk_environment
chmod 600 /etc/cdk_environment
{
  echo "AWS_REGION=${_AWS_REGION_}"
  echo "ASSETS_S3_PATH=${_ASSETS_S3_PATH_}"
  echo "STACK_NAME=${_STACK_NAME_}"
  echo "STACK_ID=${_STACK_ID_}"
  echo "RESOURCE_ID=${_NODE_CF_LOGICAL_ID_}"
  echo "DATA_VOLUME_TYPE=${_DATA_VOLUME_TYPE_}"
  echo "DATA_VOLUME_SIZE=${_DATA_VOLUME_SIZE_}"
  echo "BITCOIN_NETWORK=${_BITCOIN_NETWORK_}"
  echo "BITCOIN_VERSION=${_BITCOIN_VERSION_}"
  echo "BITCOIN_TXINDEX=${_BITCOIN_TXINDEX_}"
  echo "BITCOIN_SERVER=${_BITCOIN_SERVER_}"
  echo "BITCOIN_LISTEN=${_BITCOIN_LISTEN_}"
  echo "BITCOIN_DBCACHE=${_BITCOIN_DBCACHE_}"
  echo "BITCOIN_MAXCONNECTIONS=${_BITCOIN_MAXCONNECTIONS_}"
  echo "BITCOIN_RPCALLOWIP=${_BITCOIN_RPCALLOWIP_}"
  echo "BITCOIN_RPCAUTH=${_BITCOIN_RPCAUTH_}"
  echo "BITCOIN_PRUNE=${_BITCOIN_PRUNE_}"
  echo "BITCOIN_MAXMEMPOOL=${_BITCOIN_MAXMEMPOOL_}"
  echo "BITCOIN_MEMPOOLEXPIRY=${_BITCOIN_MEMPOOLEXPIRY_}"
  echo "BITCOIN_MAXORPHANTX=${_BITCOIN_MAXORPHANTX_}"
  echo "BITCOIN_BLOCKSONLY=${_BITCOIN_BLOCKSONLY_}"
  echo "BITCOIN_ASSUMEVALID=${_BITCOIN_ASSUMEVALID_}"
  echo "BITCOIN_ZMQPUBRAWBLOCK=${_BITCOIN_ZMQPUBRAWBLOCK_}"
  echo "BITCOIN_ZMQPUBRAWTX=${_BITCOIN_ZMQPUBRAWTX_}"
  echo "BITCOIN_ZMQPUBHASHBLOCK=${_BITCOIN_ZMQPUBHASHBLOCK_}"
  echo "BITCOIN_ZMQPUBHASHTX=${_BITCOIN_ZMQPUBHASHTX_}"
  echo "RESTORE_FROM_SNAPSHOT=${_RESTORE_FROM_SNAPSHOT_}"
  echo "SNAPSHOT_URL=${_SNAPSHOT_URL_}"
  echo "LIFECYCLE_HOOK_NAME=${_LIFECYCLE_HOOK_NAME_}"
  echo "ASG_NAME=${_ASG_NAME_}"
} >> /etc/cdk_environment
source /etc/cdk_environment

TOKEN=$(curl -s -X PUT "http://169.254.169.254/latest/api/token" -H "X-aws-ec2-metadata-token-ttl-seconds: 21600")
INSTANCE_ID=$(curl -H "X-aws-ec2-metadata-token: $TOKEN" -s http://169.254.169.254/latest/meta-data/instance-id)

echo "Installing dependencies"
dnf update -y
dnf -y install jq unzip python3-pip chrony cronie aws-cfn-bootstrap amazon-ssm-agent

# Ensure SSM Agent is running (restart after delay to allow instance profile propagation)
systemctl enable amazon-ssm-agent
systemctl restart amazon-ssm-agent

ARCH=$(uname -m)

if [ "$ARCH" == "x86_64" ]; then
  CW_AGENT_BINARY_URI=https://s3.amazonaws.com/amazoncloudwatch-agent/amazon_linux/amd64/latest/amazon-cloudwatch-agent.rpm
  BITCOIN_ARCH="x86_64-linux-gnu"
else
  CW_AGENT_BINARY_URI=https://s3.amazonaws.com/amazoncloudwatch-agent/amazon_linux/arm64/latest/amazon-cloudwatch-agent.rpm
  BITCOIN_ARCH="aarch64-linux-gnu"
fi

cd /opt || exit 1

echo "Installing AWS CLI"
curl "https://awscli.amazonaws.com/awscli-exe-linux-$ARCH.zip" -o "awscliv2.zip"
unzip -q awscliv2.zip
./aws/install
rm -rf aws awscliv2.zip

echo "Downloading assets zip file"
aws s3 cp $ASSETS_S3_PATH ./assets.zip --region $AWS_REGION
unzip -q assets.zip

# Make scripts executable
chmod +x /opt/instance/setup-volume.sh
chmod +x /opt/sync-checker/setup.sh

echo "Creating bitcoin user and group"
groupadd -g 1002 bitcoin
useradd -u 1002 -g 1002 -m -s /bin/bash -d /home/bitcoin bitcoin

echo "Preparing data directory"
mkdir -p /data
chown bitcoin:bitcoin /data

echo "Downloading and installing Bitcoin Core $BITCOIN_VERSION"
cd /tmp
BITCOIN_TARBALL="bitcoin-$BITCOIN_VERSION-$BITCOIN_ARCH.tar.gz"
wget -q "https://bitcoincore.org/bin/bitcoin-core-$BITCOIN_VERSION/$BITCOIN_TARBALL"
wget -q "https://bitcoincore.org/bin/bitcoin-core-$BITCOIN_VERSION/SHA256SUMS"
wget -q "https://bitcoincore.org/bin/bitcoin-core-$BITCOIN_VERSION/SHA256SUMS.asc"

# Verify checksum
grep "$BITCOIN_TARBALL" SHA256SUMS | sha256sum -c -

tar -xzf "$BITCOIN_TARBALL"
install -m 0755 -o root -g root -t /usr/local/bin bitcoin-$BITCOIN_VERSION/bin/*
rm -rf bitcoin-$BITCOIN_VERSION "$BITCOIN_TARBALL" SHA256SUMS SHA256SUMS.asc

echo "Creating Bitcoin configuration"
mkdir -p /home/bitcoin/.bitcoin
chown bitcoin:bitcoin /home/bitcoin/.bitcoin
chmod 700 /home/bitcoin/.bitcoin

# Generate bitcoin.conf
cat > /home/bitcoin/.bitcoin/bitcoin.conf << 'BITCOINCONF'
# Network
BITCOINCONF

if [ "$BITCOIN_NETWORK" == "testnet" ]; then
  echo "testnet=1" >> /home/bitcoin/.bitcoin/bitcoin.conf
elif [ "$BITCOIN_NETWORK" == "signet" ]; then
  echo "signet=1" >> /home/bitcoin/.bitcoin/bitcoin.conf
elif [ "$BITCOIN_NETWORK" == "regtest" ]; then
  echo "regtest=1" >> /home/bitcoin/.bitcoin/bitcoin.conf
fi

cat >> /home/bitcoin/.bitcoin/bitcoin.conf << BITCOINCONF

# Data directory
datadir=/data

# Server settings
server=$BITCOIN_SERVER
listen=$BITCOIN_LISTEN
daemon=0

# RPC settings
rpcbind=0.0.0.0
BITCOINCONF

if [ "$BITCOIN_RPCALLOWIP" != "none" ]; then
  echo "rpcallowip=$BITCOIN_RPCALLOWIP" >> /home/bitcoin/.bitcoin/bitcoin.conf
fi

if [ "$BITCOIN_RPCAUTH" != "none" ]; then
  echo "rpcauth=$BITCOIN_RPCAUTH" >> /home/bitcoin/.bitcoin/bitcoin.conf
fi

cat >> /home/bitcoin/.bitcoin/bitcoin.conf << BITCOINCONF

# Performance settings
dbcache=$BITCOIN_DBCACHE
maxconnections=$BITCOIN_MAXCONNECTIONS
maxmempool=$BITCOIN_MAXMEMPOOL
mempoolexpiry=$BITCOIN_MEMPOOLEXPIRY
maxorphantx=$BITCOIN_MAXORPHANTX
BITCOINCONF

if [ "$BITCOIN_TXINDEX" == "true" ]; then
  echo "txindex=1" >> /home/bitcoin/.bitcoin/bitcoin.conf
fi

if [ "$BITCOIN_PRUNE" -gt 0 ]; then
  echo "prune=$BITCOIN_PRUNE" >> /home/bitcoin/.bitcoin/bitcoin.conf
fi

if [ "$BITCOIN_BLOCKSONLY" == "true" ]; then
  echo "blocksonly=1" >> /home/bitcoin/.bitcoin/bitcoin.conf
fi

if [ "$BITCOIN_ASSUMEVALID" != "none" ]; then
  echo "assumevalid=$BITCOIN_ASSUMEVALID" >> /home/bitcoin/.bitcoin/bitcoin.conf
fi

# ZMQ settings
if [ "$BITCOIN_ZMQPUBRAWBLOCK" != "none" ]; then
  echo "zmqpubrawblock=$BITCOIN_ZMQPUBRAWBLOCK" >> /home/bitcoin/.bitcoin/bitcoin.conf
fi

if [ "$BITCOIN_ZMQPUBRAWTX" != "none" ]; then
  echo "zmqpubrawtx=$BITCOIN_ZMQPUBRAWTX" >> /home/bitcoin/.bitcoin/bitcoin.conf
fi

if [ "$BITCOIN_ZMQPUBHASHBLOCK" != "none" ]; then
  echo "zmqpubhashblock=$BITCOIN_ZMQPUBHASHBLOCK" >> /home/bitcoin/.bitcoin/bitcoin.conf
fi

if [ "$BITCOIN_ZMQPUBHASHTX" != "none" ]; then
  echo "zmqpubhashtx=$BITCOIN_ZMQPUBHASHTX" >> /home/bitcoin/.bitcoin/bitcoin.conf
fi

chown bitcoin:bitcoin /home/bitcoin/.bitcoin/bitcoin.conf
chmod 600 /home/bitcoin/.bitcoin/bitcoin.conf

echo "Creating systemd service"
cat > /etc/systemd/system/bitcoind.service << 'SYSTEMDSERVICE'
[Unit]
Description=Bitcoin Core Daemon
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=bitcoin
Group=bitcoin
ExecStart=/usr/local/bin/bitcoind -conf=/home/bitcoin/.bitcoin/bitcoin.conf
ExecStop=/usr/local/bin/bitcoin-cli stop
Restart=on-failure
RestartSec=30
TimeoutStartSec=infinity
TimeoutStopSec=600
LimitNOFILE=65536
LimitNPROC=65536

# Hardening
PrivateTmp=true
ProtectSystem=full
NoNewPrivileges=true
PrivateDevices=true

[Install]
WantedBy=multi-user.target
SYSTEMDSERVICE

# If in Single Node stack (have Stack ID), signal CloudFormation
if [[ "$STACK_ID" != "none" ]]; then
  echo "Signaling CloudFormation stack completion"
  aws cloudformation signal-resource --stack-name "$STACK_NAME" --logical-resource-id "$RESOURCE_ID" --unique-id "$INSTANCE_ID" --status SUCCESS --region "$AWS_REGION" || echo "WARNING: Failed to signal CloudFormation"
fi

echo "Waiting for volumes to be available"
sleep 60

echo "Setting up data volume"
/opt/instance/setup-volume.sh /data xfs "$DATA_VOLUME_SIZE"

chown -R bitcoin:bitcoin /data

echo "Installing CloudWatch Agent"
wget -q $CW_AGENT_BINARY_URI -O amazon-cloudwatch-agent.rpm
rpm -U ./amazon-cloudwatch-agent.rpm
rm -f amazon-cloudwatch-agent.rpm

mkdir -p /opt/aws/amazon-cloudwatch-agent/etc/
cp /opt/cw-agent.json /opt/aws/amazon-cloudwatch-agent/etc/custom-amazon-cloudwatch-agent.json

echo "Starting CloudWatch Agent"
/opt/aws/amazon-cloudwatch-agent/bin/amazon-cloudwatch-agent-ctl \
  -a fetch-config -c file:/opt/aws/amazon-cloudwatch-agent/etc/custom-amazon-cloudwatch-agent.json -m ec2 -s
systemctl restart amazon-cloudwatch-agent

systemctl daemon-reload

if [ "$RESTORE_FROM_SNAPSHOT" == "true" ]; then
  echo "Restoring from snapshot"
  chmod +x /opt/snapshot/restore-from-snapshot.sh
  /opt/snapshot/restore-from-snapshot.sh
else
  echo "Starting Bitcoin Core (no snapshot)"
  systemctl enable --now bitcoind
fi

echo "Setting up sync checker"
systemctl enable --now crond
/opt/sync-checker/setup.sh

if [[ "$LIFECYCLE_HOOK_NAME" != "none" ]]; then
  echo "Signaling ASG lifecycle hook to complete"
  TOKEN=$(curl -s -X PUT "http://169.254.169.254/latest/api/token" -H "X-aws-ec2-metadata-token-ttl-seconds: 21600")
  INSTANCE_ID=$(curl -H "X-aws-ec2-metadata-token: $TOKEN" -s http://169.254.169.254/latest/meta-data/instance-id)
  aws autoscaling complete-lifecycle-action --lifecycle-action-result CONTINUE --instance-id $INSTANCE_ID --lifecycle-hook-name "$LIFECYCLE_HOOK_NAME" --auto-scaling-group-name "$ASG_NAME" --region $AWS_REGION
fi

# Restart SSM Agent to ensure it picks up instance profile credentials
systemctl restart amazon-ssm-agent

echo "All Done!!"
