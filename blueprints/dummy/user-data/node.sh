#!/bin/bash
# Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
# SPDX-License-Identifier: Apache-2.0

# Dummy Protocol Node Initialization Script (reference implementation)
#
# Installs the configuration selected by CLIENT_CONFIG as the "node" systemd
# service and starts it.
#
# Re-run contract (all blueprints): the framework runs node.sh on first boot
# AND again whenever the configuration changes on redeploy (new CLIENT_CONFIG,
# changed blueprint files, other .env values), against the EXISTING /data and
# with node.service already stopped. node.sh must therefore:
#   - install or replace binaries/config to match the current CLIENT_CONFIG
#   - guard one-time steps (snapshot download, genesis init, key generation)
#     by checking for existing state, and never delete chain data
#   - (re)write node.service and start it; exit non-zero on failure (the
#     framework then retries on the next boot)
#   - touch /data/init-completed once setup has finished

set -euo pipefail

# Load environment variables
source /etc/cdk_environment 2>/dev/null || true

LOG_FILE="/var/log/node.log"

# Logging function
log() {
    echo "[$(date '+%Y-%m-%dT%H:%M:%SZ')] $1" | tee -a "$LOG_FILE"
}

log "Starting Dummy Protocol Node initialization..."
log "BLOCKCHAIN_PROTOCOL: ${BLOCKCHAIN_PROTOCOL:-dummy}"
log "DEPLOYMENT_MODE: ${DEPLOYMENT_MODE:-single-node}"
log "BC_NETWORK: ${BC_NETWORK:-testnet}"
log "CLIENT_CONFIG: ${CLIENT_CONFIG:-dummy-base.sh}"
log "CLIENT_VERSION: ${CLIENT_VERSION:-v1.0.0}"

# Verify configuration script exists
CONFIG_SCRIPT="/opt/blueprints/configurations/${CLIENT_CONFIG}"
if [ ! -f "$CONFIG_SCRIPT" ]; then
    log "ERROR: Configuration script not found: $CONFIG_SCRIPT"
    log "Available configurations:"
    ls -la /opt/blueprints/configurations/ || log "Configurations directory not found"
    exit 1
fi

log "Found configuration script: $CONFIG_SCRIPT"

# Snapshot staging lifecycle debug path.
# When SNAPSHOT_ENABLED=true and SNAPSHOT_STAGING_VOL_SIZE>0, exercise the full
# staging mount -> extract -> cleanup lifecycle (using the real shared helper)
# so the staging_cleanup fix can be validated cheaply. No-op otherwise.
# One-time step: the staging volume is deleted afterwards, so skip on re-runs.
STAGING_DEBUG_SCRIPT="/opt/blueprints/user-data/common/download-snapshot.sh"
STAGING_DEBUG_DONE="/data/.staging-debug-done"
if [ -f "$STAGING_DEBUG_SCRIPT" ] && [ ! -f "$STAGING_DEBUG_DONE" ]; then
    log "Running snapshot staging debug path: $STAGING_DEBUG_SCRIPT"
    chmod +x "$STAGING_DEBUG_SCRIPT"
    if bash "$STAGING_DEBUG_SCRIPT" 2>&1 | tee -a "$LOG_FILE"; then
        log "Snapshot staging debug path finished"
    else
        log "WARNING: Snapshot staging debug path exited non-zero (see STAGING DEBUG lines above)"
    fi
    touch "$STAGING_DEBUG_DONE"
fi

# Install the selected configuration as the service entrypoint (replaced on
# every run so a changed CLIENT_CONFIG takes effect).
mkdir -p /home/bcuser/bin
cp "$CONFIG_SCRIPT" /home/bcuser/bin/start-node.sh
chmod +x /home/bcuser/bin/start-node.sh
log "Configuration script installed: $CLIENT_CONFIG"

# Create systemd service. The dummy runs as root because its configuration
# scripts write to /opt; a real blueprint should run its client as bcuser.
cat > /etc/systemd/system/node.service <<EOF
[Unit]
Description=Dummy Protocol Node Service
After=network-online.target

[Service]
Type=simple
Restart=always
RestartSec=10
EnvironmentFile=/etc/cdk_environment
ExecStart=/home/bcuser/bin/start-node.sh

[Install]
WantedBy=multi-user.target
EOF

# Enable and (re)start the node service
systemctl daemon-reload
systemctl enable node.service
systemctl restart node.service

sleep 5
if ! systemctl is-active --quiet node.service; then
    log "ERROR: node.service is not running"
    journalctl -u node.service --no-pager -n 20 || true
    exit 1
fi

# Mark initialization as complete
touch /data/init-completed

log "Dummy Protocol Node initialization complete"
log "Node is now running and publishing metrics"
