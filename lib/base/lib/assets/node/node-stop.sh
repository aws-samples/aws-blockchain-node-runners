#!/bin/bash
set -e
source /etc/cdk_environment

export NETWORK_ENV=".env.$NETWORK_ID"
export CLIENT=geth

echo "Script is starting client $CLIENT on $NETWORK_ENV"
# Stop the node
cd /home/bcuser/node
docker compose -f /home/bcuser/node/docker-compose.yml down

echo "Stopped"
