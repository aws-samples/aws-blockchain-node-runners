#!/bin/bash

# Add input as command line parameters for name of the directory to mount
if [ -n "$1" ]; then
  LIMIT_OUT_TRAFFIC_MBPS=$1
else
  echo "Warning: Specify max value for outbound data traffic in Mbps."
  echo "Usage: net-rules.sh <max_bandwidth_mbps>"
  echo "Default is 26"
  LIMIT_OUT_TRAFFIC_MBPS=26
fi

# Step 1: Create an iptables rule to mark packets going to public IPs
# Create a new chain for our marking rules
iptables -t mangle -N MARKING

# Add rules to return (skip marking) for private IP ranges
iptables -t mangle -A MARKING -d 10.0.0.0/8 -j RETURN
iptables -t mangle -A MARKING -d 172.16.0.0/12 -j RETURN
iptables -t mangle -A MARKING -d 192.168.0.0/16 -j RETURN
iptables -t mangle -A MARKING -d 169.254.0.0/16 -j RETURN

# Mark remaining traffic (public IPs)
iptables -t mangle -A MARKING -j MARK --set-mark 1

# Jump to our MARKING chain from OUTPUT
iptables -t mangle -A OUTPUT -j MARKING

# Step 2: Set up tc with filter for marked packets
INTERFACE=$(ip -br addr show | grep -v '^lo' | awk '{print $1}' | head -n1)

tc qdisc add dev $INTERFACE root handle 1: prio

# Step 3: Add the tbf filter for marked packets
tc filter add dev $INTERFACE parent 1: protocol ip handle 1 fw flowid 1:1
tc qdisc add dev $INTERFACE parent 1:1 tbf rate "${LIMIT_OUT_TRAFFIC_MBPS}mbit" burst 20kb latency 50ms
