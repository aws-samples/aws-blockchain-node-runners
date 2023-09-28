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
    BOOTNODE='"enode://b8f1cc9c5d4403703fbf377116469667d2b1823c0daf16b7250aa576bacf399e42c3930ccfcb02c5df6879565a2b8931335565f0e8d3f8e72385ecf4a4bf160a@3.36.224.80:30303", "enode://8729e0c825f3d9cad382555f3e46dcff21af323e89025a0e6312df541f4a9e73abfa562d64906f5e59c51fe6f0501b3e61b07979606c56329c020ed739910759@54.194.245.5:30303"'
    ;;
  "mumbai")
    echo "Setting up mumbai..."
    HEIMDALL_SEEDS="9df7ae4bf9b996c0e3436ed4cd3050dbc5742a28@43.200.206.40:26656,d9275750bc877b0276c374307f0fd7eae1d71e35@54.216.248.9:26656,1a3258eb2b69b235d4749cf9266a94567d6c0199@52.214.83.78:26656"
    BOOTNODE='"enode://bdcd4786a616a853b8a041f53496d853c68d99d54ff305615cd91c03cd56895e0a7f6e9f35dbf89131044e2114a9a782b792b5661e3aff07faf125a98606a071@43.200.206.40:30303", "enode://209aaf7ed549cf4a5700fd833da25413f80a1248bd3aa7fe2a87203e3f7b236dd729579e5c8df61c97bf508281bae4969d6de76a7393bcbd04a0af70270333b3@54.216.248.9:30303"'
    ;;
  *)
    echo "Network is not found. Defaulting to mainnet."
    HEIMDALL_SEEDS="1500161dd491b67fb1ac81868952be49e2509c9f@52.78.36.216:26656,dd4a3f1750af5765266231b9d8ac764599921736@3.36.224.80:26656,8ea4f592ad6cc38d7532aff418d1fb97052463af@34.240.245.39:26656,e772e1fb8c3492a9570a377a5eafdb1dc53cd778@54.194.245.5:26656,6726b826df45ac8e9afb4bdb2469c7771bd797f1@52.209.21.164:26656"
    BOOTNODE='"enode://b8f1cc9c5d4403703fbf377116469667d2b1823c0daf16b7250aa576bacf399e42c3930ccfcb02c5df6879565a2b8931335565f0e8d3f8e72385ecf4a4bf160a@3.36.224.80:30303", "enode://8729e0c825f3d9cad382555f3e46dcff21af323e89025a0e6312df541f4a9e73abfa562d64906f5e59c51fe6f0501b3e61b07979606c56329c020ed739910759@54.194.245.5:30303"'
    ;;
esac

echo "Init heimdall environment"
docker run -v /data/polygon/heimdall:/heimdall-home:rw --entrypoint /usr/bin/heimdalld -it 0xpolygon/heimdall:0.3.4 init --home=/heimdall-home

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
sed -i 's#^bor_rpc_url = .*#bor_rpc_url = "http://bor:8545"#' /data/polygon/heimdall/config/heimdall-config.toml

echo "Download the correct genesis file"
sudo curl -o /data/heimdall/config/genesis.json https://raw.githubusercontent.com/maticnetwork/heimdall/master/builder/files/genesis-mainnet-v1.json


echo "Init Bor environment"
echo "Download the correct genesis file"
sudo curl -o /data/polygon/bor/genesis.json 'https://raw.githubusercontent.com/maticnetwork/bor/master/builder/files/genesis-mainnet-v1.json'

echo "Create a default config file for starting Bor"
mkdir -p /data/polygon/bor
docker run -it 0xpolygon/bor:0.4.0 dumpconfig > /data/polygon/bor/config.toml

echo "Setting this to the location of a mount that we ll make"
sed -i 's#^datadir =.*#datadir = "/bor-home"#' /data/polygon/bor/config.toml

echo "We ll want to specify some boot nodes"
sed -i "s|bootnodes = \[.*|bootnodes = [$BOOTNODE]|" /data/polygon/bor/config.toml

echo "Because we re running inside docker, we ll likely need to change the way we connect to heimdall"
sed -i 's|url = .*|url = "http://heimdallrest:1317"|' /data/polygon/bor/config.toml

echo "Assumming you want to access the RPC, you ll need to make a change here as well"
sed -i '0,/enabled = false/s//enabled = true/' /data/polygon/bor/config.toml
sed -i '0,/host = / s/host = .*/host = "0.0.0.0"/' /data/polygon/bor/config.toml
