#!/bin/bash

# Check if all three parameters are provided
if [ "$#" -ne 1 ]; then
    echo "Usage: bash [NETWORK]"
    echo "Supported networks: mainnet, mumbai"
    exit 1
fi

# Assign parameters to variables
NETWORK="$1"

# Use the variables in the rest of the script
echo "NETWORK: $NETWORK"

case $NETWORK in
  "mainnet")
    echo "Setting up mainnet..."
    HEIMDALL_SEEDS="1500161dd491b67fb1ac81868952be49e2509c9f@52.78.36.216:26656,dd4a3f1750af5765266231b9d8ac764599921736@3.36.224.80:26656,8ea4f592ad6cc38d7532aff418d1fb97052463af@34.240.245.39:26656,e772e1fb8c3492a9570a377a5eafdb1dc53cd778@54.194.245.5:26656,6726b826df45ac8e9afb4bdb2469c7771bd797f1@52.209.21.164:26656"
    ;;
  "mumbai")
    echo "Setting up mumbai..."
    HEIMDALL_SEEDS="9df7ae4bf9b996c0e3436ed4cd3050dbc5742a28@43.200.206.40:26656,d9275750bc877b0276c374307f0fd7eae1d71e35@54.216.248.9:26656,1a3258eb2b69b235d4749cf9266a94567d6c0199@52.214.83.78:26656"
    ;;
  *)
    echo "Network is not found. Defaulting to mainnet."
    HEIMDALL_SEEDS="1500161dd491b67fb1ac81868952be49e2509c9f@52.78.36.216:26656,dd4a3f1750af5765266231b9d8ac764599921736@3.36.224.80:26656,8ea4f592ad6cc38d7532aff418d1fb97052463af@34.240.245.39:26656,e772e1fb8c3492a9570a377a5eafdb1dc53cd778@54.194.245.5:26656,6726b826df45ac8e9afb4bdb2469c7771bd797f1@52.209.21.164:26656"
    ;;
esac

echo "Init heimdall environment"
docker run -v /data/polygon/heimdall:/heimdall-home:rw --entrypoint /usr/bin/heimdalld -it 0xpolygon/heimdall:1.0.3 init --home=/heimdall-home

echo "A custom human readable name for this node"
export NODE_NAME="awsnode$RANDOM"
sed -i "s/moniker = .*/moniker = \"$NODE_NAME\"/" /data/polygon/heimdall/config/config.toml

echo "TCP or UNIX socket address for the RPC server to listen on"
sed -i '/^\[rpc\]$/,/^\[/ { /laddr =/ { s#laddr = .*#laddr = "tcp://0.0.0.0:26657"#; :a;n;ba } }' /data/polygon/heimdall/config/config.toml

echo "Comma separated list of seed nodes to connect to"
sed -i "s#^seeds = .*#seeds = \"$HEIMDALL_SEEDS\"#" /data/polygon/heimdall/config/config.toml

echo "RPC endpoint for ethereum chain"
sed -i 's#^eth_rpc_url = .*#eth_rpc_url = "https://ethereum.publicnode.com"#' /data/polygon/heimdall/config/heimdall-config.toml

echo "RPC endpoint for bor chain"
sed -i 's#^bor_rpc_url = .*#bor_rpc_url = "http://execution:8545"#' /data/polygon/heimdall/config/heimdall-config.toml

echo "Download the correct genesis file"
sudo curl -o /data/heimdall/config/genesis.json https://raw.githubusercontent.com/maticnetwork/heimdall/master/builder/files/genesis-mainnet-v1.json
