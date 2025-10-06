#!/bin/bash
set -x
# Write logs to /var/log/user-data.log
exec > >(tee /var/log/user-data.log | logger -t user-data -s 2>/dev/console) 2>&1

# Setup environment variables
ENV_FILE=/etc/cdk_environment
touch $ENV_FILE
chmod 600 $ENV_FILE

# Build default docker compose file list
# e.g /opt/instance/node/docker-compose-node.yml:/opt/instance/node/docker-compose-public-ports.yml
# this will run docker compose up -d with the files in the list
docker_compose_files="/opt/instance/node/docker-compose-node.yml"

# Build snapshot URL based on node type and network
snapshot_url="https://snapshots.vechainlabs.io/node"

# Build node options
node_options=(
  "--max-peers 300"
  "--enable-admin"
  "--admin-addr 192.168.112.21:2113"
  "--api-addr 192.168.112.21:80"
)

if [ "_VET_NODE_TYPE_" == "authority" ]; then
  node_options+=(
    "--skip-logs"
  )
  snapshot_url="${snapshot_url}-authority"
  docker_compose_files="${docker_compose_files}:/opt/instance/node/docker-compose-authority-ports.yml"
elif [ "_VET_NODE_TYPE_" == "public" ]; then
  node_options+=(
    "--disable-pruner"
    "--api-cors *"
    "--enable-metrics"
    "--metrics-addr 192.168.112.21:2112"
  )
  snapshot_url="${snapshot_url}-hosting"
  docker_compose_files="${docker_compose_files}:/opt/instance/node/docker-compose-public-ports.yml"
fi

if [ "_NETWORK_" == "mainnet" ]; then
  node_options+=("--network main")
  snapshot_url="${snapshot_url}-mainnet"
elif [ "_NETWORK_" == "testnet" ]; then
  node_options+=("--network test")
  snapshot_url="${snapshot_url}-testnet"
fi

snapshot_url="${snapshot_url}.tar.zst"

# Get instance ID
TOKEN=$(curl -s -X PUT "http://169.254.169.254/latest/api/token" -H "X-aws-ec2-metadata-token-ttl-seconds: 21600")
INSTANCE_ID=$(curl -H "X-aws-ec2-metadata-token: $TOKEN" -s http://169.254.169.254/latest/meta-data/instance-id)

cat >> "$ENV_FILE" <<EOF
export AWS_REGION=_AWS_REGION_
export STACK_NAME=_STACK_NAME_
export INSTANCE_ID=$INSTANCE_ID
export RESOURCE_ID=_NODE_CF_LOGICAL_ID_
export DATA_VOLUME_TYPE=_DATA_VOLUME_TYPE_
export DATA_VOLUME_SIZE=_DATA_VOLUME_SIZE_
export NETWORK=_NETWORK_
export VET_NODE_TYPE=_VET_NODE_TYPE_
export SYNC_FROM_PUBLIC_SNAPSHOT=_SYNC_FROM_PUBLIC_SNAPSHOT_
export VET_CONTAINER_IMAGE=_VET_CONTAINER_IMAGE_
export ASSETS_S3_PATH=_ASSETS_S3_PATH_
export NODE_OPTIONS="${node_options[*]}"
export COMPOSE_FILE=${docker_compose_files}
export LIFECYCLE_HOOK_NAME=_LIFECYCLE_HOOK_NAME_
export ASG_NAME=_ASG_NAME_
export SNAPSHOT_URL=${snapshot_url}
EOF

source $ENV_FILE

# Add environment variables to /etc/profile so they are available on login for root user
cat >> /etc/profile <<EOF
# Automatically source the environment file on login
if [ "\$(id -u)" -eq 0 ] && [ -f $ENV_FILE ]; then
  source $ENV_FILE
fi
EOF

# Install Middleware
sudo yum update -y
sudo yum install jq docker wget cronie amazon-cloudwatch-agent zstd -y

# Install Docker and setup docker compose
# Add ec2-user to docker group and start Docker
sudo usermod -a -G docker ec2-user
sudo systemctl enable docker.service
sudo systemctl start docker.service

# Detect architecture
arch=$(uname -m)

# Create docker CLI plugins dir in user's home
mkdir -p ~/.docker/cli-plugins

case $arch in
  x86_64)
    echo "This server is using Intel/AMD (x86_64)."

    # Docker Compose (x86_64)
    wget -q https://github.com/docker/compose/releases/download/v2.38.2/docker-compose-linux-x86_64 \
      -O ~/.docker/cli-plugins/docker-compose

    # s5cmd (x86_64)
    wget -q https://github.com/peak/s5cmd/releases/download/v2.2.2/s5cmd_2.2.2_Linux-64bit.tar.gz \
      -O /tmp/s5cmd.tar.gz
    ;;

  aarch64|arm64)
    echo "This server is using AWS Graviton (aarch64/arm64)."

    # Docker Compose (ARM64)
    wget -q https://github.com/docker/compose/releases/download/v2.38.2/docker-compose-linux-aarch64 \
      -O ~/.docker/cli-plugins/docker-compose

    # s5cmd (ARM64)
    wget -q https://github.com/peak/s5cmd/releases/download/v2.2.2/s5cmd_2.2.2_Linux-arm64.tar.gz \
      -O /tmp/s5cmd.tar.gz
    ;;

  *)
    echo "Processor architecture is unknown or unsupported: $arch"
    exit 1
    ;;
esac

# Make docker-compose executable
chmod +x ~/.docker/cli-plugins/docker-compose

