#!/bin/bash
set +e

# Set by generic single-node and ha-node CDK components
echo "ASSETS_S3_PATH=${_ASSETS_S3_PATH_}" >> /etc/environment
echo "CF_STACK_NAME=${CF_STACK_NAME}" >> /etc/environment
echo "ACCOUNTS_DISC_TYPE=${ACCOUNTS_DISC_TYPE}" >> /etc/environment
echo "DATA_DISC_TYPE=${DATA_DISC_TYPE}" >> /etc/environment
echo "SOLANA_VERSION=${SOLANA_VERSION}" >> /etc/environment
echo "SOLANA_NODE_TYPE=${SOLANA_NODE_TYPE}" >> /etc/environment
echo "NODE_IDENTITY_SECRET_ARN=${NODE_IDENTITY_SECRET_ARN}" >> /etc/environment
echo "VOTE_ACCOUNT_SECRET_ARN=${VOTE_ACCOUNT_SECRET_ARN}" >> /etc/environment
echo "AUTHORIZED_WITHDRAWER_ACCOUNT_SECRET_ARN=${AUTHORIZED_WITHDRAWER_ACCOUNT_SECRET_ARN}" >> /etc/environment
echo "REGISTRATION_TRANSACTION_FUNDING_ACCOUNT_SECRET_ARN=${REGISTRATION_TRANSACTION_FUNDING_ACCOUNT_SECRET_ARN}" >> /etc/environment
echo "SOLANA_CLUSTER_ID=${SOLANA_CLUSTER_ID}" >> /etc/environment
source /etc/environment

apt-get -yqq update
apt-get -yqq install awscli jq

# Saving just in case for future use
arch=$(uname -m)

export AWS_REGION=`curl http://169.254.169.254/latest/dynamic/instance-identity/document|grep region|awk -F\" '{print $4}'`
export GIT_URL="https://raw.githubusercontent.com/frbrkoala/solana-configs-for-aws/main"

case $SOLANA_CLUSTER_ID in
  "mainnet-beta")
    ENTRY_POINTS=" --entrypoint entrypoint.mainnet-beta.solana.com:8001 --entrypoint entrypoint2.mainnet-beta.solana.com:8001 --entrypoint entrypoint3.mainnet-beta.solana.com:8001 --entrypoint entrypoint4.mainnet-beta.solana.com:8001 --entrypoint entrypoint5.mainnet-beta.solana.com:8001"
    KNOWN_VALIDATORS=" --known-validator 7Np41oeYqPefeNQEHSv1UDhYrehxin3NStELsSKCT4K2 --known-validator GdnSyH3YtwcxFvQrVVJMm1JhTS4QVX7MFsX56uJLUfiZ --known-validator DE1bawNcRJB9rVm3buyMVfr8mBEoyyu73NBovf2oXJsJ --known-validator CakcnaRDHka2gXyfbEd2d3xsvkJkqsLw2akB3zsN1D2S"
    SOLANA_METRICS_CONFIG="host=https://metrics.solana.com:8086,db=mainnet-beta,u=mainnet-beta_write,p=password"
    EXPECTED_GENESIS_HASH="5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d"
    ;;
  "testnet")
    ENTRY_POINTS=" --entrypoint entrypoint.testnet.solana.com:8001 --entrypoint entrypoint2.testnet.solana.com:8001 --entrypoint entrypoint3.testnet.solana.com:8001"
    KNOWN_VALIDATORS=" --known-validator 5D1fNXzvv5NjV1ysLjirC4WY92RNsVH18vjmcszZd8on --known-validator dDzy5SR3AXdYWVqbDEkVFdvSPCtS9ihF5kJkHCtXoFs --known-validator Ft5fbkqNa76vnsjYNwjDZUXoTWpP7VYm3mtsaQckQADN --known-validator eoKpUABi59aT4rR9HGS3LcMecfut9x7zJyodWWP43YQ --known-validator 9QxCLckBiJc783jnMvXZubK4wH86Eqqvashtrwvcsgkv"
    SOLANA_METRICS_CONFIG="host=https://metrics.solana.com:8086,db=tds,u=testnet_write,p=c4fa841aa918bf8274e3e2a44d77568d9861b3ea"
    EXPECTED_GENESIS_HASH="4uhcVJyU9pJkvQyS88uRDiswHXSCkY3zQawwpjk2NsNY"
    ;;
  "devnet")
    ENTRY_POINTS=" --entrypoint entrypoint.devnet.solana.com:8001 --entrypoint entrypoint2.devnet.solana.com:8001 --entrypoint entrypoint3.devnet.solana.com:8001 --entrypoint entrypoint4.devnet.solana.com:8001 --entrypoint entrypoint5.devnet.solana.com:8001"
    KNOWN_VALIDATORS=" --known-validator dv1ZAGvdsz5hHLwWXsVnM94hWf1pjbKVau1QVkaMJ92 --known-validator dv2eQHeP4RFrJZ6UeiZWoc3XTtmtZCUKxxCApCDcRNV --known-validator dv4ACNkpYPcE3aKmYDqZm9G5EB3J4MRoeE7WNDRBVJB --known-validator dv3qDFk1DTF36Z62bNvrCXe9sKATA6xvVy6A798xxAS"
    SOLANA_METRICS_CONFIG="host=https://metrics.solana.com:8086,db=devnet,u=scratch_writer,p=topsecret"
    EXPECTED_GENESIS_HASH="EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG"
    ;;
  *)
    echo "Solana cluster id is not valid: $SOLANA_CLUSTER_ID"
    exit 1
    ;;
