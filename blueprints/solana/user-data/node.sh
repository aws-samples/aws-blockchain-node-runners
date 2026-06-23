#!/bin/bash
# Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
# SPDX-License-Identifier: Apache-2.0

# Solana Protocol Node Initialization Script
# Sets up the Agave or Frankendancer validator client natively (no Docker)
# and starts it as a systemd service.
# Client detection is based on the CLIENT_CONFIG prefix:
#   - "agave*"          → builds Agave via build-solana.sh, runs as bcuser
#   - "frankendancer*"  → builds Frankendancer via build-frankendancer.sh, runs as root (drops to bcuser internally)

set -e

echo "Starting Solana node setup..."

# Source environment variables
source /etc/cdk_environment

# Ensure all helper scripts are executable
chmod +x /opt/blueprints/user-data/common/setup-configuration.sh 2>/dev/null || true
chmod +x /opt/blueprints/user-data/common/build-solana.sh 2>/dev/null || true
chmod +x /opt/blueprints/user-data/common/build-frankendancer.sh 2>/dev/null || true
chmod +x /opt/blueprints/user-data/common/configure-monitoring.sh 2>/dev/null || true
chmod +x /opt/blueprints/user-data/common/wait-for-rpc.sh 2>/dev/null || true

# Validate required variables
if [ -z "${BC_NETWORK:-}" ]; then
    echo "ERROR: BC_NETWORK is not set"
    exit 1
fi

if [ -z "${CLIENT_CONFIG:-}" ]; then
    echo "ERROR: CLIENT_CONFIG is not set"
    exit 1
fi

echo "Network: $BC_NETWORK"
echo "Client Configuration: $CLIENT_CONFIG"
echo "Deployment Mode: ${DEPLOYMENT_MODE:-single-node}"

# Detect client type from CLIENT_CONFIG prefix
case "$CLIENT_CONFIG" in
    frankendancer*)
        CLIENT_TYPE="frankendancer"
        ;;
    agave*)
        CLIENT_TYPE="agave"
        ;;
    *)
        echo "ERROR: Unrecognized client prefix in CLIENT_CONFIG: $CLIENT_CONFIG"
        echo "Supported prefixes: agave, frankendancer"
        exit 1
        ;;
esac

echo "Detected client type: $CLIENT_TYPE"

# Derive the build version from the configuration file name, which is the
# single source of truth. The version is everything between the client prefix
# and the "-rpc-(base|extended).sh" suffix, so it also captures prerelease
# tags such as release candidates:
#   "agave-3.1.14-rpc-base.sh"            -> "3.1.14"
#   "agave-4.0.3-rpc-extended.sh"         -> "4.0.3"
#   "agave-4.1.0-rc.1-rpc-base.sh"        -> "4.1.0-rc.1"
#   "frankendancer-0.912.40003-rpc-base.sh" -> "0.912.40003"
BUILD_VERSION=$(echo "$CLIENT_CONFIG" | sed -E 's/^[a-z]+-(.+)-rpc-(base|extended)\.sh$/\1/')
if [ -z "$BUILD_VERSION" ] || [ "$BUILD_VERSION" = "$CLIENT_CONFIG" ]; then
    echo "ERROR: Could not parse client version from CLIENT_CONFIG: $CLIENT_CONFIG"
    exit 1
fi
echo "Client Version (from config name): $BUILD_VERSION"

# Apply Solana-specific system tuning
echo "Applying Solana system tuning..."
/opt/blueprints/user-data/common/setup-configuration.sh

# Build and install client binaries based on detected client type
case "$CLIENT_TYPE" in
    frankendancer)
        echo "Building Frankendancer binaries for version $BUILD_VERSION..."
        /opt/blueprints/user-data/common/build-frankendancer.sh "$BUILD_VERSION"
        ;;
    agave)
        echo "Building Agave binaries for version $BUILD_VERSION..."
        /opt/blueprints/user-data/common/build-solana.sh "$BUILD_VERSION"
        ;;
esac

# Set up node identity keypair
echo "Setting up node identity..."
mkdir -p /home/bcuser/config
chown -R bcuser:bcuser /home/bcuser

