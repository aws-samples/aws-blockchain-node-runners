#!/bin/bash
set -e
echo "Script is starting..."

# Start the node
cd /home/bcuser/node
/usr/local/bin/docker-compose -f /home/bcuser/node/docker-compose.yml up -d

echo "Started"