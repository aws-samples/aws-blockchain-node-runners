#!/bin/bash

source /etc/environment

echo "Install rustc, cargo and rustfmt."
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs > rust-installer.sh
chmod 755 ./rust-installer.sh
./rust-installer.sh -q -y
source $HOME/.cargo/env
rustup component add rustfmt

echo "Verifying we use the latest stable version of Rust"
rustup update

export RUST_STABLE_VERSION=$(rustc --version | awk '{print $2}')

echo "Installing libssl-dev, pkg-config, zlib1g-dev, protobuf etc."
apt-get update
apt-get -y install libssl-dev libudev-dev pkg-config zlib1g-dev llvm clang cmake make libprotobuf-dev protobuf-compiler

echo "Getting the source for stable version v$SOLANA_VERSION"
wget https://github.com/solana-labs/solana/archive/refs/tags/v$SOLANA_VERSION.tar.gz
tar -xzvf v$SOLANA_VERSION.tar.gz
cd solana-$SOLANA_VERSION

echo "Building Solana..."
./scripts/cargo-install-all.sh --validator-only .

echo "Check solana-validator version"

./bin/solana-validator --version

echo "Modifying path"
echo export PATH=$PWD/bin:$PATH >> /home/ssm-user/.profile
source /home/ssm-user/.profile