#!/bin/bash
set -e

source /etc/cdk_environment

export NETWORK_ENV=".env.$NETWORK_ID"
export CLIENT="$BASE_CLIENT"
export HOST_DATA_DIR="/data"

echo "Script is starting client $CLIENT on $NETWORK_ENV"
# Start the node
cd /home/bcuser/node
docker compose -f /home/bcuser/node/docker-compose.yml up -d

echo "Started"
