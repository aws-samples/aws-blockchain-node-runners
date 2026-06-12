#!/bin/bash
set +e

echo "AWS_REGION=${_AWS_REGION_}" >> /etc/environment
echo "ASSETS_S3_PATH=${_ASSETS_S3_PATH_}" >> /etc/environment
echo "TRON_SNAPSHOTS_URL=${_TRON_SNAPSHOTS_URL_}" >> /etc/environment
echo "STACK_NAME=${_STACK_NAME_}" >> /etc/environment
echo "STACK_ID=${_STACK_ID_}" >> /etc/environment
echo "RESOURCE_ID=${_NODE_CF_LOGICAL_ID_}" >> /etc/environment
echo "DATA_VOLUME_TYPE=${_DATA_VOLUME_TYPE_}" >> /etc/environment
echo "DATA_VOLUME_SIZE=${_DATA_VOLUME_SIZE_}" >> /etc/environment
echo "TRON_NODE_TYPE=${_TRON_NODE_TYPE_}" >> /etc/environment
echo "TRON_NETWORK=${_TRON_NETWORK_}" >> /etc/environment
echo "TRON_DB_ENGINE=${_TRON_DB_ENGINE_}" >> /etc/environment
echo "TRON_DOWNLOAD_SNAPSHOT=${_TRON_DOWNLOAD_SNAPSHOT_}" >> /etc/environment
echo "TRON_SNAPSHOT_TYPE=${_TRON_SNAPSHOT_TYPE_}" >> /etc/environment
echo "TRON_SNAPSHOT_S3_BUCKET=${_TRON_SNAPSHOT_S3_BUCKET_}" >> /etc/environment
echo "TRON_SNAPSHOT_NODE=${_TRON_SNAPSHOT_NODE_}" >> /etc/environment
echo "LIFECYCLE_HOOK_NAME=${_LIFECYCLE_HOOK_NAME_}" >> /etc/environment
echo "AUTOSCALING_GROUP_NAME=${_AUTOSCALING_GROUP_NAME_}" >> /etc/environment
source /etc/environment

arch=$(uname -m)
echo "Architecture detected: $arch"

if [ "$arch" == "x86_64" ]; then
  SSM_AGENT_BINARY_URI=https://s3.amazonaws.com/ec2-downloads-windows/SSMAgent/latest/linux_amd64/amazon-ssm-agent.rpm
  AWS_CLI_BINARY_URI=https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip
else
  SSM_AGENT_BINARY_URI=https://s3.amazonaws.com/ec2-downloads-windows/SSMAgent/latest/linux_arm64/amazon-ssm-agent.rpm
  AWS_CLI_BINARY_URI=https://awscli.amazonaws.com/awscli-exe-linux-aarch64.zip
fi

echo "Updating and installing required system packages"
yum update -y
amazon-linux-extras install epel -y
yum groupinstall "Development Tools" -y
yum -y install amazon-cloudwatch-agent collectd jq gcc ncurses-devel telnet aws-cfn-bootstrap wget tar gzip pv aria2 pigz zstd

# Install the correct Amazon Corretto JDK for the CPU architecture.
# java-tron requires JDK 17 on ARM64 (Graviton) and JDK 8 on x86_64.
echo "Installing Amazon Corretto JDK"
rpm --import https://yum.corretto.aws/corretto.key
curl -sL -o /etc/yum.repos.d/corretto.repo https://yum.corretto.aws/corretto.repo
if [ "$arch" == "x86_64" ]; then
  yum install -y java-1.8.0-amazon-corretto-devel
else
  yum install -y java-17-amazon-corretto-devel
fi
java -version

cd /opt

echo 'Installing AWS CLI v2'
curl "$AWS_CLI_BINARY_URI" -o "awscliv2.zip"
unzip -q awscliv2.zip
./aws/install
rm -f /usr/bin/aws
ln /usr/local/bin/aws /usr/bin/aws

echo "Installing s5cmd for fast S3 transfers"
if [ "$arch" == "x86_64" ]; then
  S5CMD_URI=https://github.com/peak/s5cmd/releases/download/v2.2.2/s5cmd_2.2.2_Linux-64bit.tar.gz