esac

echo "Install and configure CloudWatch agent"
wget -q https://s3.amazonaws.com/amazoncloudwatch-agent/ubuntu/amd64/latest/amazon-cloudwatch-agent.deb
sudo dpkg -i -E amazon-cloudwatch-agent.deb

sudo wget -q $GIT_URL/src/configs/cloudwatch-agent-config.json
sudo cp ./cloudwatch-agent-config.json /opt/aws/amazon-cloudwatch-agent/etc/custom-amazon-cloudwatch-agent.json

sudo /opt/aws/amazon-cloudwatch-agent/bin/amazon-cloudwatch-agent-ctl \
-a fetch-config -c file:/opt/aws/amazon-cloudwatch-agent/etc/custom-amazon-cloudwatch-agent.json -m ec2 -s
#sudo systemctl status amazon-cloudwatch-agent

echo "Fine tune sysctl to prepare the system for Solana"

sudo bash -c "cat >/etc/sysctl.d/20-solana-additionals.conf <<EOF
kernel.hung_task_timeout_secs=600
vm.stat_interval=10
vm.dirty_ratio=40
vm.dirty_background_ratio=10
vm.dirty_expire_centisecs=36000
vm.dirty_writeback_centisecs=3000
vm.dirtytime_expire_seconds=43200
kernel.timer_migration=0
kernel.pid_max=65536
net.ipv4.tcp_fastopen=3
fs.nr_open = 1000000
EOF"

sudo bash -c "cat >/etc/sysctl.d/20-solana-mmaps.conf <<EOF
# Increase memory mapped files limit
vm.max_map_count = 1000000
EOF"

sudo bash -c "cat >/etc/sysctl.d/20-solana-udp-buffers.conf <<EOF
# Increase UDP buffer size
net.core.rmem_default = 134217728
net.core.rmem_max = 134217728
net.core.wmem_default = 134217728
net.core.wmem_max = 134217728
EOF"

sudo bash -c "echo 'DefaultLimitNOFILE=1000000' >> /etc/systemd/system.conf"

sudo sysctl -p /etc/sysctl.d/20-solana-mmaps.conf
sudo sysctl -p /etc/sysctl.d/20-solana-udp-buffers.conf
sudo sysctl -p /etc/sysctl.d/20-solana-additionals.conf

sudo systemctl daemon-reload

