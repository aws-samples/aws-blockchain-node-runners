#!/bin/bash
# Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
# SPDX-License-Identifier: Apache-2.0

# Build and install Frankendancer (hybrid Firedancer/Agave) validator binaries from source
# Usage: build-frankendancer.sh <version>
# Example: build-frankendancer.sh 0.819.30111
# Reference: https://docs.firedancer.io/guide/getting-started.html

set -e

# Must be set before any command that needs HOME (rustup, deps.sh).
# cloud-init and SSM do not set HOME; without it deps.sh exits with
# "HOME: unbound variable" and the build fails silently.
export HOME="/root"

if [ -z "${1:-}" ]; then
    echo "ERROR: No Frankendancer version provided" >&2
    echo "Usage: build-frankendancer.sh <version>" >&2
    echo "Example: build-frankendancer.sh 0.819.30111" >&2
    exit 1
fi

FD_VERSION="$1"
echo "Building Frankendancer v$FD_VERSION..."

# Install build dependencies
# Requires GCC 8.5+, Rust, clang, git, make (per Firedancer docs)
echo "Installing build dependencies..."
apt-get update -qq
apt-get install -y \
    build-essential \
    gcc \
    g++ \
    libssl-dev \
    libclang-dev \
    libudev-dev \
    pkg-config \
    zlib1g-dev \
    llvm \
    clang \
    cmake \
    make \
    git \
    curl \
    wget \
    jq

# Install Rust toolchain (required for Agave components built as part of Frankendancer)
if ! command -v rustc &> /dev/null; then
    echo "Installing Rust toolchain..."
    curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs > /tmp/rust-installer.sh
    chmod 755 /tmp/rust-installer.sh
    /tmp/rust-installer.sh -y
    rm /tmp/rust-installer.sh
fi

source "$HOME/.cargo/env"
rustup component add rustfmt
rustup update

echo "Rust version: $(rustc --version)"
echo "GCC version: $(gcc --version | head -1)"

# Clone and build Frankendancer from source
BUILD_DIR="/tmp/frankendancer-build"
mkdir -p "$BUILD_DIR"
cd "$BUILD_DIR"

echo "Cloning Firedancer repository v$FD_VERSION..."
git clone --recurse-submodules --branch "v${FD_VERSION}" \
    https://github.com/firedancer-io/firedancer.git
cd firedancer

# Install Firedancer-specific dependencies (system packages + compiled libraries under ./opt)
# FD_AUTO_INSTALL_PACKAGES=1 bypasses interactive prompts in deps.sh that would
# hang or exit 127 in non-interactive environments (cloud-init, SSM, CI).
echo "Installing Firedancer dependencies via deps.sh..."
FD_AUTO_INSTALL_PACKAGES=1 ./deps.sh

# Build fdctl and solana binaries
# Note: Requires ~32GiB of available memory per Firedancer docs
echo "Building Frankendancer binaries (this may take 30-60 minutes)..."
make -j"$(nproc)" fdctl solana

echo "Verifying fdctl binary..."
./build/native/gcc/bin/fdctl version || ./build/native/gcc/bin/fdctl --version || true

# Install binaries to bcuser home
echo "Installing binaries to /home/bcuser/bin..."
mkdir -p /home/bcuser/bin
cp ./build/native/gcc/bin/fdctl /home/bcuser/bin/
cp ./build/native/gcc/bin/solana /home/bcuser/bin/
chown -R bcuser:bcuser /home/bcuser/bin
chmod -R 755 /home/bcuser/bin

# Add to PATH for bcuser
if ! grep -q "/home/bcuser/bin" /home/bcuser/.profile 2>/dev/null; then
    echo 'export PATH=/home/bcuser/bin:$PATH' >> /home/bcuser/.profile
fi

# Clean up build directory to free disk space
echo "Cleaning up build directory..."
cd /
rm -rf "$BUILD_DIR"

echo "Frankendancer v$FD_VERSION installed successfully"
ls -la /home/bcuser/bin/fdctl /home/bcuser/bin/solana
