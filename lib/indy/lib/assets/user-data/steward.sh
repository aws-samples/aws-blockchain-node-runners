#!/bin/bash

echo 'network: {config: disabled}' > /etc/cloud/cloud.cfg.d/99-disable-network-config.cfg
echo 800 800 >> /etc/iproute2/rt_tables
echo 801 801 >> /etc/iproute2/rt_tables

gateway_ip=$(ip route | grep -m1 "default via " | cut -d\  -f 3)

client_ip_cidr=$(ip -f inet -o addr show ens5|cut -d\  -f 7)
client_ip=$(ip -f inet -o addr show ens5|cut -d\  -f 7 | cut -d/ -f 1)
client_mac=$(cat `find /sys/devices/ -name ens5`/address)

node_ip_cidr=$(ip -f inet -o addr show ens6|cut -d\  -f 7)
node_ip=$(ip -f inet -o addr show ens6|cut -d\  -f 7 | cut -d/ -f 1)
node_mac=$(cat `find /sys/devices/ -name ens6`/address)

echo "
network:
    ethernets:
        ens5:
            addresses:
                - ${client_ip_cidr}
            gateway4: ${gateway_ip}
            match:
                macaddress: ${client_mac}
            mtu: 1500
            set-name: ens5
            routes:
                - to: 0.0.0.0/0
                  via: ${gateway_ip}
                  table: 800
            routing-policy:
                - from: ${client_ip}
                  table: 800
                  priority: 300
            nameservers:
                addresses:
                    - 8.8.8.8
                    - 8.8.4.4
                    - 1.1.1.1
        ens6:
            addresses:
                - ${node_ip_cidr}
            match:
                macaddress: ${node_mac}
            mtu: 1500
            set-name: ens6
            routes:
                - to: 0.0.0.0/0
                  via: ${gateway_ip}
                  table: 801
            routing-policy:
                - from: ${node_ip}
                  table: 801
                  priority: 300
            nameservers:
                addresses:
                    - 8.8.8.8
                    - 8.8.4.4
                    - 1.1.1.1
    version: 2
" > /etc/netplan/50-cloud-init.yaml

netplan generate
netplan apply

reboot
