#!/bin/bash
echo "----------------------------------------------"
echo "[user-data] STARTING ALLORA USER DATA SCRIPT"
echo "----------------------------------------------"

echo "AWS_REGION=${_AWS_REGION_}" >> /etc/environment
echo "ASSETS_S3_PATH=${_ASSETS_S3_PATH_}" >> /etc/environment
echo "RESOURCE_ID=${_NODE_CF_LOGICAL_ID_}" >> /etc/environment
echo "STACK_NAME=${_STACK_NAME_}" >> /etc/environment
echo "STACK_ID=${_STACK_ID_}" >> /etc/environment
echo "ALLORA_WORKER_NAME=${_ALLORA_WORKER_NAME_}" >> /etc/environment
echo "ALLORA_TOPIC_ID=${_ALLORA_TOPIC_ID_}" >> /etc/environment
echo "ALLORA_ENV=${_ALLORA_ENV_}" >> /etc/environment
echo "ALLORA_NETWORK_NAME=${_ALLORA_NETWORK_NAME_}" >> /etc/environment
echo "ALLORA_ACCOUNT_NAME=${_ALLORA_ACCOUNT_NAME_}" >> /etc/environment
echo "ALLORA_ACCOUNT_MNEMONIC=${_ALLORA_ACCOUNT_MNEMONIC_}" >> /etc/environment
echo "ALLORA_ACCOUNT_PASSPHRASE=${_ALLORA_ACCOUNT_PASSPHRASE_}" >> /etc/environment
echo "ALLORA_NODE_RPC=${_ALLORA_NODE_RPC_}" >> /etc/environment

source /etc/environment

echo "Updating and installing required system packages"
sudo yum update -y
amazon-linux-extras install epel -y
sudo yum groupinstall "Development Tools" -y
sudo yum -y install python3-pip amazon-cloudwatch-agent collectd jq gcc10-10.5.0-1.amzn2.0.2 ncurses-devel telnet aws-cfn-bootstrap

#install Allora CLI tool with pip
sudo pip3 install allocmd --upgrade

# Install Git
sudo yum install git -y

# Install docker
sudo yum install docker -y

# Add the current user to the docker permissions group
sudo usermod -aG docker ec2-user

# Enable docker service at AMI boot time
sudo systemctl enable docker.service

# Start the docker service
sudo systemctl start docker.service

# Install docker-compose
sudo curl -L https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m) -o /usr/local/bin/docker-compose
sudo chmod +x /usr/local/bin/docker-compose
docker-compose version


#install AWS CLI
echo 'Installing AWS CLI v2'
curl https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip -o "awscliv2.zip"
unzip -q awscliv2.zip
./aws/install
rm /usr/bin/aws
ln /usr/local/bin/aws /usr/bin/aws

cfn-signal -e $? --stack $STACK_NAME --resource $RESOURCE_ID --region $AWS_REGION

# clone node repo
cd ~
git clone https://github.com/allora-network/allora-offchain-node.git node-repo
cd node-repo

touch .env
echo "ALLORA_ACCOUNT_NAME=$ALLORA_ACCOUNT_NAME" >> .env
echo "ALLORA_ACCOUNT_MNEMONIC=$ALLORA_ACCOUNT_MNEMONIC" >> .env
echo "ALLORA_ACCOUNT_PASSPHRASE=$ALLORA_ACCOUNT_PASSPHRASE" >> .env
echo "ALLORA_NODE_RPC=$ALLORA_NODE_RPC" >> .env

docker-compose up --build 

echo "----------------------------------------------"
echo "[user-data] Allora user-data script successful"
echo "----------------------------------------------"