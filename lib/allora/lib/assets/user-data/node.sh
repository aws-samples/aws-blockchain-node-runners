#!/bin/bash
echo "----------------------------------------------"
echo "[user-data] STARTING ALLORA USER DATA SCRIPT"
echo "----------------------------------------------"

echo "AWS_REGION=${_AWS_REGION_}" >> /etc/environment
echo "ASSETS_S3_PATH=${_ASSETS_S3_PATH_}" >> /etc/environment
echo "RESOURCE_ID=${_NODE_CF_LOGICAL_ID_}" >> /etc/environment
echo "STACK_NAME=${_STACK_NAME_}" >> /etc/environment
echo "STACK_ID=${_STACK_ID_}" >> /etc/environment

source /etc/environment

#############################
# Prerequisites
# Pip
# Pipx
# Go
#############################




# Update Ubuntu, answer yes to all prompts non-interactively
echo "[user-data] Update Ubuntu package list"
sudo add-apt-repository ppa:deadsnakes/ppa
sudo apt-get update --yes


# Install pip
echo "[user-data] Pip"
sudo apt-get install -y python3-pip


# Install Pipx
echo "[user-data] Install Pipx"
sudo apt-get install pipx --yes
pipx ensurepath

# Install Go
echo "[user-data] Install Go"
sudo apt-get install golang-go --yes

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

# install cfn

# install python 3.11
sudo apt-get install python3.11 --yes

sudo apt-get install python3.11-venv
sudo python3.11 -m venv env
source env/bin/activate

sudo apt-get install heat-cfntools --yes

cfn-init --stack $STACK_NAME --resource $RESOURCE_ID --region $AWS_REGION --configsets setup

cfn-signal -e $? --stack $STACK_NAME --resource $RESOURCE_ID --region $AWS_REGION

echo "----------------------------------------------"
echo "[user-data] Allora user-data script successful"
echo "----------------------------------------------"