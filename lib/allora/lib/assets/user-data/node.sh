#!/bin/bash

#############################
# Prerequisites
# Pip
# Pipx
# docker.io
# Docker compose
# Go
#############################

# Update Ubuntu, answer yes to all prompts non-interactively
sudo apt update --yes

# Install pip
sudo apt install python3-pip --yes

# Install Pipx
sudo apt install pipx --yes

# Install Go
sudo apt install golang-go --yes




# Install Docker Compose
# Install ca-certificates, a certificate authority package for verifying third-party identities, and curl, a data transfer tool:
sudo apt install ca-certificates curl

# Set ownership permissions for the /etc/apt/keyrings directory:
sudo install -m 0755 -d /etc/apt/keyrings

# Download the key with curl:
sudo curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc

# Set read permissions for the key:
sudo chmod a+r /etc/apt/keyrings/docker.asc

 




# Add the Docker repository to the list of APT sources:
echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu \
  $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | \
  sudo tee /etc/apt/sources.list.d/docker.list > /dev/null

# Install Docker Compose:
sudo apt install docker-compose-plugin -y

# Install Docker.io
sudo apt install docker.io

# After the download completes, confirm that Docker Compose is installed by typing:
docker compose version

# Create the docker group if it does not already exist:
sudo groupadd -f docker
# Add the current user to the docker group via the usermod command:
sudo usermod -aG docker $USER
# Start docker service
sudo service docker start

