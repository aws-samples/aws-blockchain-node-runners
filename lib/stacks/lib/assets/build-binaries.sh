#!/bin/sh
source /etc/environment

exec >> /build-binaries.sh.log

# Download
STACKS_REPO="stacks-core"
STACKS_ORG="stacks-network"
START_DIR=$PWD

# Install build dependencies.
sudo yum update
sudo yum -y install clang llvm git

mkdir -p src && cd src

if [ -z "$HOME" ]; then
  # Set $HOME to /root. $HOME isn't set to be /root when this
  # script first runs on the host.
  export HOME="/root"
  echo "HOME is not set. Setting it to /root."
fi

# Install Rust.
echo "Install rustc, cargo and rustfmt."
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y
source $HOME/.cargo/env
rustup component add rustfmt

echo "Verifying we use the latest stable version of Rust"
rustup update

export RUST_STABLE_VERSION=$(rustc --version | awk '{print $2}')

# Get tag for the latest version.
echo "Getting the source for stable version $STACKS_VERSION"
if [[ "$STACKS_VERSION" == "latest" ]]; then
  echo "Aquiring tag for latest stable release."
  VERSION_TAG=$(curl -sL https://api.github.com/repos/$STACKS_ORG/$STACKS_REPO/releases/latest | jq -r .tag_name)
else
  VERSION_TAG=$STACKS_VERSION
fi

echo "Fetching stacks latest code from stacks release $VERSION_TAG"
wget https://github.com/$STACKS_ORG/$STACKS_REPO/archive/refs/tags/$VERSION_TAG.tar.gz
tar -xzvf $VERSION_TAG.tar.gz

SOURCE_DIR="$PWD/$STACKS_REPO-$VERSION_TAG"

# Build relevant source code
cd $SOURCE_DIR
cargo build --features monitoring_prom,slog_json --release --workspace

sudo mkdir -p $START_DIR/bin
find target/release/ -maxdepth 1 -perm /a+x ! -type d -exec cp {} $START_DIR/bin/ \;
