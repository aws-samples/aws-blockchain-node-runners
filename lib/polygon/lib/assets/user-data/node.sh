#!/bin/bash
set -euo pipefail

# Variables injected by CDK via Fn::Sub
REGION="${_REGION_}"
ASSETS_S3_PATH="${_ASSETS_S3_PATH_}"
POLYGON_NETWORK="${_POLYGON_NETWORK_}"
POLYGON_ERIGON_IMAGE="${_POLYGON_ERIGON_IMAGE_}"
POLYGON_HEIMDALL_API_URL="${_POLYGON_HEIMDALL_API_URL_}"
STACK_NAME="${_STACK_NAME_}"
DATA_VOLUME_TYPE="${_DATA_VOLUME_TYPE_}"
DATA_VOLUME_SIZE="${_DATA_VOLUME_SIZE_}"

# Map network name to Erigon chain name
case "$POLYGON_NETWORK" in
    mainnet) POLYGON_CHAIN_NAME="bor-mainnet" ;;
    amoy)    POLYGON_CHAIN_NAME="amoy" ;;
    *)       POLYGON_CHAIN_NAME="bor-mainnet" ;;
esac

echo "========== Polygon Node Setup Starting =========="
echo "Network: $POLYGON_NETWORK (chain: $POLYGON_CHAIN_NAME)"
echo "Erigon Image: $POLYGON_ERIGON_IMAGE"

# Install dependencies
yum update -y
yum install -y jq aws-cfn-bootstrap amazon-cloudwatch-agent cronie

# Install Docker from official repo (includes docker-compose-plugin)
yum install -y yum-utils
yum-config-manager --add-repo https://download.docker.com/linux/centos/docker-ce.repo
yum install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

# Start Docker
systemctl enable docker
systemctl start docker

# Format and mount data volume
# Note: CloudFormation VolumeAttachment may take several minutes after instance launch.
# We poll for up to 10 minutes for the device to appear.
DATA_DIR="/data"
mkdir -p "$DATA_DIR"
if [ "$DATA_VOLUME_TYPE" != "instance-store" ]; then
    echo "Waiting for EBS data volume to be attached..."
    WAIT_SECONDS=0
    MAX_WAIT=600
    DEVICE=""
    while [ $WAIT_SECONDS -lt $MAX_WAIT ]; do
        # Look for unformatted nvme device larger than 100GB (skip root volume)
        DEVICE=$(lsblk -lnb | awk '{if ($7 == "" && $4 > 100000000000) {print "/dev/"$1}}' | grep nvme | sort | head -1)
        if [ -n "$DEVICE" ]; then
            echo "Found data volume: $DEVICE after $WAIT_SECONDS seconds"
            break
        fi
        # Also check traditional device names
        for dev in /dev/sdf /dev/xvdf; do
            if [ -e "$dev" ]; then DEVICE="$dev"; break 2; fi
        done
        sleep 10
        WAIT_SECONDS=$((WAIT_SECONDS + 10))
        echo "Waiting for data volume... ($WAIT_SECONDS seconds/$MAX_WAIT seconds)"
    done

    if [ -n "$DEVICE" ]; then
        echo "Using device: $DEVICE"
        if ! blkid "$DEVICE" 2>/dev/null; then
            mkfs.xfs "$DEVICE"
        fi
        mount "$DEVICE" "$DATA_DIR"
        VOLUME_UUID=$(blkid -s UUID -o value "$DEVICE")
        echo "UUID=$VOLUME_UUID $DATA_DIR xfs defaults,nofail 0 2" >> /etc/fstab
    else
        echo "WARNING: No data volume found after $MAX_WAIT seconds. Using root volume for data."
    fi
fi

# Create data directory with restricted permissions
# Erigon runs as UID 1000 inside the container
mkdir -p "$DATA_DIR/erigon"
chown -R 1000:1000 "$DATA_DIR/erigon"
chmod -R 750 "$DATA_DIR/erigon"

# Create docker-compose file
cat > /home/ec2-user/docker-compose.yml << COMPOSEOF
services:
  erigon:
    image: $POLYGON_ERIGON_IMAGE
    container_name: erigon
    restart: always
    command:
      - --chain=$POLYGON_CHAIN_NAME
      - --bor.heimdall=$POLYGON_HEIMDALL_API_URL
      - --datadir=/var/lib/erigon/data
      - --http
      - --http.api=eth,debug,net,trace,web3,erigon,txpool,bor
      - --http.addr=0.0.0.0
      - --http.vhosts=localhost,127.0.0.1
      - --torrent.download.rate=512mb
      - --metrics
      - --metrics.addr=0.0.0.0
      - --maxpeers=100
    ports:
      - "8545:8545"
      - "30303:30303/tcp"
      - "30303:30303/udp"
      - "42069:42069/tcp"
      - "42069:42069/udp"
    volumes:
      - $DATA_DIR/erigon:/var/lib/erigon/data
COMPOSEOF

# Start services
cd /home/ec2-user
docker compose up -d

# Setup sync checker cron (publish metrics to CloudWatch every 5 min)
# Uses IMDSv2 token-based authentication
cat > /home/ec2-user/sync-checker.sh << 'CHECKEREOF'
#!/bin/bash
TOKEN=$(curl -s -X PUT "http://169.254.169.254/latest/api/token" -H "X-aws-ec2-metadata-token-ttl-seconds: 21600")
INSTANCE_ID=$(curl -s -H "X-aws-ec2-metadata-token: $TOKEN" http://169.254.169.254/latest/meta-data/instance-id)

# Check if Erigon is syncing
SYNCING=$(curl -s -X POST -H "Content-Type: application/json" \
    --data '{"method":"eth_syncing","params":[],"id":1,"jsonrpc":"2.0"}' \
    http://localhost:8545 2>/dev/null | jq -r '.result')

BLOCK_HEX=$(curl -s -X POST -H "Content-Type: application/json" \
    --data '{"method":"eth_blockNumber","params":[],"id":1,"jsonrpc":"2.0"}' \
    http://localhost:8545 2>/dev/null | jq -r '.result // "0x0"')
BLOCK=$((BLOCK_HEX))

IS_SYNCING=1
if [ "$SYNCING" = "false" ]; then IS_SYNCING=0; fi

aws cloudwatch put-metric-data --namespace "Polygon/Node" --dimensions InstanceId="$INSTANCE_ID" \
    --metric-data "[{\"MetricName\":\"ErigonBlockHeight\",\"Value\":$BLOCK,\"Unit\":\"Count\"},{\"MetricName\":\"ErigonSyncing\",\"Value\":$IS_SYNCING,\"Unit\":\"Count\"}]" 2>/dev/null || true
CHECKEREOF

chmod +x /home/ec2-user/sync-checker.sh
echo "*/5 * * * * /home/ec2-user/sync-checker.sh" | crontab -

# Note: cfn-signal is not used because CreationPolicy is disabled
# (avoids circular dependency with VolumeAttachment).
# Node health is monitored via CloudWatch metrics instead.

echo "========== Polygon Node Setup Complete =========="
