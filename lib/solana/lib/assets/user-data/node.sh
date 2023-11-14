#!/bin/bash
set +e

echo "AWS_REGION=${_AWS_REGION_}" >> /etc/environment
echo "ASSETS_S3_PATH=${_ASSETS_S3_PATH_}" >> /etc/environment
echo "STACK_NAME=${_STACK_NAME_}" >> /etc/environment
echo "STACK_ID=${_STACK_ID_}" >> /etc/environment
echo "RESOURCE_ID=${_NODE_CF_LOGICAL_ID_}" >> /etc/environment
echo "ACCOUNTS_VOLUME_TYPE=${_ACCOUNTS_VOLUME_TYPE_}" >> /etc/environment
echo "ACCOUNTS_VOLUME_SIZE=${_ACCOUNTS_VOLUME_SIZE_}" >> /etc/environment
echo "DATA_VOLUME_TYPE=${_DATA_VOLUME_TYPE_}" >> /etc/environment
echo "DATA_VOLUME_SIZE=${_DATA_VOLUME_SIZE_}" >> /etc/environment
echo "SOLANA_VERSION=${_SOLANA_VERSION_}" >> /etc/environment
echo "SOLANA_NODE_TYPE=${_SOLANA_NODE_TYPE_}" >> /etc/environment
echo "NODE_IDENTITY_SECRET_ARN=${_NODE_IDENTITY_SECRET_ARN_}" >> /etc/environment
echo "VOTE_ACCOUNT_SECRET_ARN=${_VOTE_ACCOUNT_SECRET_ARN_}" >> /etc/environment
echo "AUTHORIZED_WITHDRAWER_ACCOUNT_SECRET_ARN=${_AUTHORIZED_WITHDRAWER_ACCOUNT_SECRET_ARN_}" >> /etc/environment
echo "REGISTRATION_TRANSACTION_FUNDING_ACCOUNT_SECRET_ARN=${_REGISTRATION_TRANSACTION_FUNDING_ACCOUNT_SECRET_ARN_}" >> /etc/environment
echo "SOLANA_CLUSTER=${_SOLANA_CLUSTER_}" >> /etc/environment
echo "LIFECYCLE_HOOK_NAME=${_LIFECYCLE_HOOK_NAME_}" >> /etc/environment
echo "ASG_NAME=${_ASG_NAME_}" >> /etc/environment
source /etc/environment

apt-get -yqq update
apt-get -yqq install awscli jq unzip python3-pip
apt install unzip

cd /opt

echo "Downloading assets zip file"
aws s3 cp $ASSETS_S3_PATH ./assets.zip
unzip -q assets.zip

echo "Install and configure CloudWatch agent"
wget -q https://s3.amazonaws.com/amazoncloudwatch-agent/ubuntu/amd64/latest/amazon-cloudwatch-agent.deb
sudo dpkg -i -E amazon-cloudwatch-agent.deb

echo 'Configuring CloudWatch Agent'
mkdir -p /opt/aws/amazon-cloudwatch-agent/etc/
cp /opt/cw-agent.json /opt/aws/amazon-cloudwatch-agent/etc/custom-amazon-cloudwatch-agent.json

echo "Starting CloudWatch Agent"
/opt/aws/amazon-cloudwatch-agent/bin/amazon-cloudwatch-agent-ctl \
-a fetch-config -c file:/opt/aws/amazon-cloudwatch-agent/etc/custom-amazon-cloudwatch-agent.json -m ec2 -s
systemctl status amazon-cloudwatch-agent

case $SOLANA_CLUSTER in
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
    echo "Solana cluster id is not valid: $SOLANA_CLUSTER"
    exit 1
    ;;
esac

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

echo "Waiting for volumes to be available"
sleep 60

if [[ "$DATA_VOLUME_TYPE" == "instance-store" ]]; then
  echo "Data volume type is instance store"

  cd /opt
  sudo chmod +x /opt/setup-instance-store-volumes.sh

  (crontab -l; echo "@reboot /opt/setup-instance-store-volumes.sh >/tmp/setup-instance-store-volumes.log 2>&1") | crontab -
  crontab -l

  sudo /opt/setup-instance-store-volumes.sh

