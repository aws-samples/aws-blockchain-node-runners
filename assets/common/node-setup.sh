#!/bin/bash
# Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
# SPDX-License-Identifier: Apache-2.0

# node-setup.sh - full node setup, run by the user-data bootstrap
# (user-data-ubuntu.sh) whenever its gate decides setup must be (re-)applied:
# first boot, an interrupted setup, a changed configuration or asset, or
# missing data mounts. Kept out of user data to stay under the 16 KB limit.
#
# Usage: node-setup.sh <reapply: "true" if a previous setup completed>
# Expects /etc/cdk_environment (rewritten by the bootstrap) and fresh assets
# in /opt/assets and /opt/blueprints. Exits non-zero if setup failed, so the
# bootstrap does not record success and retries on the next boot.

set +e

SCRIPT_NAME="[node-setup]"
STATE_DIR="${STATE_DIR:-/var/lib/node-runner}"
CDK_ENV_FILE="${CDK_ENV_FILE:-/etc/cdk_environment}"
COMMON_ASSETS_PATH="${COMMON_ASSETS_PATH:-/opt/assets/common}"
PROTOCOL_ASSETS_PATH="${PROTOCOL_ASSETS_PATH:-/opt/blueprints}"

# shellcheck source=/dev/null
source "$CDK_ENV_FILE"

setup_cloudwatch_agent() {
    echo "$SCRIPT_NAME Installing & configuring CloudWatch Agent"
    local deb_arch=arm64
    [[ "$(uname -m)" == "x86_64" ]] && deb_arch=amd64
    wget -q -O /opt/amazon-cloudwatch-agent.deb \
        "https://s3.amazonaws.com/amazoncloudwatch-agent/ubuntu/$deb_arch/latest/amazon-cloudwatch-agent.deb"
    dpkg -i -E /opt/amazon-cloudwatch-agent.deb

    mkdir -p /opt/aws/amazon-cloudwatch-agent/etc/
    if [[ -f "$COMMON_ASSETS_PATH/cw-agent.json" ]]; then
        cp "$COMMON_ASSETS_PATH/cw-agent.json" /opt/aws/amazon-cloudwatch-agent/etc/custom-amazon-cloudwatch-agent.json
    else
        echo "$COMMON_ASSETS_PATH/cw-agent.json does not exist, continue with default config"
    fi
    /opt/aws/amazon-cloudwatch-agent/bin/amazon-cloudwatch-agent-ctl \
        -a fetch-config -c file:/opt/aws/amazon-cloudwatch-agent/etc/custom-amazon-cloudwatch-agent.json -m ec2 -s
    systemctl restart amazon-cloudwatch-agent
    systemctl daemon-reload
}

setup_traffic_shaping_and_syncchecker() {
    echo "$SCRIPT_NAME Setting up traffic shaping and sync scripts"
    mkdir -p /opt/network
    local f
    for f in net-rules-start.sh net-rules-stop.sh; do
        if [[ -f "$COMMON_ASSETS_PATH/network/$f" ]]; then
            cp "$COMMON_ASSETS_PATH/network/$f" /opt/network/
            chmod +x "/opt/network/$f"
        else
            echo "WARNING: $SCRIPT_NAME Universal $f not found in common assets"
        fi
    done

    if [[ -f "$COMMON_ASSETS_PATH/network/net-rules.service" ]]; then
        cp "$COMMON_ASSETS_PATH/network/net-rules.service" /etc/systemd/system/
        systemctl daemon-reload
        systemctl enable net-rules.service
        # restart, not start: a re-run must apply a changed rate limit
        systemctl restart net-rules
    else
        echo "WARNING: $SCRIPT_NAME net-rules.service not found in common assets"
    fi

    if [[ -f "$PROTOCOL_ASSETS_PATH/user-data/syncchecker.sh" ]]; then
        echo "Setting up systemd timer for syncchecker.sh..."
        chmod +x "$PROTOCOL_ASSETS_PATH/user-data/syncchecker.sh"
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

        cat > /etc/systemd/system/syncchecker.timer << SYNCTIMER
[Unit]
Description=Network Traffic Shaping and Sync Checker Timer
Requires=syncchecker.service

[Timer]
OnBootSec=5min
OnUnitActiveSec=${TRAFFIC_SHAPING_CHECK_INTERVAL_SEC:-60}s

[Install]
WantedBy=timers.target
SYNCTIMER

        systemctl daemon-reload
        systemctl enable syncchecker.timer
        systemctl restart syncchecker.timer
        echo "Systemd timer for syncchecker.sh configured and started"
    fi
    echo "Traffic shaping and Sync Checker setup completed"
}

