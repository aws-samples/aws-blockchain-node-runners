#!/bin/bash
# Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
# SPDX-License-Identifier: Apache-2.0

# Configure CloudWatch monitoring for Solana node
# Sets up syncchecker.sh as a systemd timer for periodic metrics reporting

set -e

echo "Configuring Solana monitoring..."

# Install syncchecker script
SYNCCHECKER_SRC="/opt/blueprints/user-data/syncchecker.sh"
SYNCCHECKER_DEST="/opt/syncchecker.sh"

if [ -f "$SYNCCHECKER_SRC" ]; then
    cp "$SYNCCHECKER_SRC" "$SYNCCHECKER_DEST"
    chmod +x "$SYNCCHECKER_DEST"
    echo "Syncchecker script installed: $SYNCCHECKER_DEST"
else
    echo "WARNING: Syncchecker script not found at $SYNCCHECKER_SRC"
fi

# Create syncchecker systemd service
cat > /etc/systemd/system/syncchecker.service <<EOF
[Unit]
Description=Solana Sync Checker and Metrics Reporter

[Service]
Type=oneshot
EnvironmentFile=/etc/cdk_environment
ExecStart=/opt/syncchecker.sh
StandardOutput=journal
StandardError=journal
EOF

# Create syncchecker systemd timer (runs every TRAFFIC_SHAPING_CHECK_INTERVAL_SEC seconds)
# Default: every 60 seconds
CHECK_INTERVAL="${TRAFFIC_SHAPING_CHECK_INTERVAL_SEC:-60}"
cat > /etc/systemd/system/syncchecker.timer <<EOF
[Unit]
Description=Solana Sync Checker Timer
Requires=syncchecker.service

[Timer]
OnBootSec=5min
OnUnitActiveSec=${CHECK_INTERVAL}s
Unit=syncchecker.service

[Install]
WantedBy=timers.target
EOF

# Enable and start the timer
systemctl daemon-reload
systemctl enable syncchecker.timer
systemctl start syncchecker.timer

echo "Syncchecker timer started (interval: ${CHECK_INTERVAL}s)"
echo "Solana monitoring configured successfully"