else
  S5CMD_URI=https://github.com/peak/s5cmd/releases/download/v2.2.2/s5cmd_2.2.2_Linux-arm64.tar.gz
fi
cd /opt
wget -q "$S5CMD_URI" -O s5cmd.tar.gz
tar -xf s5cmd.tar.gz s5cmd
chmod +x s5cmd
mv s5cmd /usr/bin/
s5cmd version || echo "s5cmd install check failed (non-fatal)"

echo "Downloading assets zip file"
aws s3 cp "$ASSETS_S3_PATH" ./assets.zip --region "$AWS_REGION"
unzip -q assets.zip

aws configure set default.s3.max_concurrent_requests 50
aws configure set default.s3.multipart_chunksize 256MB

echo 'Installing SSM Agent'
yum install -y "$SSM_AGENT_BINARY_URI"

echo 'Adding bcuser user and group'
sudo groupadd -g 1002 bcuser
sudo useradd -u 1002 -g 1002 -m -s /bin/bash bcuser
# bcuser runs the tron service and the snapshot scripts; it does NOT need sudo (least privilege).

echo "Installing java-tron FullNode.jar"
mkdir -p /home/bcuser/tron
cd /home/bcuser/tron

# Download the latest released FullNode jar for the correct CPU architecture.
# java-tron publishes per-arch jars: FullNode-aarch64.jar (ARM64) and FullNode.jar (x86_64).
# The generic FullNode.jar bundles an x86_64-only RocksDB native lib and will NOT run on ARM64.
if [ "$arch" == "x86_64" ]; then
  JAR_ASSET="FullNode.jar"
else
  JAR_ASSET="FullNode-aarch64.jar"
