#!/bin/bash
set -e
export CLIENT=geth
echo "Script is stopping client $CLIENT"
# Stop the node
cd /home/bcuser/node
/usr/local/bin/docker-compose -f /home/bcuser/node/docker-compose.yml down

echo "Stopped"
