#!/bin/bash
# Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
# SPDX-License-Identifier: Apache-2.0

# Wait for the local RPC endpoint to become healthy, then create the
# init-completed sentinel file that syncchecker.sh depends on.
#
# Background:
#   Agave creates this file natively via --init-complete-file.
#   fdctl (Frankendancer) has no equivalent flag, so we poll getHealth.
#
# Usage (from a configuration script, before the blocking exec):
#   /opt/blueprints/user-data/common/wait-for-rpc.sh &
#   exec /home/bcuser/bin/fdctl run --config "$CONFIG_FILE"
#
# The script is meant to be backgrounded. It polls every 10 seconds for
# up to 2 hours (720 iterations), then exits with an error log if the
# RPC never became healthy.

set -euo pipefail

# Resolve the instance's private IP from EC2 metadata (IMDSv2).
# Both Agave and Frankendancer bind RPC to the private IP, not loopback,
# so 127.0.0.1 would get connection refused.
# Falls back to 127.0.0.1 if metadata is unavailable (e.g., local testing).
_TOKEN=$(curl -s -X PUT "http://169.254.169.254/latest/api/token" \
    -H "X-aws-ec2-metadata-token-ttl-seconds: 21600" 2>/dev/null || echo "")
if [ -n "$_TOKEN" ]; then
    _PRIVATE_IP=$(curl -H "X-aws-ec2-metadata-token: $_TOKEN" -s \
        http://169.254.169.254/latest/meta-data/local-ipv4 2>/dev/null || echo "127.0.0.1")
else
    _PRIVATE_IP="127.0.0.1"
fi

RPC_URL="${1:-http://${_PRIVATE_IP}:8899}"
INIT_COMPLETED_FILE="${2:-/data/data/init-completed}"
MAX_ATTEMPTS=720
POLL_INTERVAL=10

echo "Waiting for RPC at $RPC_URL to become healthy..."

for _ in $(seq 1 "$MAX_ATTEMPTS"); do
    if curl -sf -X POST -H "Content-Type: application/json" \
        -d '{"jsonrpc":"2.0","id":1,"method":"getHealth"}' \
        "$RPC_URL" 2>/dev/null | grep -q '"result"'; then
        touch "$INIT_COMPLETED_FILE"
        echo "RPC is up — created $INIT_COMPLETED_FILE"
        exit 0
    fi
    sleep "$POLL_INTERVAL"
done

echo "ERROR: RPC at $RPC_URL did not become healthy within $(( MAX_ATTEMPTS * POLL_INTERVAL / 3600 )) hours. $INIT_COMPLETED_FILE was NOT created. syncchecker metrics and traffic shaping will remain inactive. Check 'journalctl -u node.service' for validator errors."
exit 1
