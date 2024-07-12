#!/bin/bash
echo "----------------------------------------------"
echo "[user-data] STARTING ALLORA USER DATA SCRIPT"
echo "----------------------------------------------"

echo "AWS_REGION=${_AWS_REGION_}" >> /etc/environment
echo "ASSETS_S3_PATH=${_ASSETS_S3_PATH_}" >> /etc/environment

#############################
# Prerequisites
# Pip
# Pipx
# docker.io
# Docker compose
# Go
#############################

# Update Ubuntu, answer yes to all prompts non-interactively
echo "[user-data] Update Ubuntu package list"
sudo apt-get update --yes

# Install pip
echo "[user-data] Install Pip"
sudo apt-get install python3-setuptools --yes
sudo python3 -m easy_install install pip
python3 -m pip --version

# Install Pipx
echo "[user-data] Install Pipx"
sudo apt-get install pipx --yes

# Install Go
echo "[user-data] Install Go"
sudo apt-get install golang-go --yes

# Install Docker Compose
# Install ca-certificates, a certificate authority package for verifying third-party identities, and curl, a data transfer tool:
echo "[user-data] Install ca-certificates"
sudo apt-get install ca-certificates --yes

echo "[user-data] Install curl"
sudo apt-get install curl --yes

# Set ownership permissions for the /etc/apt/keyrings directory:
echo "[user-data] Set ownership perms for /etc/apt/keyrings"
sudo install -m 0755 -d /etc/apt/keyrings

# Download the key with curl:
echo "[user-data] Downloading key with curl"
sudo curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc

# Set read permissions for the key:
echo "[user-data] set read permissions for key"
sudo chmod a+r /etc/apt/keyrings/docker.asc


# Add the Docker repository to the list of APT sources:
echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu \
  $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | \
  sudo tee /etc/apt/sources.list.d/docker.list > /dev/null

# Install Docker Compose:
echo "[user-data] Install docker compose"
sudo apt-get install docker-compose-plugin --yes

# Install Docker.io
echo "[user-data] Install docker.io"
sudo apt-get install docker.io --yes

# After the download completes, confirm that Docker Compose is installed by typing:
echo "[user-data] run docker compose version"
docker compose version

echo "[user-data] docker group and usermod"
# Create the docker group if it does not already exist:
sudo groupadd -f docker
# Add the current user to the docker group via the usermod command:
sudo usermod -aG docker $USER

# Start docker service
echo "[user-data] Starting docker service"
sudo service docker start

echo "----------------------------------------------"
echo "[user-data] Allora user-data script successful"
echo "----------------------------------------------"