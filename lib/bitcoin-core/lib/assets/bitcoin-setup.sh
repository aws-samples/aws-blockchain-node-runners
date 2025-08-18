#!/bin/bash
# This script is used to set up a mainnet Bitcoin Core node on an Amazon Linux 2 instance.
set -euo pipefail

# The stack passes lifecycle hook information when used in an Auto
# Scaling Group. If no lifecycle hook name is supplied (single node
# deployment), default to "none" and use CloudFormation signaling.
LIFECYCLE_HOOK_NAME=${LIFECYCLE_HOOK_NAME:-none}
AUTOSCALING_GROUP_NAME=${AUTOSCALING_GROUP_NAME:-none}

# Ensure the data volume is mounted before proceeding
until mountpoint -q /home/bitcoin; do
  echo "Waiting for /home/bitcoin to be mounted..."
  sleep 2
done

yum update -y
amazon-linux-extras install docker -y
service docker start
systemctl enable docker

# Create bitcoin user with specific UID:GID to match the container's expected values
if id -u bitcoin > /dev/null 2>&1; then
  # User exists, update to correct UID:GID
  usermod -u 101 bitcoin
  groupmod -g 101 bitcoin
else
  # Create user with specific UID:GID
  groupadd -g 101 bitcoin
  useradd -u 101 -g 101 -m -s /bin/bash bitcoin
fi

# Create the bitcoin data directory structure on the mounted EBS volume
mkdir -p /home/bitcoin/.bitcoin
echo "${BITCOIN_CONF}" > /home/bitcoin/.bitcoin/bitcoin.conf

# Set proper permissions for the Bitcoin configuration
chown -R bitcoin:bitcoin /home/bitcoin
chmod -R 755 /home/bitcoin

# Run Bitcoin Core in Docker with proper volume mapping
# Modified to ensure data is stored on the EBS volume
docker run -d --name bitcoind \
  -v /home/bitcoin/.bitcoin:/home/bitcoin/.bitcoin \
  -p 8333:8333 \
  -p 8332:8332 \
  --restart unless-stopped \
  bitcoin/bitcoin:latest \
  bitcoind -datadir=/home/bitcoin/.bitcoin

# Signal completion depending on deployment type
if [[ "$LIFECYCLE_HOOK_NAME" != "none" ]]; then
  echo "Signaling ASG lifecycle hook to complete"
  TOKEN=$(curl -s -X PUT "http://169.254.169.254/latest/api/token" -H "X-aws-ec2-metadata-token-ttl-seconds: 21600")
  INSTANCE_ID=$(curl -H "X-aws-ec2-metadata-token: $TOKEN" -s http://169.254.169.254/latest/meta-data/instance-id)
  aws autoscaling complete-lifecycle-action --lifecycle-action-result CONTINUE --instance-id "$INSTANCE_ID" --lifecycle-hook-name "$LIFECYCLE_HOOK_NAME" --auto-scaling-group-name "$AUTOSCALING_GROUP_NAME" --region "$AWS_REGION"
else
  if ! command -v cfn-signal &> /dev/null; then
    yum install -y aws-cfn-bootstrap
  fi
  cfn-signal --stack "$STACK_NAME" --resource "$RESOURCE_ID" --region "$AWS_REGION"
fi

