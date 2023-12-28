#!/bin/bash
set -e
echo "Script is starting..."
# Start rpc node
/home/ec2-user/bsc/geth --config /home/ec2-user/bsc/config.toml \
    --datadir /home/ec2-user/bsc/bsc-datadir --cache 8000 \
    --rpc.allow-unprotected-txs \
    --history.transactions=0 \
    --syncmode=full \
    --pruneancient \
    --tries-verify-mode=local \
    --db.engine=pebble  \
    --http --http.vhosts=* \
    --http.api=admin,eth,web3,txpool,net,debug,engine \
    --http.addr=0.0.0.0

set +e
echo "Script is still running..."