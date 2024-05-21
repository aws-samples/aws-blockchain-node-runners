#!/bin/bash
set -e
echo "Script is starting..."
# Start rpc node
octez-node run --data-dir /var/tezos/node --rpc-addr 127.0.0.1

set +e
echo "Script is still running..."
