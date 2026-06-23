#!/bin/bash
# Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
# SPDX-License-Identifier: Apache-2.0

# Build and install Agave (Solana) validator binaries from source
# Usage: build-solana.sh <version>
# Example: build-solana.sh 2.3.7

set -e

if [ -z "${1:-}" ]; then
    echo "ERROR: No Agave version provided"
    echo "Usage: build-solana.sh <version>"
    echo "Example: build-solana.sh 2.3.7"
    exit 1
fi

AGAVE_VERSION="$1"
echo "Building Agave validator v$AGAVE_VERSION..."

# Install build dependencies
echo "Installing build dependencies..."
apt-get update -qq
apt-get install -y \
    build-essential \
    libssl-dev \
    libclang-dev \
    libudev-dev \
    pkg-config \
    zlib1g-dev \
    llvm \
    clang \
    cmake \
    make \
    libprotobuf-dev \
    protobuf-compiler \
    curl \
    wget \
    jq

# Install Rust toolchain
if ! command -v rustc &> /dev/null; then
    echo "Installing Rust toolchain..."
    curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs > /tmp/rust-installer.sh
    chmod 755 /tmp/rust-installer.sh
    /tmp/rust-installer.sh -y
    rm /tmp/rust-installer.sh
fi

export HOME="/root"
source "$HOME/.cargo/env"
rustup component add rustfmt
rustup update

echo "Rust version: $(rustc --version)"

# Download and build Agave from source
BUILD_DIR="/tmp/agave-build"
mkdir -p "$BUILD_DIR"
cd "$BUILD_DIR"

echo "Downloading Agave source v$AGAVE_VERSION..."
wget -q "https://github.com/anza-xyz/agave/archive/refs/tags/v${AGAVE_VERSION}.tar.gz"
tar -xzf "v${AGAVE_VERSION}.tar.gz"
cd "agave-${AGAVE_VERSION}"

echo "Configuring Rust version for Agave..."
source "$PWD/ci/rust-version.sh" all 2>/dev/null || true

echo "Building Agave binaries (this may take 30-60 minutes)..."
./scripts/cargo-install-all.sh .

echo "Verifying agave-validator binary..."
./bin/agave-validator --version

# Install binaries to bcuser home
echo "Installing binaries to /home/bcuser/bin..."
mkdir -p /home/bcuser/bin
# Copy only regular files (not subdirectories like deps/, perf-libs/, platform-tools-sdk/)
find "$BUILD_DIR/agave-${AGAVE_VERSION}/bin/" -maxdepth 1 -type f -executable -exec cp {} /home/bcuser/bin/ \;
chown -R bcuser:bcuser /home/bcuser/bin
chmod -R 755 /home/bcuser/bin

# Add to PATH for bcuser
if ! grep -q "/home/bcuser/bin" /home/bcuser/.profile 2>/dev/null; then
    echo 'export PATH=/home/bcuser/bin:$PATH' >> /home/bcuser/.profile
fi

# Clean up build directory to free disk space
echo "Cleaning up build directory..."
rm -rf "$BUILD_DIR"

echo "Agave v$AGAVE_VERSION installed successfully"
/home/bcuser/bin/agave-validator --version
