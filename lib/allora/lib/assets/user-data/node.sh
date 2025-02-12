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
echo "ALLORA_ENV=${_ALLORA_ENV_}" >> /etc/environment
echo "MODEL_REPO=${_MODEL_REPO_}" >> /etc/environment
echo -e "MODEL_ENV_VARS='${_MODEL_ENV_VARS_}'" >> /etc/environment


echo "ALLORA_WALLET_ADDRESS_KEY_NAME=${_ALLORA_WALLET_ADDRESS_KEY_NAME_}" >> /etc/environment
echo "ALLORA_WALLET_ADDRESS_RESTORE_MNEMONIC=${_ALLORA_WALLET_ADDRESS_RESTORE_MNEMONIC_}" >> /etc/environment
echo "ALLORA_WALLET_HOME_DIR=${_ALLORA_WALLET_HOME_DIR_}" >> /etc/environment
echo "ALLORA_WALLET_GAS_ADJUSTMENT=${_ALLORA_WALLET_GAS_ADJUSTMENT_}" >> /etc/environment
echo "ALLORA_WALLET_GAS=${_ALLORA_WALLET_GAS_}" >> /etc/environment

#new props
echo "ALLORA_WALLET_GAS_PRICES=${_ALLORA_WALLET_GAS_PRICES_}" >> /etc/environment
echo "ALLORA_WALLET_GAS_PRICE_INTERVAL=${_ALLORA_WALLET_GAS_PRICE_INTERVAL_}" >> /etc/environment
echo "ALLORA_WALLET_RETRY_DELAY=${_ALLORA_WALLET_RETRY_DELAY_}" >> /etc/environment
echo "ALLORA_WALLET_BLOCK_DURATION_ESTIMATED=${_ALLORA_WALLET_BLOCK_DURATION_ESTIMATED_}" >> /etc/environment
echo "ALLORA_WALLET_WINDOW_CORRECTION_FACTOR=${_ALLORA_WALLET_WINDOW_CORRECTION_FACTOR_}" >> /etc/environment
echo "ALLORA_WALLET_MAX_FEES=${_ALLORA_WALLET_MAX_FEES_}" >> /etc/environment
echo "ALLORA_WALLET_ACCOUNT_SEQUENCE_RETRY_DELAY=${_ALLORA_WALLET_ACCOUNT_SEQUENCE_RETRY_DELAY_}" >> /etc/environment
#/new props


echo "ALLORA_WALLET_NODE_RPC=${_ALLORA_WALLET_NODE_RPC_}" >> /etc/environment
echo "ALLORA_WALLET_MAX_RETRIES=${_ALLORA_WALLET_MAX_RETRIES_}" >> /etc/environment
echo "ALLORA_WALLET_DELAY=${_ALLORA_WALLET_DELAY_}" >> /etc/environment
echo "ALLORA_WALLET_SUBMIT_TX=${_ALLORA_WALLET_SUBMIT_TX_}" >> /etc/environment

echo "ALLORA_WORKER_TOPIC_ID=${_ALLORA_WORKER_TOPIC_ID_}" >> /etc/environment
echo "ALLORA_WORKER_INFERENCE_ENTRYPOINT_NAME=${_ALLORA_WORKER_INFERENCE_ENTRYPOINT_NAME_}" >> /etc/environment
echo "ALLORA_WORKER_INFERENCE_ENDPOINT=${_ALLORA_WORKER_INFERENCE_ENDPOINT_}" >> /etc/environment
echo "ALLORA_WORKER_LOOP_SECONDS=${_ALLORA_WORKER_LOOP_SECONDS_}" >> /etc/environment
echo "ALLORA_WORKER_TOKEN=${_ALLORA_WORKER_TOKEN_}" >> /etc/environment

echo "ALLORA_REPUTER_TOPIC_ID=${_ALLORA_REPUTER_TOPIC_ID_}" >> /etc/environment
echo "ALLORA_REPUTER_ENTRYPOINT_NAME=${_ALLORA_REPUTER_ENTRYPOINT_NAME_}" >> /etc/environment
echo "ALLORA_REPUTER_SOURCE_OF_TRUTH_ENDPOINT=${_ALLORA_REPUTER_SOURCE_OF_TRUTH_ENDPOINT_}" >> /etc/environment

#new props
echo "ALLORA_REPUTER_LOSS_FUNCTION_SERVICE=${_ALLORA_REPUTER_LOSS_FUNCTION_SERVICE_}" >> /etc/environment
echo "ALLORA_REPUTER_LOSS_METHOD_OPTIONS_LOSS_METHOD=${_ALLORA_REPUTER_LOSS_METHOD_OPTIONS_LOSS_METHOD_}" >> /etc/environment
#/new props

echo "ALLORA_REPUTER_LOOP_SECONDS=${_ALLORA_REPUTER_LOOP_SECONDS_}" >> /etc/environment
echo "ALLORA_REPUTER_TOKEN=${_ALLORA_REPUTER_TOKEN_}" >> /etc/environment
echo "ALLORA_REPUTER_MIN_STAKE=${_ALLORA_REPUTER_MIN_STAKE_}" >> /etc/environment


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
git checkout $ALLORA_ENV

