L2GETH_L1_ENDPOINT="https://nd-bwlgnuhrdvhrlgejyavsja3owu.t.ethereum.managedblockchain.us-east-1.amazonaws.com?billingtoken=4T5NrQcN_UA7_oVVGq4u39kxBppFiJCsudFNcLVtq2"

cd ~
git clone https://github.com/scroll-tech/go-ethereum l2geth-source
cd ~/l2geth-source
git checkout scroll-v5.0.0

# Install Go 1.18 Version
sudo snap info go
sudo snap install go --channel=1.18/stable --classic

# Install build tools and build
sudo apt install build-essential
cd ~/l2geth-source
make nccc_geth
alias l2geth=./build/bin/geth

# Start rpc node
l2geth --scroll \
		--datadir "./l2geth-datadir" \
		--gcmode archive --cache.noprefetch \
    --http --http.addr "0.0.0.0" --http.port 8545 --http.api "eth,net,web3,debug,scroll" \
    --l1.endpoint "$L2GETH_L1_ENDPOINT"