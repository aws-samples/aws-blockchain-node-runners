#!/bin/bash
echo "[user-data] STARTING ALLORA USER DATA SCRIPT"

touch /etc/cdk_environment
chmod 600 /etc/cdk_environment

{
    echo "AWS_REGION=${_AWS_REGION_}"
    echo "ASSETS_S3_PATH=${_ASSETS_S3_PATH_}"
    echo "RESOURCE_ID=${_NODE_CF_LOGICAL_ID_}"
    echo "STACK_NAME=${_STACK_NAME_}"
    echo "STACK_ID=${_STACK_ID_}"

    echo "ALLORA_WORKER_NAME=${_ALLORA_WORKER_NAME_}"
    echo "ALLORA_ENV=${_ALLORA_ENV_}"
    echo "MODEL_REPO=${_MODEL_REPO_}"
    echo -e "MODEL_ENV_VARS='${_MODEL_ENV_VARS_}'"

    echo "ALLORA_WALLET_ADDRESS_KEY_NAME=${_ALLORA_WALLET_ADDRESS_KEY_NAME_}"
    echo "ALLORA_WALLET_ADDRESS_RESTORE_MNEMONIC=${_ALLORA_WALLET_ADDRESS_RESTORE_MNEMONIC_}"
    echo "ALLORA_WALLET_HOME_DIR=${_ALLORA_WALLET_HOME_DIR_}"
    echo "ALLORA_WALLET_GAS_ADJUSTMENT=${_ALLORA_WALLET_GAS_ADJUSTMENT_}"
    echo "ALLORA_WALLET_GAS=${_ALLORA_WALLET_GAS_}"

    #new props
    echo "ALLORA_WALLET_GAS_PRICES=${_ALLORA_WALLET_GAS_PRICES_}"
    echo "ALLORA_WALLET_GAS_PRICE_INTERVAL=${_ALLORA_WALLET_GAS_PRICE_INTERVAL_}"
    echo "ALLORA_WALLET_RETRY_DELAY=${_ALLORA_WALLET_RETRY_DELAY_}"
    echo "ALLORA_WALLET_BLOCK_DURATION_ESTIMATED=${_ALLORA_WALLET_BLOCK_DURATION_ESTIMATED_}"
    echo "ALLORA_WALLET_WINDOW_CORRECTION_FACTOR=${_ALLORA_WALLET_WINDOW_CORRECTION_FACTOR_}"
    echo "ALLORA_WALLET_MAX_FEES=${_ALLORA_WALLET_MAX_FEES_}"
    echo "ALLORA_WALLET_ACCOUNT_SEQUENCE_RETRY_DELAY=${_ALLORA_WALLET_ACCOUNT_SEQUENCE_RETRY_DELAY_}"
    #/new props

    echo "ALLORA_WALLET_NODE_RPC=${_ALLORA_WALLET_NODE_RPC_}"
    echo "ALLORA_WALLET_MAX_RETRIES=${_ALLORA_WALLET_MAX_RETRIES_}"
    echo "ALLORA_WALLET_DELAY=${_ALLORA_WALLET_DELAY_}"
    echo "ALLORA_WALLET_SUBMIT_TX=${_ALLORA_WALLET_SUBMIT_TX_}"

    echo "ALLORA_WORKER_TOPIC_ID=${_ALLORA_WORKER_TOPIC_ID_}"
    echo "ALLORA_WORKER_INFERENCE_ENTRYPOINT_NAME=${_ALLORA_WORKER_INFERENCE_ENTRYPOINT_NAME_}"
    echo "ALLORA_WORKER_INFERENCE_ENDPOINT=${_ALLORA_WORKER_INFERENCE_ENDPOINT_}"
    echo "ALLORA_WORKER_LOOP_SECONDS=${_ALLORA_WORKER_LOOP_SECONDS_}"
    echo "ALLORA_WORKER_TOKEN=${_ALLORA_WORKER_TOKEN_}"

    echo "ALLORA_REPUTER_TOPIC_ID=${_ALLORA_REPUTER_TOPIC_ID_}"
    echo "ALLORA_REPUTER_ENTRYPOINT_NAME=${_ALLORA_REPUTER_ENTRYPOINT_NAME_}"
    echo "ALLORA_REPUTER_SOURCE_OF_TRUTH_ENDPOINT=${_ALLORA_REPUTER_SOURCE_OF_TRUTH_ENDPOINT_}"

    #new props
    echo "ALLORA_REPUTER_LOSS_FUNCTION_SERVICE=${_ALLORA_REPUTER_LOSS_FUNCTION_SERVICE_}"
    echo "ALLORA_REPUTER_LOSS_METHOD_OPTIONS_LOSS_METHOD=${_ALLORA_REPUTER_LOSS_METHOD_OPTIONS_LOSS_METHOD_}"
    #/new props
    echo "ALLORA_REPUTER_LOOP_SECONDS=${_ALLORA_REPUTER_LOOP_SECONDS_}"
    echo "ALLORA_REPUTER_TOKEN=${_ALLORA_REPUTER_TOKEN_}"
    echo "ALLORA_REPUTER_MIN_STAKE=${_ALLORA_REPUTER_MIN_STAKE_}"
} >> /etc/cdk_environment