fi
echo "Selecting java-tron jar asset: $JAR_ASSET"
FULLNODE_JAR_URL=$(curl -s https://api.github.com/repos/tronprotocol/java-tron/releases/latest | jq -r --arg n "$JAR_ASSET" '.assets[] | select(.name==$n) | .browser_download_url')
if [ -z "$FULLNODE_JAR_URL" ] || [ "$FULLNODE_JAR_URL" == "null" ]; then
  echo "Could not resolve $JAR_ASSET asset URL, falling back to latest/download redirect"
  FULLNODE_JAR_URL="https://github.com/tronprotocol/java-tron/releases/latest/download/$JAR_ASSET"
fi
echo "Downloading $JAR_ASSET from: $FULLNODE_JAR_URL"
# Integrity: fetched over HTTPS from the official tronprotocol GitHub releases. java-tron does not
# currently publish per-asset checksums in its releases; add SHA256 verification here if/when it does.
wget -q -O FullNode.jar "$FULLNODE_JAR_URL" || { echo "ERROR: failed to download FullNode.jar from $FULLNODE_JAR_URL"; exit 1; }

# Fetch the network configuration file
if [ "$TRON_NETWORK" == "nile" ]; then
  echo "Fetching Nile testnet config"
  wget -q -O config.conf https://raw.githubusercontent.com/tron-nile-testnet/nile-testnet/master/framework/src/main/resources/config-nile.conf || { echo "ERROR: failed to download Nile config"; exit 1; }
else
  echo "Fetching mainnet config"
  wget -q -O config.conf https://raw.githubusercontent.com/tronprotocol/java-tron/master/framework/src/main/resources/config.conf || { echo "ERROR: failed to download mainnet config"; exit 1; }
fi

# Set the storage engine. ARM64 only supports ROCKSDB.
if [ "$TRON_DB_ENGINE" == "rocksdb" ] || [ "$arch" != "x86_64" ]; then
  echo "Setting db.engine = ROCKSDB"
  sed -i 's/db\.engine[[:space:]]*=[[:space:]]*"LEVELDB"/db.engine = "ROCKSDB"/' config.conf
fi

# For Lite FullNode, enable history query APIs for data synced after startup.
if [ "$TRON_NODE_TYPE" == "lite" ]; then
  echo "Enabling openHistoryQueryWhenLiteFN for Lite FullNode"
  sed -i 's/openHistoryQueryWhenLiteFN[[:space:]]*=[[:space:]]*false/openHistoryQueryWhenLiteFN = true/' config.conf
fi

sudo chown bcuser:bcuser -R /home/bcuser/

echo "Creating systemd service for java-tron"
# Compute -Xmx as ~80% of physical memory (in GB), floor of 4g
MEM_TOTAL_KB=$(grep MemTotal /proc/meminfo | awk '{print $2}')
XMX_GB=$(( MEM_TOTAL_KB * 80 / 100 / 1024 / 1024 ))
if [ "$XMX_GB" -lt 4 ]; then XMX_GB=4; fi
echo "Setting -Xmx${!XMX_GB}g"

# Select GC by JDK version. TRON docs recommend CMS (-XX:+UseConcMarkSweepGC) for JDK 8 (x86_64),
# but CMS was removed in JDK 14+, so on ARM64 (which requires JDK 17) we use G1GC instead.
if [ "$arch" == "x86_64" ]; then
  GC_OPTS="-XX:+UseConcMarkSweepGC"
else
  GC_OPTS="-XX:+UseG1GC"
fi
echo "Using GC options: $GC_OPTS"

sudo bash -c "cat > /home/bcuser/tron/start.sh <<EOF
#!/bin/bash
cd /home/bcuser/tron
exec java -Xmx${!XMX_GB}g $GC_OPTS -jar /home/bcuser/tron/FullNode.jar -c /home/bcuser/tron/config.conf -d /data/output-directory
EOF"
sudo chmod +x /home/bcuser/tron/start.sh
sudo chown bcuser:bcuser /home/bcuser/tron/start.sh

sudo bash -c 'cat > /etc/systemd/system/tron.service <<EOF
[Unit]
Description=TRON java-tron Node
After=network-online.target
[Service]
Type=simple
Restart=always
RestartSec=30
User=bcuser
LimitNOFILE=1000000
WorkingDirectory=/home/bcuser/tron
ExecStart=/home/bcuser/tron/start.sh
# Security hardening (conservative). NOTE: java-tron runs from /home/bcuser/tron and writes /data,
# so ProtectHome is intentionally NOT set, and ProtectSystem=full (not strict) keeps those writable.
# Not re-tested on a live boot in this revision.
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=full
ProtectControlGroups=true
ProtectKernelTunables=true
ProtectKernelModules=true
RestrictAddressFamilies=AF_INET AF_INET6 AF_UNIX
[Install]
WantedBy=multi-user.target
EOF'

echo "Configuring syncchecker script"
cd /opt
mv /opt/tron-checker/syncchecker-tron.sh /opt/syncchecker.sh
chmod +x /opt/syncchecker.sh
(crontab -l 2>/dev/null; echo "*/1 * * * * /opt/syncchecker.sh >/tmp/syncchecker.log 2>&1") | crontab -
crontab -l

if [[ "$LIFECYCLE_HOOK_NAME" == "none" ]]; then
  echo "Single node. Signaling completion to CloudFormation"
  /opt/aws/bin/cfn-signal --stack "$STACK_NAME" --resource "$RESOURCE_ID" --region "$AWS_REGION"
  echo "Single node. Wait for one minute for the volume to be available"
  sleep 60
fi

echo "Preparing data volume"
mkdir -p /data

if [[ "$DATA_VOLUME_TYPE" == "instance-store" ]]; then
  echo "Data volume type is instance store"
  cd /opt
  chmod +x /opt/setup-instance-store-volumes.sh
  (crontab -l 2>/dev/null; echo "@reboot /opt/setup-instance-store-volumes.sh >/tmp/setup-instance-store-volumes.log 2>&1") | crontab -
  /opt/setup-instance-store-volumes.sh
else
  echo "Data volume type is EBS"
  # Identify the data volume by size, excluding any already-mounted device (e.g. the root volume)
  # so we never mkfs the root disk if sizes happen to collide (prevents catastrophic data loss).
  DATA_VOLUME_ID=/dev/$(lsblk -lnb -o NAME,SIZE,MOUNTPOINT | awk -v VOLUME_SIZE_BYTES="$DATA_VOLUME_SIZE" '($2==VOLUME_SIZE_BYTES && $3==""){print $1; exit}')
  if [ "$DATA_VOLUME_ID" == "/dev/" ]; then
    echo "ERROR: could not identify an unmounted data volume of size $DATA_VOLUME_SIZE; skipping format to avoid data loss."
  else
    mkfs -t xfs "$DATA_VOLUME_ID"
    sleep 10
    DATA_VOLUME_UUID=$(lsblk -fn -o UUID "$DATA_VOLUME_ID")
    DATA_VOLUME_FSTAB_CONF="UUID=$DATA_VOLUME_UUID /data xfs defaults 0 2"
    echo "DATA_VOLUME_ID=$DATA_VOLUME_ID"
    echo "$DATA_VOLUME_FSTAB_CONF" | tee -a /etc/fstab
    mount -a
  fi
fi

lsblk -d
chown bcuser:bcuser -R /data

# Download snapshot to speed up sync (streamed download + extract).
if [[ "$TRON_DOWNLOAD_SNAPSHOT" == "true" ]]; then
  echo "Downloading TRON snapshot"
  chmod +x /opt/download-snapshot.sh
  su - bcuser -c "TRON_NODE_TYPE=$TRON_NODE_TYPE TRON_NETWORK=$TRON_NETWORK TRON_DB_ENGINE=$TRON_DB_ENGINE TRON_SNAPSHOTS_URL=$TRON_SNAPSHOTS_URL TRON_SNAPSHOT_TYPE=$TRON_SNAPSHOT_TYPE TRON_SNAPSHOT_S3_BUCKET=$TRON_SNAPSHOT_S3_BUCKET /opt/download-snapshot.sh"
fi

mkdir -p /data/output-directory
chown bcuser:bcuser -R /data

echo 'Configuring CloudWatch Agent'
cp /opt/cw-agent.json /opt/aws/amazon-cloudwatch-agent/etc/custom-amazon-cloudwatch-agent.json
echo "Starting CloudWatch Agent"
/opt/aws/amazon-cloudwatch-agent/bin/amazon-cloudwatch-agent-ctl \
-a fetch-config -c file:/opt/aws/amazon-cloudwatch-agent/etc/custom-amazon-cloudwatch-agent.json -m ec2 -s
systemctl status amazon-cloudwatch-agent

echo "Starting TRON node service"
sudo systemctl daemon-reload
sudo systemctl enable --now tron

# Snapshot node: upload DB to S3 daily so RPC/single nodes can restore fast (TRON_SNAPSHOT_TYPE=s3).
if [[ "$TRON_SNAPSHOT_NODE" == "true" ]]; then
  echo "Configuring daily snapshot upload cron (snapshot node)"
  chmod +x /opt/upload-snapshot.sh
  (crontab -l 2>/dev/null; echo "0 0 * * * /opt/upload-snapshot.sh >/tmp/upload-snapshot.log 2>&1") | crontab -
fi

if [[ "$LIFECYCLE_HOOK_NAME" != "none" ]]; then
  echo "Signaling ASG lifecycle hook to complete"
  TOKEN=$(curl -s -X PUT "http://169.254.169.254/latest/api/token" -H "X-aws-ec2-metadata-token-ttl-seconds: 21600")
  INSTANCE_ID=$(curl -H "X-aws-ec2-metadata-token: $TOKEN" -s http://169.254.169.254/latest/meta-data/instance-id)
  aws autoscaling complete-lifecycle-action --lifecycle-action-result CONTINUE --instance-id "$INSTANCE_ID" --lifecycle-hook-name "$LIFECYCLE_HOOK_NAME" --auto-scaling-group-name "$AUTOSCALING_GROUP_NAME" --region "$AWS_REGION"
fi

echo "All Done!!"
set -e
