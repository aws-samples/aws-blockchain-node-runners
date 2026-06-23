#!/bin/bash
# Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
# SPDX-License-Identifier: Apache-2.0

set -e

echo "Starting Bitcoin Core node setup..."

# Source environment variables
source /etc/cdk_environment

# Validate required variables
if [ -z "$BC_NETWORK" ]; then
    echo "ERROR: BC_NETWORK is not set"
    exit 1
fi

if [ -z "$CLIENT_CONFIG" ]; then
    echo "ERROR: CLIENT_CONFIG is not set"
    exit 1
fi

# Get EC2 internal IP and region
TOKEN=$(curl -s -X PUT "http://169.254.169.254/latest/api/token" -H "X-aws-ec2-metadata-token-ttl-seconds: 21600")
EC2_INTERNAL_IP=$(curl -H "X-aws-ec2-metadata-token: $TOKEN" -s http://169.254.169.254/latest/meta-data/local-ipv4)
export EC2_INTERNAL_IP
REGION=$(curl -H "X-aws-ec2-metadata-token: $TOKEN" -s http://169.254.169.254/latest/dynamic/instance-identity/document | jq -r .region)

echo "EC2 Internal IP: $EC2_INTERNAL_IP"
echo "Network: $BC_NETWORK"
echo "Client Configuration: $CLIENT_CONFIG"

# Extract version from config filename (e.g. bitcoin-core-v30.2-full.yml -> 30.2)
BTC_VERSION=$(echo "$CLIENT_CONFIG" | grep -oP 'v[\d.]+' | sed 's/^v//')
echo "Bitcoin Core version: $BTC_VERSION"

# Detect architecture
ARCH=$(uname -m)
echo "Architecture: $ARCH"

# Create directory structure
mkdir -p /data
mkdir -p /home/bcuser/bin

# Download Bitcoin Core binary
echo "Downloading Bitcoin Core ${BTC_VERSION}..."
cd /tmp

if [ "$ARCH" = "x86_64" ]; then
    BTC_ARCH="x86_64-linux-gnu"
elif [ "$ARCH" = "aarch64" ]; then
    BTC_ARCH="aarch64-linux-gnu"
else
    echo "ERROR: Unsupported architecture: $ARCH"
    exit 1
fi

BTC_TARBALL="bitcoin-${BTC_VERSION}-${BTC_ARCH}.tar.gz"
BTC_URL="https://bitcoincore.org/bin/bitcoin-core-${BTC_VERSION}/${BTC_TARBALL}"
echo "Download URL: $BTC_URL"

curl -fsSL -o "$BTC_TARBALL" "$BTC_URL"

# Verify SHA256 checksum against the official checksums file (same origin as the binary)
echo "Verifying SHA256 checksum..."
CHECKSUMS_URL="https://bitcoincore.org/bin/bitcoin-core-${BTC_VERSION}/SHA256SUMS"
curl -fsSL -o SHA256SUMS "$CHECKSUMS_URL"
grep "$BTC_TARBALL" SHA256SUMS | sha256sum -c -
echo "Checksum verification passed"
rm -f SHA256SUMS

tar -xzf "$BTC_TARBALL"
cp "bitcoin-${BTC_VERSION}/bin/bitcoind" /home/bcuser/bin/
cp "bitcoin-${BTC_VERSION}/bin/bitcoin-cli" /home/bcuser/bin/
chmod +x /home/bcuser/bin/bitcoind /home/bcuser/bin/bitcoin-cli
rm -rf "bitcoin-${BTC_VERSION}" "$BTC_TARBALL"

echo "Bitcoin Core binaries installed"

# Set ownership
chown -R bcuser:bcuser /data
chown -R bcuser:bcuser /home/bcuser
chmod -R 755 /home/bcuser

echo "Directories created and ownership set to bcuser"

# --- RPC authentication credentials ---
# In HA mode, multiple nodes share the same secret so any node behind the ALB
# accepts the same credentials. The first node to boot creates the secret;
# subsequent nodes read it and reuse the same username/password.
# The secret name includes the CF stack name to avoid collisions when multiple
# Bitcoin deployments exist in the same account/region.
SECRET_NAME="${STACK_NAME}/bitcoin_rpc_credentials"
EXISTING_CREDS=""

echo "Checking for existing RPC credentials in Secrets Manager..."
EXISTING_CREDS=$(aws secretsmanager get-secret-value \
    --secret-id "$SECRET_NAME" \
    --query SecretString --output text \
    --region "$REGION" 2>/dev/null || true)

if [ -n "$EXISTING_CREDS" ]; then
    echo "Found existing credentials in Secrets Manager — reusing for HA consistency"
    RPC_USERNAME=$(echo "$EXISTING_CREDS" | cut -d: -f1)
    RPC_PASSWORD=$(echo "$EXISTING_CREDS" | cut -d: -f2-)
else
    echo "No existing credentials found — generating new RPC authentication credentials..."
    RPC_USERNAME="user_$(openssl rand -hex 4)"
    RPC_PASSWORD=$(openssl rand -base64 32 | tr -d '=/+' | head -c 44)

    # Store in Secrets Manager so other HA nodes can reuse them
    SECRET_VALUE="${RPC_USERNAME}:${RPC_PASSWORD}"
    aws secretsmanager create-secret \
        --name "$SECRET_NAME" \
        --secret-string "$SECRET_VALUE" \
        --region "$REGION" 2>/dev/null \
    || aws secretsmanager put-secret-value \
        --secret-id "$SECRET_NAME" \
        --secret-string "$SECRET_VALUE" \
        --region "$REGION" 2>/dev/null \
    || echo "WARNING: Failed to store credentials in Secrets Manager"
fi

# Generate rpcauth hash from the credentials (each node computes its own hash
# from the shared password — the salt is per-node but that's fine, Bitcoin Core
# supports multiple rpcauth lines and we only need one per node)
RPC_SALT=$(openssl rand -hex 16)
RPC_HASH=$(echo -n "$RPC_PASSWORD" | openssl dgst -sha256 -hmac "$RPC_SALT" | awk '{print $NF}')
RPCAUTH_LINE="rpcauth=${RPC_USERNAME}:${RPC_SALT}\$${RPC_HASH}"

echo "RPC username: $RPC_USERNAME"
echo "RPC auth line generated"

# Save credentials locally as fallback
echo "${RPC_USERNAME}:${RPC_PASSWORD}" > /data/.rpc-credentials
chmod 600 /data/.rpc-credentials
chown bcuser:bcuser /data/.rpc-credentials
echo "RPC credentials saved locally to /data/.rpc-credentials"

# --- Generate bitcoin.conf ---
echo "Generating bitcoin.conf..."

# Set network-specific options
if [ "$BC_NETWORK" = "mainnet" ]; then
    NETWORK_CONF=""
    RPC_PORT=8332
elif [ "$BC_NETWORK" = "testnet" ]; then
    NETWORK_CONF="testnet=1"
    RPC_PORT=18332
else
    echo "ERROR: Unknown BC_NETWORK: $BC_NETWORK (expected mainnet or testnet)"
    exit 1
fi

cat > /data/bitcoin.conf <<BTCCONF_EOF
# Bitcoin Core Configuration
# Generated by AWS Blockchain Node Runner

# Network
${NETWORK_CONF}

# Server / RPC
server=1
${RPCAUTH_LINE}
rpcbind=127.0.0.1:${RPC_PORT}
rpcbind=${EC2_INTERNAL_IP}:${RPC_PORT}
rpcallowip=127.0.0.1
rpcallowip=10.0.0.0/8
rpcallowip=172.16.0.0/12
rpcallowip=192.168.0.0/16

# Indexing
txindex=1

# Performance
dbcache=4096
maxmempool=300
maxconnections=125

# Logging
printtoconsole=1
BTCCONF_EOF

chown bcuser:bcuser /data/bitcoin.conf
echo "bitcoin.conf generated"

# Create startup script
cat > /home/bcuser/bin/start-node.sh <<'STARTUP_EOF'
#!/bin/bash
set -e
exec /home/bcuser/bin/bitcoind \
    -conf=/data/bitcoin.conf \
    -datadir=/data \
    -printtoconsole
STARTUP_EOF
chmod +x /home/bcuser/bin/start-node.sh

# Create systemd service
cat > /etc/systemd/system/node.service <<EOF
[Unit]
Description=Bitcoin Core Node Service
After=network-online.target

[Service]
Type=simple
Restart=always
RestartSec=30
User=bcuser
Group=bcuser
Environment="PATH=/bin:/usr/bin:/home/bcuser/bin"
ExecStart=/home/bcuser/bin/start-node.sh
ExecStop=/home/bcuser/bin/bitcoin-cli -conf=/data/bitcoin.conf stop
TimeoutStopSec=600

[Install]
WantedBy=multi-user.target
EOF

# Enable and start the node service
systemctl daemon-reload
systemctl enable node.service
systemctl start node.service

echo "Bitcoin Core node service started"

# Wait for process to start
echo "Waiting for node to start..."
sleep 10

# Check if service is running
if systemctl is-active --quiet node.service; then
    echo "Bitcoin Core service is running"
else
    echo "WARNING: Bitcoin Core service is not running"
    journalctl -u node.service --no-pager -n 20
fi

# Mark initialization as complete
touch /data/init-completed

echo "Bitcoin Core node setup completed successfully"