# Full setup. $1 = "true" when a previous setup completed on this instance.
apply_setup() {
    local reapply=$1 instance_id token
    token=$(curl -s -X PUT "http://169.254.169.254/latest/api/token" -H "X-aws-ec2-metadata-token-ttl-seconds: 21600")
    instance_id=$(curl -s -H "X-aws-ec2-metadata-token: $token" http://169.254.169.254/latest/meta-data/instance-id)

    setup_cloudwatch_agent

    # CreationPolicy only waits for a signal while the instance is being
    # created, so signal once per instance (an interrupted first boot retries).
    if [[ "$LOGICAL_RESOURCE_ID" != "none" && ! -f "$STATE_DIR/cfn-signalled" ]]; then
        echo "$SCRIPT_NAME Signaling CloudFormation completion for Single Node stack"
        if cfn-signal --stack "$STACK_NAME" --resource "$LOGICAL_RESOURCE_ID" --region "$AWS_REGION" \
            || /usr/local/bin/cfn-signal --stack "$STACK_NAME" --resource "$LOGICAL_RESOURCE_ID" --region "$AWS_REGION"; then
            touch "$STATE_DIR/cfn-signalled"
        fi
    fi

    echo "$SCRIPT_NAME Creating bcuser for blockchain operations"
    groupadd -g 1002 bcuser 2>/dev/null || echo "bcuser group already exists"
    useradd -u 1002 -g 1002 -m -s /bin/bash bcuser 2>/dev/null || echo "bcuser already exists"
    usermod -aG bcuser bcuser

    if [[ "$reapply" != "true" ]]; then
        echo "$SCRIPT_NAME Waiting for EBS volumes to be available before setting up storage"
        sleep 60
    fi

    echo "$SCRIPT_NAME Setting up storage volumes using the universal storage setup script"
    if [[ -f "$COMMON_ASSETS_PATH/setup-storage.sh" ]]; then
        if ! "$COMMON_ASSETS_PATH/setup-storage.sh" && [[ "$reapply" == "true" ]]; then
            # Never run the node against the root volume on a re-run.
            echo "$SCRIPT_NAME ERROR: storage setup failed during re-apply, not re-running node setup"
            return 1
        fi
    else
        echo "WARNING: $SCRIPT_NAME Universal storage setup script not found, skipping storage setup"
    fi

    setup_traffic_shaping_and_syncchecker

    # Signal early - before node.sh which may take hours (e.g. snapshot downloads).
    if [[ "$LIFECYCLE_HOOK_NAME" != "none" ]]; then
        echo "$SCRIPT_NAME Signaling ASG lifecycle hook to complete"
        aws autoscaling complete-lifecycle-action \
            --lifecycle-action-result CONTINUE \
            --instance-id "$instance_id" \
            --lifecycle-hook-name "$LIFECYCLE_HOOK_NAME" \
            --auto-scaling-group-name "$ASG_NAME" \
            --region "$AWS_REGION"
    fi

    if [[ ! -f "$PROTOCOL_ASSETS_PATH/user-data/node.sh" ]]; then
        echo "ERROR: $SCRIPT_NAME Protocol-specific node setup script not found at $PROTOCOL_ASSETS_PATH/user-data/node.sh"
        return 1
    fi

    # Blueprint re-run contract: node.sh runs with node.service stopped, so it
    # can replace binaries and config, and it starts node.service itself.
    if systemctl cat node.service >/dev/null 2>&1; then
        echo "$SCRIPT_NAME Stopping node.service before node setup"
        systemctl stop node.service
    fi

    echo "$SCRIPT_NAME Execute protocol-specific node setup and start for $BLOCKCHAIN_PROTOCOL"
    chmod +x "$PROTOCOL_ASSETS_PATH/user-data/node.sh"
    "$PROTOCOL_ASSETS_PATH/user-data/node.sh" "$SNAPSHOT_ENABLED"
}

# NODE_RUNNER_SOURCE_ONLY=1 lets unit tests load the functions without running.
if [[ "${NODE_RUNNER_SOURCE_ONLY:-}" != "1" ]]; then
    apply_setup "$1"
    exit $?
fi
