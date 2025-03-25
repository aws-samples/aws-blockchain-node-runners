#!/bin/bash

INTERFACE=$(ip -br addr show | grep -v '^lo' | awk '{print $1}' | head -n1)

# Remove tc rules
/usr/sbin/tc qdisc del dev $INTERFACE root

# Remove iptables rules
/usr/sbin/iptables -t mangle -D OUTPUT -j MARKING
/usr/sbin/iptables -t mangle -F MARKING
/usr/sbin/iptables -t mangle -X MARKING

exit 0;
