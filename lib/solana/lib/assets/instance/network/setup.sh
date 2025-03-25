#!/bin/bash

# Add input as command line parameters for name of the directory to mount
if [ -n "$1" ]; then
  LIMIT_OUT_TRAFFIC_MBPS=$1
else
  echo "Warning: Specify max value for outbound data traffic in Mbps."
  echo "Usage: instance/network/setup.sh <max_bandwidth_mbps>"
  exit 1;
fi

INTERFACE=$(ip -br addr show | grep -v '^lo' | awk '{print $1}' | head -n1)
NET_SCRIPTS_PATH="/opt/instance/network"

# Replace _LIMIT_OUT_TRAFFIC_MBPS_ with the value of LIMIT_OUT_TRAFFIC_MBPS in file /opt/network/net-rules.service.template
sed -i "s/_LIMIT_OUT_TRAFFIC_MBPS_/${LIMIT_OUT_TRAFFIC_MBPS}/g" $NET_SCRIPTS_PATH/net-rules.service
sed -i "s/_INTERFACE_/${INTERFACE}/g" $NET_SCRIPTS_PATH/net-rules.service

# Copy the file $NET_SCRIPTS_PATH/net-rules.service to /etc/systemd/system/net-rules.service
cp $NET_SCRIPTS_PATH/net-rules.service /etc/systemd/system/net-rules.service

echo "Enabling net rules service"
systemctl enable net-rules.service

echo "Setting up sync-checker service"
mv $NET_SCRIPTS_PATH/net-sync-checker.service /etc/systemd/system/net-sync-checker.service

# Run every 5 minutes
echo "Setting up sync-checker timer"
mv $NET_SCRIPTS_PATH/net-sync-checker.timer /etc/systemd/system/net-sync-checker.timer

echo "Starting net sync checker timer"
systemctl start net-sync-checker.timer
systemctl enable net-sync-checker.timer
