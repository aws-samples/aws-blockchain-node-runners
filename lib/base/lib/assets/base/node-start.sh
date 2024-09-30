#!/bin/bash
set -e
export CLIENT=geth

echo "Script is starting client $CLIENT"
# Start the node
cd /home/bcuser/node
/usr/local/bin/docker-compose -f /home/bcuser/node/docker-compose.yml up -d

echo "Started"