sudo bash -c "cat >/etc/security/limits.d/90-solana-nofiles.conf <<EOF
# Increase process file descriptor count limit
* - nofile 1000000
EOF"

echo 'Preparing directories and file system for Solana installation'
sudo mkdir /var/solana
sudo mkdir /var/solana/data
sudo mkdir /var/solana/accounts

if [[ "$DATA_DISC_TYPE" == "instancestore" ]]; then
  echo "Data volume type is instance store"

  cd /opt
  sudo wget $GIT_URL/src/scripts/setup-instance-store-volumes.sh

  sudo chmod +x /opt/setup-instance-store-volumes.sh

  (crontab -l; echo "@reboot /opt/setup-instance-store-volumes.sh >/tmp/setup-instance-store-volumes.log 2>&1") | crontab -
  crontab -l

  sudo /opt/setup-instance-store-volumes.sh

else
  echo "Data volume type is EBS"

  # Our data volume size is 2TB
  DATA_DISC_ID=/dev/$(lsblk -lnb | awk '{if ($4== 2147483648000) {print $1}}')
  sudo mkfs -t xfs $DATA_DISC_ID
  sleep 10
  DATA_DISC_UUID=$(lsblk -fn -o UUID  $DATA_DISC_ID)
  DATA_DISC_FSTAB_CONF="UUID=$DATA_DISC_UUID /var/solana/data xfs defaults 0 2"
  echo "DATA_DISC_ID="$DATA_DISC_ID
  echo "DATA_DISC_UUID="$DATA_DISC_UUID
  echo "DATA_DISC_FSTAB_CONF="$DATA_DISC_FSTAB_CONF
  echo $DATA_DISC_FSTAB_CONF | sudo tee -a /etc/fstab
  sudo mount -a
fi

if [[ "$ACCOUNTS_DISC_TYPE" == "instancestore" ]]; then
  echo "Accounts volume type is instance store"

  if [[ "$DATA_DISC_TYPE" != "instancestore" ]]; then
    cd /opt
    sudo wget $GIT_URL/src/scripts/setup-instance-store-volumes.sh

    sudo chmod +x /opt/setup-instance-store-volumes.sh

    (crontab -l; echo "@reboot /opt/setup-instance-store-volumes.sh >/tmp/setup-instance-store-volumes.log 2>&1") | crontab -
    crontab -l

    sudo /opt/setup-instance-store-volumes.sh

  else
    echo "Data and Accounts volumes are instance stores and should be both configured by now"
  fi

else
  echo "Accounts volume type is EBS"
  # Our accounts volume size is 500GB
  ACCOUNTS_DISC_ID=/dev/$(lsblk -lnb | awk '{if ($4== 536870912000) {print $1}}')
  sudo mkfs -t xfs $ACCOUNTS_DISC_ID
  sleep 10
  ACCOUNTS_DISC_UUID=$(lsblk -fn -o UUID $ACCOUNTS_DISC_ID)
  ACCOUNTS_DISC_FSTAB_CONF="UUID=$ACCOUNTS_DISC_UUID /var/solana/accounts xfs defaults 0 2"
  echo "ACCOUNTS_DISC_ID="$ACCOUNTS_DISC_ID
  echo "ACCOUNTS_DISC_UUID="$ACCOUNTS_DISC_UUID
  echo "ACCOUNTS_DISC_FSTAB_CONF="$ACCOUNTS_DISC_FSTAB_CONF
  echo $ACCOUNTS_DISC_FSTAB_CONF | sudo tee -a /etc/fstab

  sudo mount -a
fi

sudo mkdir /var/solana/data/ledger

echo 'Adding solana user and group'
sudo groupadd -g 1002 solana
sudo useradd -u 1002 -g 1002 -m -s /bin/bash solana
sudo usermod -aG sudo solana

cd /home/solana
sudo mkdir ./bin

echo "Download and unpack Solana"
echo "Downloading x86 binaries for version v$SOLANA_VERSION"

