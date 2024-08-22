#!/bin/bash

set -e  # Exit immediately if a command exits with a non-zero status

sudo apt-get install -y libpq-dev

# Stop fullnode
sudo systemctl stop suid || true  # Continue even if suid is not running

# Create a sui-tool folder and switch to it
mkdir -p ~/sui-tool
cd ~/sui-tool

# Downloading sui-tool
wget https://github.com/MystenLabs/sui/releases/download/mainnet-v1.27.4/sui-mainnet-v1.27.4-ubuntu-x86_64.tgz
tar -xvzf sui-mainnet-v1.27.4-ubuntu-x86_64.tgz
sudo mv ./sui-tool /usr/local/bin/

# Run sui tool to download the latest epoch
sui-tool download-db-snapshot --latest --network testnet --path /home/ubuntu/.sui/db --num-parallel-downloads 50 --skip-indexes --no-sign-request

# Verify the download completion
if [ $? -eq 0 ]; then
    echo "Download completed successfully."
else
    echo "Download failed." >&2
    exit 1
fi

# Start fullnode
sudo systemctl start suid
