#!/bin/bash
echo "----------------------------------------------"
echo "[user-data] STARTING ALLORA USER DATA SCRIPT"
echo "----------------------------------------------"

echo "AWS_REGION=${_AWS_REGION_}" >> /etc/environment
echo "ASSETS_S3_PATH=${_ASSETS_S3_PATH_}" >> /etc/environment
echo "RESOURCE_ID=${_NODE_CF_LOGICAL_ID_}" >> /etc/environment
echo "STACK_NAME=${_STACK_NAME_}" >> /etc/environment
echo "STACK_ID=${_STACK_ID_}" >> /etc/environment

#############################
# Prerequisites
# Aws cli (for signalling)
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
echo "[user-data] Install Python, Pip, and Venv"
sudo add-apt-repository ppa:deadsnakes/ppa --yes
sudo apt-get update --yes
sudo apt install python3.7 --yes
sudo apt-get install -y python3-pip python3-venv


# Install Pipx
echo "[user-data] Install Pipx"
sudo apt-get install pipx --yes
pipx ensurepath

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

# update again since we added the docker repo to apt sources
echo "[user-data] Update again after adding docker repo to apt sources"
sudo apt-get update --yes

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

echo "[user-data] Signaling completion to CloudFormation"
if [[ "$STACK_ID" != "none" ]]; then
  echo "Install and enable CloudFormation helper scripts"
  mkdir -p /opt/aws/
  pip3 install https://s3.amazonaws.com/cloudformation-examples/aws-cfn-bootstrap-py3-latest.tar.gz
  sudo ln -s /usr/local/init/ubuntu/cfn-hup /etc/init.d/cfn-hup

  echo "Configuring CloudFormation helper scripts"
  mkdir -p /etc/cfn/
  mv /opt/cfn-hup/cfn-hup.conf /etc/cfn/cfn-hup.conf
  sed -i "s;__AWS_STACK_ID__;\"$STACK_ID\";g" /etc/cfn/cfn-hup.conf
  sed -i "s;__AWS_REGION__;\"$AWS_REGION\";g" /etc/cfn/cfn-hup.conf

  mkdir -p /etc/cfn/hooks.d/
  mv /opt/cfn-hup/cfn-auto-reloader.conf /etc/cfn/hooks.d/cfn-auto-reloader.conf
  sed -i "s;__AWS_STACK_NAME__;\"$STACK_NAME\";g" /etc/cfn/hooks.d/cfn-auto-reloader.conf
  sed -i "s;__AWS_REGION__;\"$AWS_REGION\";g" /etc/cfn/hooks.d/cfn-auto-reloader.conf

  echo "Starting CloudFormation helper scripts as a service"
  mv /opt/cfn-hup/cfn-hup.service  /etc/systemd/system/cfn-hup.service

  systemctl daemon-reload
  systemctl enable --now cfn-hup
  systemctl start cfn-hup.service

  cfn-signal --stack $STACK_NAME --resource $RESOURCE_ID --region $AWS_REGION
fi



echo "----------------------------------------------"
echo "[user-data] Allora user-data script successful"
echo "----------------------------------------------"