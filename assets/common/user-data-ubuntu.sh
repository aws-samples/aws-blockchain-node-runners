#!/bin/bash
# Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
# SPDX-License-Identifier: Apache-2.0

set +e

# Create secure environment file for CDK-injected variables.
#
# Values are written as single-quoted assignments (KEY='value'). This is a
# security boundary: it prevents the shell from expanding or executing any
# value, both when this file is generated AND when it is later sourced — a
# malicious value like $(...) or one containing & ; | would otherwise run as
# root. CDK single-quote-escapes every value before injection (see
# UserDataManager.injectVariables).
#
# The heredoc delimiter is single-quoted ('CDK_ENVIRONMENT_EOF') so the shell
# performs NO expansion of the body at write time. CloudFormation has already
# substituted the placeholders into the body before the instance runs.
touch /etc/cdk_environment
chmod 600 /etc/cdk_environment
cat >> /etc/cdk_environment <<'CDK_ENVIRONMENT_EOF'
#AWS Configuration
AWS_ACCOUNT_ID='${AWS_ACCOUNT_ID}'
AWS_REGION='${AWS_REGION}'

#Blockchain Configuration
BLOCKCHAIN_PROTOCOL='${BLOCKCHAIN_PROTOCOL}'
DEPLOYMENT_MODE='${DEPLOYMENT_MODE}'

#Instance Configuration
INSTANCE_TYPE='${INSTANCE_TYPE}'
CPU_TYPE='${CPU_TYPE}'

#Generic Protocol Configuration
BC_NETWORK='${BC_NETWORK}'
CLIENT_CONFIG='${CLIENT_CONFIG}'
CLIENT_VERSION='${CLIENT_VERSION}'

#Snapshot Configuration
SNAPSHOT_ENABLED='${SNAPSHOT_ENABLED}'
SNAPSHOT_DOWNLOAD_URL='${SNAPSHOT_DOWNLOAD_URL}'
SNAPSHOT_STAGING_VOL_SIZE='${SNAPSHOT_STAGING_VOL_SIZE}'
SNAPSHOT_STAGING_VOL_ID='${SNAPSHOT_STAGING_VOL_ID}'

#Traffic Shaping Configuration
TRAFFIC_SHAPING_ENABLED='${TRAFFIC_SHAPING_ENABLED}'
TRAFFIC_SHAPING_RATE_MBIT='${TRAFFIC_SHAPING_RATE_MBIT}'
TRAFFIC_SHAPING_CHECK_INTERVAL_SEC='${TRAFFIC_SHAPING_CHECK_INTERVAL_SEC}'
TRAFFIC_SHAPING_MAX_BLOCKS_BEHIND='${TRAFFIC_SHAPING_MAX_BLOCKS_BEHIND}'

#Storage Configuration
DATA_VOLUMES_COUNT='${DATA_VOLUMES_COUNT}'

# Flattened Data Volumes Configuration (injected by CDK as KEY='value' lines)
##FLATTENED_DATA_VOLUMES##

# Flattened Custom Variables (injected by CDK as KEY='value' lines)
##FLATTENED_CUSTOM_VARIABLES##

#High Availability Configuration
HA_NUMBER_OF_NODES='${HA_NUMBER_OF_NODES}'
HA_ALB_HEALTHCHECK_PORT='${HA_ALB_HEALTHCHECK_PORT}'
HA_ALB_HEALTHCHECK_PATH='${HA_ALB_HEALTHCHECK_PATH}'
HA_ALB_HEALTHCHECK_GRACE_PERIOD_MIN='${HA_ALB_HEALTHCHECK_GRACE_PERIOD_MIN}'
HA_ALB_HEALTHCHECK_INTERVAL_SEC='${HA_ALB_HEALTHCHECK_INTERVAL_SEC}'
HA_ALB_HEALTHCHECK_TIMEOUT_SEC='${HA_ALB_HEALTHCHECK_TIMEOUT_SEC}'
HA_ALB_HEALTHCHECK_HEALTHY_THRESHOLD='${HA_ALB_HEALTHCHECK_HEALTHY_THRESHOLD}'
HA_ALB_HEALTHCHECK_UNHEALTHY_THRESHOLD='${HA_ALB_HEALTHCHECK_UNHEALTHY_THRESHOLD}'
HA_NODES_HEARTBEAT_DELAY_MIN='${HA_NODES_HEARTBEAT_DELAY_MIN}'
HA_ALB_DEREGISTRATION_DELAY_SEC='${HA_ALB_DEREGISTRATION_DELAY_SEC}'

#CFN and CDK Configuration
STACK_NAME='${STACK_NAME}'
LOGICAL_RESOURCE_ID='${LOGICAL_RESOURCE_ID}'
ASG_NAME='${ASG_NAME}'
LIFECYCLE_HOOK_NAME='${LIFECYCLE_HOOK_NAME}'
COMMON_ASSETS_S3_PATH='${COMMON_ASSETS_S3_PATH}'
PROTOCOL_ASSETS_S3_PATH='${PROTOCOL_ASSETS_S3_PATH}'
CDK_ENVIRONMENT_EOF

