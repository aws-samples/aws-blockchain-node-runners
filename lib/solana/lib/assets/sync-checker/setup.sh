#!/bin/bash

if [ -n "$1" ]; then
  export SYNC_CHECKER_SCRIPT=$1
else
  echo "No path to syncchecker script is provided"
  echo "Usage: sync-checker/setup.sh <path_to_synchcekcer_script>"
  echo "Using default: /opt/sync-checker/syncchecker.sh"
  export SYNC_CHECKER_SCRIPT="/opt/sync-checker/syncchecker.sh"
fi

echo "Configuring syncchecker script"
mv $SYNC_CHECKER_SCRIPT /opt/syncchecker.sh
chmod +x /opt/syncchecker.sh

echo "Setting up sync-checker service"
mv /opt/sync-checker/sync-checker.service /etc/systemd/system/sync-checker.service

# Run every 5 minutes
echo "Setting up sync-checker timer"
mv /opt/sync-checker/sync-checker.timer /etc/systemd/system/sync-checker.timer

echo "Starting sync checker timer"
systemctl start sync-checker.timer
systemctl enable sync-checker.timer