# Download assets from s3
cd /opt
echo "Downloading assets zip file"
aws s3 cp $ASSETS_S3_PATH ./assets.zip
unzip -q assets.zip

# Setup CloudWatch Agent
cp /opt/instance/monitoring/cw-agent.json "/opt/aws/amazon-cloudwatch-agent/etc/custom-amazon-cloudwatch-agent.json"
/opt/aws/amazon-cloudwatch-agent/bin/amazon-cloudwatch-agent-ctl \
  -a fetch-config -c file:/opt/aws/amazon-cloudwatch-agent/etc/custom-amazon-cloudwatch-agent.json -m ec2 -s
systemctl enable amazon-cloudwatch-agent
systemctl restart amazon-cloudwatch-agent
systemctl daemon-reload

# Signal Cloudformation if single node deployment
if [[ "$LIFECYCLE_HOOK_NAME" == "none" ]]; then
  echo "Single node deployment"
  cfn-signal --stack $STACK_NAME --resource $RESOURCE_ID --region $AWS_REGION
fi

# Setup Storage
echo "Preparing data volume"
mkdir -p /thor
if [[ "$DATA_VOLUME_TYPE" == "instance-store" ]]; then
  echo "Data volume type is instance store"

  (
    crontab -l
    echo "@reboot /opt/instance/storage/setup.sh /thor ext4 > /var/log/setup-store-volume-data.log 2>&1"
  ) | crontab -
  crontab -l

  /opt/instance/storage/setup.sh /thor ext4
else
  echo "Data volume type is EBS"
  echo "Waiting for EBS volume with size ${DATA_VOLUME_SIZE} bytes to become available"

  # Wait for EBS volume with correct size to be available
  max_attempts=30
  attempt=1

  while [ $attempt -le $max_attempts ]; do
    echo "Attempt $attempt/$max_attempts: Checking for EBS volume with size ${DATA_VOLUME_SIZE} bytes..."

    if lsblk -lnb | grep "$DATA_VOLUME_SIZE" >/dev/null; then
      echo "Volume with $DATA_VOLUME_SIZE bytes found, proceeding with setup"
      /opt/instance/storage/setup.sh /thor ext4 $DATA_VOLUME_SIZE
      break
    fi

    if [ $attempt -eq $max_attempts ]; then
      echo "ERROR: EBS volume with size ${DATA_VOLUME_SIZE} bytes not available after $max_attempts attempts"
      exit 1
    fi

    echo "EBS volume with correct size not ready, waiting 10 seconds..."
    sleep 10
    attempt=$((attempt + 1))
  done

fi

# Download snapshot
if [ "_SYNC_FROM_PUBLIC_SNAPSHOT_" == "true" ]; then
  echo "Downloading public snapshot from: $SNAPSHOT_URL"

  # Add cron job to run the asg-heartbeat.sh script every 1 hour
  # snapshot download time may differ, so we may need to auto extend the lifecycle hook
  # default max for lifecycle hook is 120mins. Using hearbeats resets the timer.
  # this extends the lifecyle hook up to 48hrs.
  chmod +x /opt/instance/node/asg-heartbeat.sh
  (crontab -l; echo "0 * * * * /opt/instance/node/asg-heartbeat.sh") | crontab -

  # Extract filename from URL
  filename=$(basename "$SNAPSHOT_URL")
  echo "Downloading to: $filename"

  # Sometimes connection is lost, so auto try again
  # -c continue downloading the file if it is already partially downloaded
  # --tries=0 retry forever until the file is successfully downloaded
  # --retry-connrefused retry until the connection is established
  # --waitretry=10 wait 10 seconds between retries
  # --timeout=60 timeout after 60 seconds

  echo "Downloading snapshot with wget..."
  wget -c -q \
    --tries=0 --retry-connrefused --waitretry=10 --timeout=60 \
    -O "/thor/$filename" "$SNAPSHOT_URL"

  if [ $? -eq 0 ]; then
    echo "Snapshot downloaded at $(date '+%Y-%m-%d %H:%M:%S')"
    echo "$filename snapshot downloaded successfully"
    echo "Extracting snapshot $filename..."
    tar -xvf "/thor/$filename" -C /thor --use-compress-program=zstd
    cp -r /thor/data/instance* /thor/
    setfacl -R -m u:1000:rwx /thor
    rm -rf /thor/$filename /thor/data
    echo "$filename snapshot extraction completed at $(date '+%Y-%m-%d %H:%M:%S')"
  else
    echo "Failed to download $filename, continuing without it"
  fi
  # remove the asg-heartbeat.sh job
  (crontab -l | grep -v "asg-heartbeat.sh") | crontab -
fi

# Runs docker compose using the files defined in $COMPOSE_FILE environment variable
# Run cat /etc/cdk-environment or printenv to see the environment variables
docker compose up -d

# Signal the lifecycle hook to complete
if [[ "$LIFECYCLE_HOOK_NAME" != "none" ]]; then
  echo "HA deployment"
  echo "Signaling $ASG_NAME lifecycle hook to complete"

  aws autoscaling complete-lifecycle-action --lifecycle-action-result CONTINUE \
    --instance-id $INSTANCE_ID --lifecycle-hook-name $LIFECYCLE_HOOK_NAME \
    --auto-scaling-group-name $ASG_NAME --region $AWS_REGION
fi

# Add cron job to run the check_vet_sequence script every 1 minute
# be careful, pushing metric to cloudwatch will increase the cost
chmod +x /opt/instance/monitoring/check_vet_sequence.sh
(crontab -l; echo "*/1 * * * * /opt/instance/monitoring/check_vet_sequence.sh") | crontab -
