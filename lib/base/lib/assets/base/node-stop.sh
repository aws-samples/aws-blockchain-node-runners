#!/bin/bash
set -e
echo "Script is stopping the node..."

# Stop the node
cd /home/bcuser/node
/usr/local/bin/docker-compose -f /home/bcuser/node/docker-compose.yml down

echo "Stopped"