cp config.cdk.json.template config.json
cd
#wallet config str replace
sed -i "s/_ALLORA_WALLET_ADDRESS_KEY_NAME_/$ALLORA_WALLET_ADDRESS_KEY_NAME/" config.json
sed -i "s/_ALLORA_WALLET_ADDRESS_RESTORE_MNEMONIC_/$ALLORA_WALLET_ADDRESS_RESTORE_MNEMONIC/" config.json
sed -i "s/_ALLORA_WALLET_HOME_DIR_/$ALLORA_WALLET_HOME_DIR/" config.json
sed -i "s/_ALLORA_WALLET_GAS_ADJUSTMENT_/$ALLORA_WALLET_GAS_ADJUSTMENT/" config.json #must go before

#new props
sed -i "s/_ALLORA_WALLET_GAS_PRICE_INTERVAL_/$ALLORA_WALLET_GAS_PRICE_INTERVAL/" config.json #must go first
sed -i "s/_ALLORA_WALLET_GAS_PRICES_/$ALLORA_WALLET_GAS_PRICES/" config.json
sed -i "s/_ALLORA_WALLET_GAS_/$ALLORA_WALLET_GAS/" config.json #has to go last of the gas
sed -i "s/_ALLORA_WALLET_MAX_FEES_/$ALLORA_WALLET_MAX_FEES/" config.json
sed -i "s/_ALLORA_WALLET_RETRY_DELAY_/$ALLORA_WALLET_RETRY_DELAY/" config.json
sed -i "s/_ALLORA_WALLET_BLOCK_DURATION_ESTIMATED_/$ALLORA_WALLET_BLOCK_DURATION_ESTIMATED/" config.json
sed -i "s/_ALLORA_WALLET_WINDOW_CORRECTION_FACTOR_/$ALLORA_WALLET_WINDOW_CORRECTION_FACTOR/" config.json
sed -i "s/_ALLORA_WALLET_ACCOUNT_SEQUENCE_RETRY_DELAY_/$ALLORA_WALLET_ACCOUNT_SEQUENCE_RETRY_DELAY/" config.json

#/new props

sed -i "s#_ALLORA_WALLET_NODE_RPC_#$ALLORA_WALLET_NODE_RPC#" config.json
sed -i "s/_ALLORA_WALLET_MAX_RETRIES_/$ALLORA_WALLET_MAX_RETRIES/" config.json
sed -i "s/_ALLORA_WALLET_DELAY_/$ALLORA_WALLET_DELAY/" config.json #@deprecated
sed -i "s/_ALLORA_WALLET_SUBMIT_TX_/$ALLORA_WALLET_SUBMIT_TX/" config.json #@deprecated

#worker config str replace
sed -i "s/_ALLORA_WORKER_TOPIC_ID_/$ALLORA_WORKER_TOPIC_ID/" config.json
sed -i "s/_ALLORA_WORKER_INFERENCE_ENTRYPOINT_NAME_/$ALLORA_WORKER_INFERENCE_ENTRYPOINT_NAME/" config.json
sed -i "s#_ALLORA_WORKER_INFERENCE_ENDPOINT_#$ALLORA_WORKER_INFERENCE_ENDPOINT#" config.json
sed -i "s/_ALLORA_WORKER_LOOP_SECONDS_/$ALLORA_WORKER_LOOP_SECONDS/" config.json #@deprecated
sed -i "s/_ALLORA_WORKER_TOKEN_/$ALLORA_WORKER_TOKEN/" config.json

#reputer config str replace
sed -i "s/_ALLORA_REPUTER_TOPIC_ID_/$ALLORA_REPUTER_TOPIC_ID/" config.json
sed -i "s/_ALLORA_REPUTER_ENTRYPOINT_NAME_/$ALLORA_REPUTER_ENTRYPOINT_NAME/" config.json
sed -i "s#_ALLORA_REPUTER_SOURCE_OF_TRUTH_ENDPOINT_#$ALLORA_REPUTER_SOURCE_OF_TRUTH_ENDPOINT#" config.json

#new props
sed -i "s#_ALLORA_REPUTER_LOSS_FUNCTION_SERVICE_#$ALLORA_REPUTER_LOSS_FUNCTION_SERVICE#" config.json
sed -i "s/_ALLORA_REPUTER_LOSS_METHOD_OPTIONS_LOSS_METHOD_/$ALLORA_REPUTER_LOSS_METHOD_OPTIONS_LOSS_METHOD/" config.json
#/new props

sed -i "s/_ALLORA_REPUTER_LOOP_SECONDS_/$ALLORA_REPUTER_LOOP_SECONDS/" config.json #@deprecated
sed -i "s/_ALLORA_REPUTER_TOKEN_/$ALLORA_REPUTER_TOKEN/" config.json
sed -i "s/_ALLORA_REPUTER_MIN_STAKE_/$ALLORA_REPUTER_MIN_STAKE/" config.json

#pull in model repo
echo 'Pulling in the model repo '
echo $MODEL_REPO
cd ~/node-repo/adapter/api
rm -rf source
git clone $MODEL_REPO source

#build node
echo 'Building inner node'
cd source

cp ~/node-repo/config.json config.json

echo -e "$MODEL_ENV_VARS" >> .env


#build basic worker
echo 'building basic worker'
chmod +x init.config
./init.config
docker-compose up --build

echo "----------------------------------------------"
echo "[user-data] Allora user-data script successful"
echo "----------------------------------------------"


#ping the server for an inference response to $ALLORA_WORKER_INFERENCE_ENDPOINT/inference/$ALLORA_WORKER_TOKEN
curl "$ALLORA_WORKER_INFERENCE_ENDPOINT/inference/$ALLORA_WORKER_TOKEN"