sudo wget -q https://github.com/solana-labs/solana/releases/download/v$SOLANA_VERSION/solana-release-x86_64-unknown-linux-gnu.tar.bz2
sudo tar -xjvf solana-release-x86_64-unknown-linux-gnu.tar.bz2
sudo mv solana-release/bin/* ./bin/

echo "Preparing Solana start script"

cd /home/solana/bin

if [[ $NODE_IDENTITY_SECRET_ARN == "none" ]]; then
    echo "Create node identity"
    sudo ./solana-keygen new --no-passphrase -o /home/solana/config/validator-keypair.json
    NODE_IDENTITY=$(sudo ./solana-keygen pubkey /home/solana/config/validator-keypair.json)
    echo "Backing up node identity to AWS Secrets Manager"
    sudo aws secretsmanager create-secret --name "solana-node/"$NODE_IDENTITY --description "Solana Node Identity Secret created for stack $CF_STACK_NAME" --secret-string file:///home/solana/config/validator-keypair.json --region $AWS_REGION
else
    echo "Retrieving node identity from AWS Secrets Manager"
    sudo aws secretsmanager get-secret-value --secret-id $NODE_IDENTITY_SECRET_ARN --query SecretString --output text --region $AWS_REGION > ~/validator-keypair.json
    sudo mv ~/validator-keypair.json /home/solana/config/validator-keypair.json
fi

if [[ "$SOLANA_NODE_TYPE" == "validator" ]]; then
    if [[ $VOTE_ACCOUNT_SECRET_ARN == "none" ]]; then
        echo "Create Vote Account Secret"
        sudo ./solana-keygen new --no-passphrase -o /home/solana/config/vote-account-keypair.json
        NODE_IDENTITY=$(sudo ./solana-keygen pubkey /home/solana/config/vote-account-keypair.json)
        echo "Backing up Vote Account Secret to AWS Secrets Manager"
        sudo aws secretsmanager create-secret --name "solana-node/"$NODE_IDENTITY --description "Solana Vote Account Secret created for stack $CF_STACK_NAME" --secret-string file:///home/solana/config/vote-account-keypair.json --region $AWS_REGION

        if [[ $AUTHORIZED_WITHDRAWER_ACCOUNT_SECRET_ARN == "none" ]]; then
            echo "Create Authorized Withdrawer Account Secret"
            sudo ./solana-keygen new --no-passphrase -o /home/solana/config/authorized-withdrawer-keypair.json
            NODE_IDENTITY=$(sudo ./solana-keygen pubkey /home/solana/config/authorized-withdrawer-keypair.json)
            echo "Backing up Authorized Withdrawer Account  to AWS Secrets Manager"
            sudo aws secretsmanager create-secret --name "solana-node/"$NODE_IDENTITY --description "Authorized Withdrawer Account Secret created for stack $CF_STACK_NAME" --secret-string file:///home/solana/config/authorized-withdrawer-keypair.json --region $AWS_REGION

        else
            echo "Retrieving Authorized Withdrawer Account Secret from AWS Secrets Manager"
            sudo aws secretsmanager get-secret-value --secret-id $AUTHORIZED_WITHDRAWER_ACCOUNT_SECRET_ARN --query SecretString --output text --region $AWS_REGION > ~/authorized-withdrawer-keypair.json
            sudo mv ~/authorized-withdrawer-keypair.json /home/solana/config/authorized-withdrawer-keypair.json
        fi

        if [[ $REGISTRATION_TRANSACTION_FUNDING_ACCOUNT_SECRET_ARN != "none" ]]; then
          echo "Retrieving Registration Transaction Funding Account Secret from AWS Secrets Manager"
          sudo aws secretsmanager get-secret-value --secret-id $REGISTRATION_TRANSACTION_FUNDING_ACCOUNT_SECRET_ARN --query SecretString --output text --region $AWS_REGION > ~/id.json
          sudo mkdir -p /root/.config/solana
          sudo mv ~/id.json /root/.config/solana/id.json
          echo "Creating Vote Account on-chain"
          sudo ./solana create-vote-account /home/solana/config/vote-account-keypair.json /home/solana/config/validator-keypair.json /home/solana/config/authorized-withdrawer-keypair.json
          
          echo "Deleting Transaction Funding Account Secret from the local disc"
          sudo rm  /root/.config/solana/id.json
        else
          echo "Vote Account not created. Please create it manually: https://docs.solana.com/running-validator/validator-start#create-vote-account"
        fi

        echo "Deleting Authorized Withdrawer Account from the local disc"
        sudo rm /home/solana/config/authorized-withdrawer-keypair.json
    else
        echo "Retrieving Vote Account Secret from AWS Secrets Manager"
        sudo aws secretsmanager get-secret-value --secret-id $VOTE_ACCOUNT_SECRET_ARN --query SecretString --output text --region $AWS_REGION > ~/vote-account-keypair.json
        sudo mv ~/vote-account-keypair.json /home/solana/config/vote-account-keypair.json
    fi

sudo wget -q $GIT_URL/src/scripts/node-validator-template.sh
mv ./node-validator-template.sh /home/solana/bin/validator.sh
fi

if [[ "$SOLANA_NODE_TYPE" == "lightrpc" ]]; then
  sudo wget -q $GIT_URL/src/scripts/node-light-rpc-template.sh
  mv ./node-light-rpc-template.sh /home/solana/bin/validator.sh
fi

if [[ "$SOLANA_NODE_TYPE" == "heavyrpc" ]]; then
  sudo wget -q $GIT_URL/src/scripts/node-heavy-rpc-template.sh
  mv ./node-heavy-rpc-template.sh /home/solana/bin/validator.sh
fi

sed -i "s;__SOLANA_METRICS_CONFIG__;\"$SOLANA_METRICS_CONFIG\";g" /home/solana/bin/validator.sh
sed -i "s/__EXPECTED_GENESIS_HASH__/$EXPECTED_GENESIS_HASH/g" /home/solana/bin/validator.sh
sed -i "s/__KNOWN_VALIDATORS__/$KNOWN_VALIDATORS/g" /home/solana/bin/validator.sh
sed -i "s/__ENTRY_POINTS__/$ENTRY_POINTS/g" /home/solana/bin/validator.sh
sudo chmod +x /home/solana/bin/validator.sh

echo "Making sure the solana user has access to everything needed"
sudo chown -R solana:solana /var/solana
sudo chown -R solana:solana /home/solana

echo "Starting solana as a service"
sudo bash -c 'cat > /etc/systemd/system/sol.service <<EOF
[Unit]
Description=Solana Validator
After=network.target
StartLimitIntervalSec=0
[Service]
Type=simple
Restart=always
RestartSec=1
User=solana
LimitNOFILE=1000000
LogRateLimitIntervalSec=0
Environment="PATH=/bin:/usr/bin:/home/solana/bin"
ExecStart=/home/solana/bin/validator.sh
[Install]
WantedBy=multi-user.target
EOF'

sudo systemctl daemon-reload
sudo systemctl enable --now sol

echo 'Configuring logrotate to rotate Solana logs'

sudo bash -c 'sudo cat > logrotate.sol <<EOF
/home/sol/solana-validator.log {
  rotate 7
  daily
  missingok
  postrotate
    systemctl kill -s USR1 sol.service
  endscript
}
EOF'

sudo cp logrotate.sol /etc/logrotate.d/sol
sudo systemctl restart logrotate.service

echo "Configuring syncchecker script"
cd /opt
sudo wget $GIT_URL/src/scripts/syncchecker-solana.sh
sudo mv /opt/syncchecker-solana.sh /opt/syncchecker.sh
sudo chmod +x /opt/syncchecker.sh

(crontab -l; echo "*/1 * * * * /opt/syncchecker.sh >/tmp/syncchecker.log 2>&1") | crontab -
crontab -l

echo "All Done!!"