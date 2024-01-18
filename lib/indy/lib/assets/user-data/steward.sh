#!/bin/bash
NETWORK_NAME=sample-network

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

apt-key adv --keyserver keyserver.ubuntu.com --recv-keys 9692C00E657DDE61
apt-key adv --keyserver keyserver.ubuntu.com --recv-keys CE7709D068DB5E88
apt-key adv --keyserver keyserver.ubuntu.com --recv-keys 3BC8C2DD662F1C45 
add-apt-repository "deb https://hyperledger.jfrog.io/artifactory/indy focal rc"
add-apt-repository "deb http://security.ubuntu.com/ubuntu bionic-security main"
add-apt-repository "deb https://repo.sovrin.org/deb bionic master"
add-apt-repository "deb https://sovrin.jfrog.io/artifactory/deb focal rc"
apt-get update -y
apt-get upgrade -y
apt-get install -y \
        rocksdb=5.8.8 \
        libgflags-dev \
        libsnappy-dev \
        zlib1g-dev \
        libbz2-dev \
        liblz4-dev \
        libgflags-dev \
        python3-libnacl=1.6.1 \
        python3-sortedcontainers=1.5.7 \
        python3-ujson=1.33 \
        python3-pyzmq=22.3.0 \
        indy-plenum=1.13.1~rc3 \
        indy-node=1.13.2~rc5 \
        sovtoken=1.1.0~rc0 \
        sovtokenfees=1.1.0~rc0 \
        sovrin=1.2.0~rc1 \
        libssl1.0.0 \
        ursa=0.3.2-1

ln -sv /usr/lib/ursa/* /usr/lib

sed -i "s/NETWORK_NAME = None/NETWORK_NAME = '${NETWORK_NAME}'/" /etc/indy/indy_config.py
sed -i -re "s/(NETWORK_NAME = ')\w+/\1${NETWORK_NAME}/" /etc/indy/indy_config.py

reboot