# shellcheck source=/dev/null
source /etc/cdk_environment

SCRIPT_NAME="[user-data-ubuntu]"

BOOTSTRAP_ASSETS_PATH="/opt/assets"
PROTOCOL_ASSETS_PATH="/opt/blueprints"
COMMON_ASSETS_PATH="$BOOTSTRAP_ASSETS_PATH/common"

echo "$SCRIPT_NAME Getting instance metadata"
TOKEN=$(curl -s -X PUT "http://169.254.169.254/latest/api/token" -H "X-aws-ec2-metadata-token-ttl-seconds: 21600")
INSTANCE_ID=$(curl -H "X-aws-ec2-metadata-token: $TOKEN" -s http://169.254.169.254/latest/meta-data/instance-id)
ARCH=$(uname -m)

echo "$SCRIPT_NAME Installing basic packages"
while fuser /var/lib/dpkg/lock-frontend >/dev/null 2>&1; do
    sleep 5
done
apt-get -yqq update
apt-get -yqq install jq unzip python3-pip python3-setuptools chrony wget

echo "$SCRIPT_NAME Install CloudFormation helper scripts (cfn-signal, cfn-init, etc.)"
echo "Installing CloudFormation helper scripts..."
pip3 install https://s3.amazonaws.com/cloudformation-examples/aws-cfn-bootstrap-py3-latest.tar.gz --break-system-packages
ln -sf /usr/local/bin/cfn-signal /usr/bin/cfn-signal 2>/dev/null || true
ln -sf /usr/local/bin/cfn-init /usr/bin/cfn-init 2>/dev/null || true
ln -sf /usr/local/bin/cfn-hup /usr/bin/cfn-hup 2>/dev/null || true

echo "$SCRIPT_NAME Setting CloudWatch Agent binary URI based on architecture"
if [ "$ARCH" == "x86_64" ]; then
  CW_AGENT_BINARY_URI=https://s3.amazonaws.com/amazoncloudwatch-agent/ubuntu/amd64/latest/amazon-cloudwatch-agent.deb
else
  CW_AGENT_BINARY_URI=https://s3.amazonaws.com/amazoncloudwatch-agent/ubuntu/arm64/latest/amazon-cloudwatch-agent.deb
fi

echo "$SCRIPT_NAME Installing AWS CLI"
snap install aws-cli --classic

echo "$SCRIPT_NAME Downloading and extracting assets if provided"
if [[ "$COMMON_ASSETS_S3_PATH" != "none" ]]; then
    echo "$SCRIPT_NAME Downloading bootstrap assets zip file"
    cd /opt || exit 1
    aws s3 cp "$COMMON_ASSETS_S3_PATH" ./assets.zip --region "$AWS_REGION"
    unzip -q assets.zip -d $BOOTSTRAP_ASSETS_PATH
fi

if [[ "$PROTOCOL_ASSETS_S3_PATH" != "none" ]]; then
    echo "$SCRIPT_NAME Downloading protocol assets zip file"
    cd /opt || exit 1
    aws s3 cp "$PROTOCOL_ASSETS_S3_PATH" ./blueprints.zip --region "$AWS_REGION"
    unzip -q blueprints.zip -d $PROTOCOL_ASSETS_PATH
fi

echo "$SCRIPT_NAME Installing & configuring CloudWatch Agent"
wget -q $CW_AGENT_BINARY_URI
dpkg -i -E amazon-cloudwatch-agent.deb

echo "$SCRIPT_NAME Configuring CloudWatch Agent with basic config if assets not available"
mkdir -p /opt/aws/amazon-cloudwatch-agent/etc/
if [[ -f "$COMMON_ASSETS_PATH/cw-agent.json" ]]; then
    cp $COMMON_ASSETS_PATH/cw-agent.json /opt/aws/amazon-cloudwatch-agent/etc/custom-amazon-cloudwatch-agent.json
else
    echo "$COMMON_ASSETS_PATH/cw-agent.json does not exist, continue with default config" 
fi

echo "$SCRIPT_NAME Starting CloudWatch Agent"
/opt/aws/amazon-cloudwatch-agent/bin/amazon-cloudwatch-agent-ctl \
-a fetch-config -c file:/opt/aws/amazon-cloudwatch-agent/etc/custom-amazon-cloudwatch-agent.json -m ec2 -s
systemctl restart amazon-cloudwatch-agent

systemctl daemon-reload

echo "$SCRIPT_NAME Signaling CloudFormation completion for Single Node stack"
if [[ "$LOGICAL_RESOURCE_ID" != "none" ]]; then
    echo "Signaling CloudFormation stack completion..."
    cfn-signal --stack "$STACK_NAME" --resource "$LOGICAL_RESOURCE_ID" --region "$AWS_REGION" || {
        echo "cfn-signal failed, trying with full path..."
        /usr/local/bin/cfn-signal --stack "$STACK_NAME" --resource "$LOGICAL_RESOURCE_ID" --region "$AWS_REGION"
    }
fi

echo "$SCRIPT_NAME Createing bcuser for blockchain operations"
groupadd -g 1002 bcuser 2>/dev/null || echo "bcuser group already exists"
useradd -u 1002 -g 1002 -m -s /bin/bash bcuser 2>/dev/null || echo "bcuser already exists"
usermod -aG bcuser bcuser

echo "$SCRIPT_NAME Waiting for EBS volumes to be available before setting up storage"
sleep 60

echo "$SCRIPT_NAME Setting up storage volumes using the universal storage setup script"
if [[ -f "$COMMON_ASSETS_PATH/setup-storage.sh" ]]; then
    $COMMON_ASSETS_PATH/setup-storage.sh
else
    echo "WARNING: $SCRIPT_NAME Universal storage setup script not found, skipping storage setup"
fi

echo "$SCRIPT_NAME Setting up traffic shaping and sync scripts"
# Create directory for traffic shaping scripts
mkdir -p /opt/network

# Copy universal traffic shaping scripts from common assets
if [[ -f "$COMMON_ASSETS_PATH/network/net-rules-start.sh" ]]; then
    cp "$COMMON_ASSETS_PATH/network/net-rules-start.sh" /opt/network/
    chmod +x /opt/network/net-rules-start.sh
else
    echo "WARNING: $SCRIPT_NAME Universal net-rules-start.sh not found in common assets"
fi
    
if [[ -f "$COMMON_ASSETS_PATH/network/net-rules-stop.sh" ]]; then
    cp "$COMMON_ASSETS_PATH/network/net-rules-stop.sh" /opt/network/
    chmod +x /opt/network/net-rules-stop.sh
else
    echo "WARNING: $SCRIPT_NAME Universal net-rules-stop.sh not found in common assets"
fi

    
# Install systemd service for traffic shaping
if [[ -f "$COMMON_ASSETS_PATH/network/net-rules.service" ]]; then
    cp "$COMMON_ASSETS_PATH/network/net-rules.service" /etc/systemd/system/
    systemctl daemon-reload
    systemctl enable net-rules.service
    systemctl start net-rules
else
    echo "WARNING: $SCRIPT_NAME net-rules.service not found in common assets"
fi
    
# Set up systemd timer for syncchecker.sh
if [[ -f "/opt/blueprints/user-data/syncchecker.sh" ]]; then
    echo "Setting up systemd timer for syncchecker.sh..."
    chmod +x /opt/blueprints/user-data/syncchecker.sh 
    # Create systemd service for sync checker
    cat > /etc/systemd/system/syncchecker.service << 'SYNCSERVICE'
[Unit]
Description=Network Traffic Shaping and Sync Checker
After=network-online.target

[Service]
Type=oneshot
ExecStart=/opt/blueprints/user-data/syncchecker.sh
StandardOutput=journal
StandardError=journal
SYNCSERVICE
        
    # Create systemd timer for sync checker
    cat > /etc/systemd/system/syncchecker.timer << SYNCTIMER
[Unit]
Description=Network Traffic Shaping and Sync Checker Timer
Requires=syncchecker.service

[Timer]
OnBootSec=5min
OnUnitActiveSec=${TRAFFIC_SHAPING_CHECK_INTERVAL_SEC}s

[Install]
WantedBy=timers.target
SYNCTIMER
        
    systemctl daemon-reload
    systemctl enable syncchecker.timer
     systemctl start syncchecker.timer
    echo "Systemd timer for syncchecker.sh configured and started"
fi
    
echo "Traffic shaping and Sync Checker setup completed"

echo "$SCRIPT_NAME Signal ASG lifecycle hook completion if in HA mode"
# Signal early — before node.sh which may take hours (e.g. snapshot downloads).
# The instance is ready for ASG; the node software will finish in the background.
if [[ "$LIFECYCLE_HOOK_NAME" != "none" ]]; then
    echo "Signaling ASG lifecycle hook to complete"
    aws autoscaling complete-lifecycle-action \
        --lifecycle-action-result CONTINUE \
        --instance-id "$INSTANCE_ID" \
        --lifecycle-hook-name "$LIFECYCLE_HOOK_NAME" \
        --auto-scaling-group-name "$ASG_NAME" \
        --region "$AWS_REGION"
fi

echo "$SCRIPT_NAME Execute protocol-specific node setup and start"
if [[ -f "$PROTOCOL_ASSETS_PATH/user-data/node.sh" ]]; then
    echo "Starting protocol-specific node setup for ${BLOCKCHAIN_PROTOCOL}"
    chmod +x "$PROTOCOL_ASSETS_PATH/user-data/node.sh"
    if "$PROTOCOL_ASSETS_PATH/user-data/node.sh" "$SNAPSHOT_ENABLED"; then
        echo "$SCRIPT_NAME Node deployment completed successfully"
    else
        echo "$SCRIPT_NAME ERROR: Node deployment FAILED (exit code $?) — check /var/log/cloud-init-output.log and journalctl"
        exit 1
    fi
else
    echo "ERROR: $SCRIPT_NAME Protocol-specific node setup script not found at $PROTOCOL_ASSETS_PATH/user-data/node.sh"
    exit 1
fi
