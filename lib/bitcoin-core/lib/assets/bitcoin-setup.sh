#!/bin/bash
# This script is used to set up a mainnet Bitcoin Core node on an Amazon Linux 2 instance.
yum update -y
amazon-linux-extras install docker -y
service docker start
mkdir -p /home/bitcoin/.bitcoin
echo "${BITCOIN_CONF}" > /home/bitcoin/.bitcoin/bitcoin.conf
docker run -d --name bitcoind -v /home/bitcoin/.bitcoin:/root/.bitcoin -p 8333:8333 -p 8332:8332 bitcoin/bitcoin:latest bash -c "chown -R bitcoin:bitcoin /root/.bitcoin && bitcoind"