if [ "${SOLANA_NODE_IDENTITY_SECRET_ARN:-none}" != "none" ]; then
    echo "Retrieving node identity from AWS Secrets Manager: $SOLANA_NODE_IDENTITY_SECRET_ARN"
    aws secretsmanager get-secret-value \
        --secret-id "$SOLANA_NODE_IDENTITY_SECRET_ARN" \
        --query SecretString \
        --output text \
        --region "$AWS_REGION" > /home/bcuser/config/validator-keypair.json
    echo "Node identity retrieved from Secrets Manager"
else
    echo "Generating new node identity keypair..."
    case "$CLIENT_TYPE" in
        frankendancer)
            # fdctl rejects root execution ("firedancer cannot run as root");
            # run as bcuser, same pattern as the agave case.
            su -c "/home/bcuser/bin/fdctl keys new /home/bcuser/config/validator-keypair.json" bcuser
            ;;
        agave)
            su -c "/home/bcuser/bin/solana-keygen new --no-passphrase -o /home/bcuser/config/validator-keypair.json" bcuser
            ;;
    esac
    echo "New node identity generated"
fi

chown bcuser:bcuser /home/bcuser/config/validator-keypair.json
chmod 600 /home/bcuser/config/validator-keypair.json

# Create ledger directory
mkdir -p /data/data/ledger
chown -R bcuser:bcuser /data
chown -R bcuser:bcuser /accounts

# Create symlink for convenience
ln -sf /data/data/ledger /home/bcuser/ledger 2>/dev/null || true

# Copy configuration script to bcuser bin
CONFIG_SCRIPT="/opt/blueprints/configurations/${CLIENT_CONFIG}"
if [ ! -f "$CONFIG_SCRIPT" ]; then
    echo "ERROR: Configuration script not found: $CONFIG_SCRIPT"
    echo "Available configurations:"
    ls -la /opt/blueprints/configurations/ || echo "Configurations directory not found"
    exit 1
fi

cp "$CONFIG_SCRIPT" /home/bcuser/bin/node-service.sh
chmod +x /home/bcuser/bin/node-service.sh
chown bcuser:bcuser /home/bcuser/bin/node-service.sh
echo "Configuration script installed: $CLIENT_CONFIG"

# Create systemd service for the node
# Service configuration differs by client type:
#   - Agave: runs as bcuser, LimitMEMLOCK=2000000000
#   - Frankendancer: runs as root (fdctl needs CAP_SYS_ADMIN for AF_XDP, drops to bcuser via TOML user field), LimitMEMLOCK=infinity
case "$CLIENT_TYPE" in
    frankendancer)
        cat > /etc/systemd/system/node.service <<EOF
[Unit]
Description=Solana Frankendancer Validator Node
After=network.target
StartLimitIntervalSec=0

[Service]
Type=simple
Restart=always
RestartSec=10
LimitNOFILE=1000000
LimitMEMLOCK=infinity
LogRateLimitIntervalSec=0
Environment="PATH=/bin:/usr/bin:/home/bcuser/bin"
EnvironmentFile=/etc/cdk_environment
ExecStart=/home/bcuser/bin/node-service.sh

[Install]
WantedBy=multi-user.target
EOF
        ;;
    agave)
        cat > /etc/systemd/system/node.service <<EOF
[Unit]
Description=Solana Agave Validator Node
After=network.target
StartLimitIntervalSec=0

[Service]
Type=simple
Restart=always
RestartSec=10
User=bcuser
LimitNOFILE=1000000
LimitMEMLOCK=2000000000
LogRateLimitIntervalSec=0
Environment="PATH=/bin:/usr/bin:/home/bcuser/bin"
EnvironmentFile=/etc/cdk_environment
ExecStart=/home/bcuser/bin/node-service.sh

[Install]
WantedBy=multi-user.target
EOF
        ;;
esac

# Enable and start the node service
systemctl daemon-reload
systemctl enable node.service
systemctl start node.service

echo "Solana node service started"

# Set up CloudWatch monitoring
echo "Setting up CloudWatch monitoring..."
/opt/blueprints/user-data/common/configure-monitoring.sh

echo "Solana node setup completed successfully"