else
  echo "Data volume type is EBS"

  DATA_VOLUME_ID=/dev/$(lsblk -lnb | awk -v VOLUME_SIZE_BYTES="$DATA_VOLUME_SIZE" '{if ($4== VOLUME_SIZE_BYTES) {print $1}}')
  sudo mkfs -t xfs $DATA_VOLUME_ID
  sleep 10
  DATA_VOLUME_UUID=$(lsblk -fn -o UUID  $DATA_VOLUME_ID)
  DATA_VOLUME_FSTAB_CONF="UUID=$DATA_VOLUME_UUID /var/solana/data xfs defaults 0 2"
  echo "DATA_VOLUME_ID="$DATA_VOLUME_ID
  echo "DATA_VOLUME_UUID="$DATA_VOLUME_UUID
  echo "DATA_VOLUME_FSTAB_CONF="$DATA_VOLUME_FSTAB_CONF
  echo $DATA_VOLUME_FSTAB_CONF | sudo tee -a /etc/fstab
  sudo mount -a
fi

if [[ "$ACCOUNTS_VOLUME_TYPE" == "instance-store" ]]; then
  echo "Accounts volume type is instance store"

  if [[ "$DATA_VOLUME_TYPE" != "instance-store" ]]; then
    cd /opt

    sudo chmod +x /opt/setup-instance-store-volumes.sh

    (crontab -l; echo "@reboot /opt/setup-instance-store-volumes.sh >/tmp/setup-instance-store-volumes.log 2>&1") | crontab -
    crontab -l

    sudo /opt/setup-instance-store-volumes.sh

  else
    echo "Data and Accounts volumes are instance stores and should be both configured by now"
  fi

else
  echo "Accounts volume type is EBS"
  ACCOUNTS_VOLUME_ID=/dev/$(lsblk -lnb | awk -v VOLUME_SIZE_BYTES="$ACCOUNTS_VOLUME_SIZE" '{if ($4== VOLUME_SIZE_BYTES) {print $1}}')
  sudo mkfs -t xfs $ACCOUNTS_VOLUME_ID
  sleep 10
  ACCOUNTS_VOLUME_UUID=$(lsblk -fn -o UUID $ACCOUNTS_VOLUME_ID)
  ACCOUNTS_VOLUME_FSTAB_CONF="UUID=$ACCOUNTS_VOLUME_UUID /var/solana/accounts xfs defaults 0 2"
  echo "ACCOUNTS_VOLUME_ID="$ACCOUNTS_VOLUME_ID
  echo "ACCOUNTS_VOLUME_UUID="$ACCOUNTS_VOLUME_UUID
  echo "ACCOUNTS_VOLUME_FSTAB_CONF="$ACCOUNTS_VOLUME_FSTAB_CONF
  echo $ACCOUNTS_VOLUME_FSTAB_CONF | sudo tee -a /etc/fstab

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

if [[ "$SOLANA_NODE_TYPE" == "consensus" ]]; then
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

mv /opt/solana/node-consensus-template.sh /home/solana/bin/validator.sh
fi

if [[ "$SOLANA_NODE_TYPE" == "baserpc" ]]; then
  mv /opt/solana/node-light-rpc-template.sh /home/solana/bin/validator.sh
fi

if [[ "$SOLANA_NODE_TYPE" == "extendedrpc" ]]; then
  mv /opt/solana/node-heavy-rpc-template.sh /home/solana/bin/validator.sh
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
sudo mv /opt/sync-checker/syncchecker-solana.sh /opt/syncchecker.sh
sudo chmod +x /opt/syncchecker.sh

(crontab -l; echo "*/1 * * * * /opt/syncchecker.sh >/tmp/syncchecker.log 2>&1") | crontab -
crontab -l

if [[ "$LIFECYCLE_HOOK_NAME" != "none" ]]; then
  echo "Signaling ASG lifecycle hook to complete"
  TOKEN=$(curl -s -X PUT "http://169.254.169.254/latest/api/token" -H "X-aws-ec2-metadata-token-ttl-seconds: 21600")
  INSTANCE_ID=$(curl -H "X-aws-ec2-metadata-token: $TOKEN" -s http://169.254.169.254/latest/meta-data/instance-id)
  aws autoscaling complete-lifecycle-action --lifecycle-action-result CONTINUE --instance-id $INSTANCE_ID --lifecycle-hook-name "$LIFECYCLE_HOOK_NAME" --auto-scaling-group-name "$ASG_NAME"  --region $AWS_REGION
fi

echo "All Done!!"
