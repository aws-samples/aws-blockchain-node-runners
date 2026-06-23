#!/bin/bash
# Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
# SPDX-License-Identifier: Apache-2.0

# net-rules-stop.sh - Universal traffic shaping cleanup script
# Removes all traffic shaping rules and restores unrestricted network traffic

set -e

echo "Stopping traffic shaping..."

# Get the default network interface
DEFAULT_IFACE=$(ip route | grep default | awk '{print $5}' | head -n1)

if [ -z "$DEFAULT_IFACE" ]; then
    echo "Warning: Could not determine default network interface"
else
    echo "Removing traffic control rules from interface: $DEFAULT_IFACE"
    
    # Remove tc qdisc (this removes all classes and filters)
    tc qdisc del dev $DEFAULT_IFACE root 2>/dev/null || true
    
    echo "Traffic control rules removed from $DEFAULT_IFACE"
fi

# Remove nftables mangle table
echo "Removing nftables rules..."
nft delete table ip mangle 2>/dev/null || true

echo "Traffic shaping disabled successfully"
echo "  - All rate limits removed"
echo "  - Network traffic unrestricted"
