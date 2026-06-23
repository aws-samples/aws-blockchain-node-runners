#!/bin/bash
# Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
# SPDX-License-Identifier: Apache-2.0

# Dummy Protocol Node Initialization Script
# This script performs generic node setup and then calls the configuration-specific script

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
STAGING_DEBUG_SCRIPT="/opt/blueprints/user-data/common/download-snapshot.sh"
if [ -f "$STAGING_DEBUG_SCRIPT" ]; then
    log "Running snapshot staging debug path: $STAGING_DEBUG_SCRIPT"
    chmod +x "$STAGING_DEBUG_SCRIPT"
    if bash "$STAGING_DEBUG_SCRIPT" 2>&1 | tee -a "$LOG_FILE"; then
        log "Snapshot staging debug path finished"
    else
        log "WARNING: Snapshot staging debug path exited non-zero (see STAGING DEBUG lines above)"
    fi
fi

# Make configuration script executable
chmod +x "$CONFIG_SCRIPT"

# Execute configuration-specific setup
log "Executing configuration script: $CLIENT_CONFIG"
if "$CONFIG_SCRIPT"; then
    log "Configuration script completed successfully"
else
    log "ERROR: Configuration script failed with exit code $?"
    exit 1
fi

log "Dummy Protocol Node initialization complete"
log "Node is now running and publishing metrics"

# Keep the script running (for systemd service if needed)
wait
