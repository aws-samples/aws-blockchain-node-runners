#!/bin/bash
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

wget https://github.com/hyperledger/indy-cli-rs/releases/download/v0.1.0/indy-cli-rs-0.1.0-linux-x86_64.tar.gz
tar -xf indy-cli-rs-0.1.0-linux-x86_64.tar.gz