#!/bin/bash

source /etc/environment

echo "Install rustc, cargo and rustfmt."
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs > rust-installer.sh
chmod 755 ./rust-installer.sh
./rust-installer.sh -y

export HOME="/root"
source $HOME/.cargo/env
rustup component add rustfmt

echo "Verifying we use the latest stable version of Rust"
rustup update

echo "Getting the source for stable version v$SOLANA_VERSION"
wget https://github.com/anza-xyz/agave/archive/refs/tags/v$SOLANA_VERSION.tar.gz
tar -xzvf v$SOLANA_VERSION.tar.gz
cd agave-$SOLANA_VERSION

echo "Configuring rust version..."
source $PWD/ci/rust-version.sh all

echo "Installing libssl-dev, pkg-config, zlib1g-dev, protobuf etc."
apt-get update
apt-get -y install libssl-dev libudev-dev pkg-config zlib1g-dev llvm clang cmake make libprotobuf-dev protobuf-compiler

echo "Building Solana..."
./scripts/cargo-install-all.sh .

echo "Check agave-validator version"
./bin/agave-validator --version

echo "Modifying path"
mv $PWD/bin/* /home/solana/bin
echo export PATH=/home/solana/bin:$PATH >> /home/solana/.profile