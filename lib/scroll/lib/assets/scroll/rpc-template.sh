#!/bin/bash
# Start rpc node
/home/ubuntu/l2geth-source/build/bin/geth --scroll \
		--datadir "/home/ubuntu/l2geth-source/l2geth-datadir" \
		--gcmode archive --cache.noprefetch \
    --http --http.addr "0.0.0.0" --http.port 8545 --http.api "eth,net,web3,debug,scroll" \
    --l1.endpoint "__L2GETH_L1_ENDPOINT__"