source /etc/cdk_environment
# Export environment variables so calls to `envsubst` inherit the evironment variables.
while read -r line; do export "$line"; done < /etc/cdk_environment

arch=$(uname -m)

echo "Architecture detected: $arch"

if [ "$arch" == "x86_64" ]; then
  SSM_AGENT_BINARY_URI=https://s3.amazonaws.com/ec2-downloads-windows/SSMAgent/latest/linux_amd64/amazon-ssm-agent.rpm
else
  SSM_AGENT_BINARY_URI=https://s3.amazonaws.com/ec2-downloads-windows/SSMAgent/latest/linux_arm64/amazon-ssm-agent.rpm
fi

echo "Updating and installing required system packages"
dnf update -y
amazon-linux-extras install epel -y
dnf groupinstall "Development Tools" -y
dnf -y install python3-pip amazon-cloudwatch-agent collectd jq gcc10-10.5.0-1.amzn2.0.2 ncurses-devel telnet aws-cfn-bootstrap cronie

cd /opt

echo "Downloading assets zip file"
aws s3 cp $ASSETS_S3_PATH ./assets.zip
unzip -q assets.zip

echo 'Upgrading SSM Agent'
yum install -y $SSM_AGENT_BINARY_URI

# Install Git
dnf install git -y

echo "Installing Docker"
dnf remove -y docker docker-client docker-client-latest docker-common docker-latest docker-latest-logrotate docker-logrotate docker-engine
dnf -y install dnf-plugins-core
dnf config-manager --add-repo https://download.docker.com/linux/centos/docker-ce.repo
sed -i 's/$releasever/9/g' /etc/yum.repos.d/docker-ce.repo
dnf -y install docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
systemctl enable --now docker

docker compose version

echo "Creating run user and making sure it has all necessary permissions"
groupadd -g 1002 bcuser
useradd -u 1002 -g 1002 -m -s /bin/bash bcuser
usermod -a -G docker bcuser
usermod -a -G docker ec2-user

echo "Starting docker"
service docker start
systemctl enable docker

cfn-signal -e $? --stack $STACK_NAME --resource $RESOURCE_ID --region $AWS_REGION

echo "Preparing data volume"

mkdir -p /data

if [[ "$DATA_VOLUME_TYPE" == "instance-store" ]]; then
  echo "Data volume type is instance store"

  (crontab -l; echo "@reboot /opt/instance/storage/setup.sh /data ext4 > /tmp/setup-store-volume-data.log 2>&1") | crontab -
  crontab -l

  /opt/instance/storage/setup.sh /data ext4
else
  echo "Data volume type is EBS"
  echo "Waiting for EBS volume to become available"
  sleep 60
  /opt/instance/storage/setup.sh /data ext4
fi

lsblk -d

# clone node repo
cd /home/bcuser
git clone https://github.com/allora-network/allora-offchain-node.git node-repo
cd node-repo
git checkout $ALLORA_ENV

cp config.cdk.json.template config.json

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
cd /home/bcuser/node-repo/adapter/api
rm -rf source
git clone $MODEL_REPO source

#build node
echo 'Building inner node'
cd source

cp /home/bcuser/node-repo/config.json config.json

echo -e "$MODEL_ENV_VARS" >> .env

#build basic worker
echo 'building basic worker'
chmod +x init.config
./init.config
mkdir /home/bcuser/data
ln -s /home/bcuser/data /data
chown -R bcuser:bcuser /data
chown -R bcuser:bcuser /home/bcuser
su bcuser

echo "Install allorad"
curl -sSL https://raw.githubusercontent.com/allora-network/allora-chain/main/install.sh | bash -s -- v0.8.0
# docker compose up --build

echo "[user-data] Allora user-data script successful"

#ping the server for an inference response to $ALLORA_WORKER_INFERENCE_ENDPOINT/inference/$ALLORA_WORKER_TOKEN
curl "$ALLORA_WORKER_INFERENCE_ENDPOINT/inference/$ALLORA_WORKER_TOKEN"
