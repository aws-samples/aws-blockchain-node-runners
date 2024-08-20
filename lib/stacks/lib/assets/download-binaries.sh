#!/bin/bash

# shellcheck source=/dev/null
source /etc/environment

# Download
STACKS_REPO="stacks-core"
STACKS_ORG="stacks-network"
START_DIR=$PWD
STACKS_BINARIES_FILE_NAME="source.zip"

# Install build dependencies.
sudo yum update
sudo yum -y install clang llvm git

mkdir -p src && cd src || return

if [ -z "$HOME" ]; then
  # Set $HOME to /root. $HOME isn't set to be /root when this
  # script first runs on the host.
  export HOME="/root"
  echo "HOME is not set. Setting it to /root."
fi

# Get tag for the latest version.
echo "Getting the source for stable version $STACKS_VERSION"
if [ "$STACKS_VERSION" = "latest" ]; then
  echo "Aquiring tag for latest stable release."
  VERSION_TAG=$(curl -sL https://api.github.com/repos/$STACKS_ORG/$STACKS_REPO/releases/latest | jq -r .tag_name)
else
  VERSION_TAG=$STACKS_VERSION
fi

arch=$(uname -m)

echo "Architecture detected: $arch"
echo "Fetching stacks latest code from stacks release $VERSION_TAG and architecture $arch"
if [ "$arch" == "x86_64" ]; then
  wget "https://github.com/$STACKS_ORG/$STACKS_REPO/releases/download/$VERSION_TAG/linux-glibc-x64.zip" -O $STACKS_BINARIES_FILE_NAME
else
  wget "https://github.com/$STACKS_ORG/$STACKS_REPO/releases/download/$VERSION_TAG/linux-glibc-arm64.zip" -O $STACKS_BINARIES_FILE_NAME
fi

unzip ./$STACKS_BINARIES_FILE_NAME -d $START_DIR/bin
