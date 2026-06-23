#!/bin/bash
# Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
# SPDX-License-Identifier: Apache-2.0

# net-rules-start.sh - Universal traffic shaping script
# Enables outbound bandwidth limiting using nftables and tc (traffic control)
# Excludes internal AWS traffic from rate limiting

set -e

# Source environment variables
if [ -f /etc/cdk_environment ]; then
    source /etc/cdk_environment
fi

# Default rate limit if not specified (in Mbit/s)
RATE_MBIT=${TRAFFIC_SHAPING_RATE_MBIT:-40}

echo "Starting traffic shaping with rate limit: ${RATE_MBIT} Mbit/s"

# Install required packages if not present
if ! command -v nft &> /dev/null; then
    echo "Installing nftables..."
    apt-get update -qq
    apt-get install -y nftables
fi

# Create nftables mangle table for packet marking
echo "Configuring nftables rules..."
nft add table ip mangle 2>/dev/null || true
nft flush table ip mangle 2>/dev/null || true

# Create postrouting chain
# shellcheck disable=SC1083  # the braces are literal nftables rule syntax, not shell brace expansion
nft add chain ip mangle postrouting { type filter hook postrouting priority -150 \; } 2>/dev/null || true

# Mark packets destined for public IPs (exclude internal AWS ranges)
# Exclude: 10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16, 169.254.0.0/16 (link-local)
nft add rule ip mangle postrouting ip daddr != 10.0.0.0/8 ip daddr != 172.16.0.0/12 ip daddr != 192.168.0.0/16 ip daddr != 169.254.0.0/16 mark set 1

# Get the default network interface
DEFAULT_IFACE=$(ip route | grep default | awk '{print $5}' | head -n1)

if [ -z "$DEFAULT_IFACE" ]; then
    echo "Error: Could not determine default network interface"
    exit 1
fi

echo "Configuring traffic control on interface: $DEFAULT_IFACE"

# Remove existing qdisc if present
tc qdisc del dev $DEFAULT_IFACE root 2>/dev/null || true

# Add root qdisc (HTB - Hierarchical Token Bucket)
tc qdisc add dev $DEFAULT_IFACE root handle 1: htb default 12

# Add root class (unlimited)
tc class add dev $DEFAULT_IFACE parent 1: classid 1:1 htb rate 10gbit

# Add class for rate-limited traffic (marked packets)
tc class add dev $DEFAULT_IFACE parent 1:1 classid 1:11 htb rate ${RATE_MBIT}mbit ceil ${RATE_MBIT}mbit

# Add class for unrestricted traffic (unmarked packets - internal AWS traffic)
tc class add dev $DEFAULT_IFACE parent 1:1 classid 1:12 htb rate 10gbit

# Add filter to match marked packets (mark 1) and send to rate-limited class
tc filter add dev $DEFAULT_IFACE parent 1: protocol ip prio 1 handle 1 fw flowid 1:11

echo "Traffic shaping enabled successfully"
echo "  - Rate limit: ${RATE_MBIT} Mbit/s"
echo "  - Interface: $DEFAULT_IFACE"
echo "  - Internal AWS traffic: unrestricted"
echo "  - External traffic: rate limited"
