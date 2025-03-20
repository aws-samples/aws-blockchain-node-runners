#!/bin/bash

# Remove tc rules
/usr/sbin/tc qdisc del dev eth0 root

# Remove iptables rules
/usr/sbin/iptables -t mangle -D OUTPUT -j MARKING
/usr/sbin/iptables -t mangle -F MARKING
/usr/sbin/iptables -t mangle -X MARKING

exit 0;