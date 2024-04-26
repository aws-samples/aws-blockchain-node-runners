#!/bin/bash
# Start Juno node
/home/ubuntu/juno-source/build/juno \
    --db-path "/home/ubuntu/juno-source/juno-datadir" \
    --http \
    --http-host 0.0.0.0 \
    --http-port 6060 \
    --network ${_STARKNET_NETWORK_ID_} \
    --eth-node ${_STARKNET_L1_ENDPOINT_}
