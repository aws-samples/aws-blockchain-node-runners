#!/bin/bash

print_usage(){
  echo "Usage: node/setup.sh <SOLANA_VERSION> <SOLANA_NODE_TYPE> <SOLANA_CLUSTER> [NODE_IDENTITY_SECRET_ARN] [VOTE_ACCOUNT_SECRET_ARN] [AUTHORIZED_WITHDRAWER_ACCOUNT_SECRET_ARN] [REGISTRATION_TRANSACTION_FUNDING_ACCOUNT_SECRET_ARN]"
  echo "Required: <SOLANA_VERSION> <SOLANA_NODE_TYPE [consensus | baserpc | extendedrpc]> <SOLANA_CLUSTER [ mainnet-beta | testnet | devnet]>"
  echo "Optional: [NODE_IDENTITY_SECRET_ARN]"
  echo "Required only for consensus nodes: [VOTE_ACCOUNT_SECRET_ARN] [AUTHORIZED_WITHDRAWER_ACCOUNT_SECRET_ARN] [REGISTRATION_TRANSACTION_FUNDING_ACCOUNT_SECRET_ARN]"
}

if [ -n "$1" ]; then
  export SOLANA_VERSION=$1
else
  echo "Error: No Solana version is provided"
  print_usage
  exit 1
fi

if [ -n "$2" ]; then
  export SOLANA_NODE_TYPE=$2
else
  echo "Error: No Solana node type is provided"
  print_usage
  exit 1
fi

if [ -n "$3" ]; then
  export SOLANA_CLUSTER=$3
else
  echo "Error: No Solana cluster is provided"
  print_usage
  exit 1
fi

if [ -n "$4" ]; then
  export NODE_IDENTITY_SECRET_ARN=$4
else
  echo "No secret ARN for node identity is provided. Will generate one."
fi

if [ -n "$5" ]; then
  export VOTE_ACCOUNT_SECRET_ARN=$5
else
  echo "No secret ARN for vote account is provided. Will generate one."
fi

if [ -n "$6" ]; then
  export AUTHORIZED_WITHDRAWER_ACCOUNT_SECRET_ARN=$6
else
  echo "No secret ARN for authorized withdrawer account is provided. Will generate one."
fi

if [ -n "$7" ]; then
  export REGISTRATION_TRANSACTION_FUNDING_ACCOUNT_SECRET_ARN=$7
else
  if [ "$SOLANA_NODE_TYPE" == "consensus" ]; then
    echo "Error: No secret ARN for registration transaction funding account is provided."
    print_usage
    exit 1
  fi
fi

echo "Fine tune sysctl to prepare the system for Solana"
bash -c "cat >/etc/sysctl.d/20-solana-additionals.conf <<EOF
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

bash -c "cat >/etc/sysctl.d/20-solana-mmaps.conf <<EOF
# Increase memory mapped files limit
vm.max_map_count = 1000000
EOF"

bash -c "cat >/etc/sysctl.d/20-solana-udp-buffers.conf <<EOF
# Increase UDP buffer size
net.core.rmem_default = 134217728
net.core.rmem_max = 134217728
net.core.wmem_default = 134217728
net.core.wmem_max = 134217728
EOF"

bash -c "echo 'DefaultLimitNOFILE=1000000' >> /etc/systemd/system.conf"

sysctl -p /etc/sysctl.d/20-solana-mmaps.conf
sysctl -p /etc/sysctl.d/20-solana-udp-buffers.conf
sysctl -p /etc/sysctl.d/20-solana-additionals.conf

bash -c "cat >/etc/security/limits.d/90-solana-nofiles.conf <<EOF
# Increase process file descriptor count limit
* - nofile 1000000
EOF"

echo "Build binaries for version v$SOLANA_VERSION"
/opt/node/build-binaries.sh $SOLANA_VERSION
# continue only if the previous script has finished
if [ "$?" == 0 ]; then
  echo "Build successful"
else
  echo "Build failed"
fi

echo "Preparing node start script"

cd /home/bcuser/bin

if [[ $NODE_IDENTITY_SECRET_ARN == "none" ]]; then
    echo "Create node identity"
    ./solana-keygen new --no-passphrase -o /home/bcuser/config/validator-keypair.json
else
    echo "Get node identity from AWS Secrets Manager"
    aws secretsmanager get-secret-value --secret-id $NODE_IDENTITY_SECRET_ARN --query SecretString --output text --region $AWS_REGION > ~/validator-keypair.json
    mv ~/validator-keypair.json /home/bcuser/config/validator-keypair.json
fi
if [[ "$SOLANA_NODE_TYPE" == "consensus" ]]; then
    if [[ $NODE_IDENTITY_SECRET_ARN == "none" ]]; then
        echo "Store node identity to AWS Secrets Manager"
        NODE_IDENTITY=$(./solana-keygen pubkey /home/bcuser/config/vote-account-keypair.json)
        aws secretsmanager create-secret --name "solana-node/"$NODE_IDENTITY --description "Solana Node Identity Secret created for stack $CF_STACK_NAME" --secret-string file:///home/bcuser/config/validator-keypair.json --region $AWS_REGION
    fi
    if [[ $VOTE_ACCOUNT_SECRET_ARN == "none" ]]; then
        echo "Create Vote Account Secret"
        ./solana-keygen new --no-passphrase -o /home/bcuser/config/vote-account-keypair.json
        NODE_IDENTITY=$(./solana-keygen pubkey /home/bcuser/config/vote-account-keypair.json)
        echo "Store Vote Account Secret to AWS Secrets Manager"
        aws secretsmanager create-secret --name "solana-node/"$NODE_IDENTITY --description "Solana Vote Account Secret created for stack $CF_STACK_NAME" --secret-string file:///home/bcuser/config/vote-account-keypair.json --region $AWS_REGION
        if [[ $AUTHORIZED_WITHDRAWER_ACCOUNT_SECRET_ARN == "none" ]]; then
            echo "Create Authorized Withdrawer Account Secret"
            ./solana-keygen new --no-passphrase -o /home/bcuser/config/authorized-withdrawer-keypair.json
            NODE_IDENTITY=$(./solana-keygen pubkey /home/bcuser/config/authorized-withdrawer-keypair.json)
            echo "Store Authorized Withdrawer Account  to AWS Secrets Manager"
            aws secretsmanager create-secret --name "solana-node/"$NODE_IDENTITY --description "Authorized Withdrawer Account Secret created for stack $CF_STACK_NAME" --secret-string file:///home/bcuser/config/authorized-withdrawer-keypair.json --region $AWS_REGION
        else
            echo "Get Authorized Withdrawer Account Secret from AWS Secrets Manager"
            aws secretsmanager get-secret-value --secret-id $AUTHORIZED_WITHDRAWER_ACCOUNT_SECRET_ARN --query SecretString --output text --region $AWS_REGION > ~/authorized-withdrawer-keypair.json
            mv ~/authorized-withdrawer-keypair.json /home/bcuser/config/authorized-withdrawer-keypair.json
        fi
        if [[ $REGISTRATION_TRANSACTION_FUNDING_ACCOUNT_SECRET_ARN != "none" ]]; then
          echo "Get Registration Transaction Funding Account Secret from AWS Secrets Manager"
          aws secretsmanager get-secret-value --secret-id $REGISTRATION_TRANSACTION_FUNDING_ACCOUNT_SECRET_ARN --query SecretString --output text --region $AWS_REGION > ~/id.json
          mkdir -p /root/.config/solana
          mv ~/id.json /root/.config/solana/id.json
          echo "Creating Vote Account on-chain"
          ./solana create-vote-account /home/bcuser/config/vote-account-keypair.json /home/bcuser/config/validator-keypair.json /home/bcuser/config/authorized-withdrawer-keypair.json
          echo "Delete Transaction Funding Account Secret from the local disc"
          rm  /root/.config/solana/id.json
        else
          echo "Vote Account not created. Please create it manually: https://docs.solana.com/running-validator/validator-start#create-vote-account"
        fi
        echo "Delete Authorized Withdrawer Account from the local disc"
        rm /home/bcuser/config/authorized-withdrawer-keypair.json
    else
        echo "Get Vote Account Secret from AWS Secrets Manager"
        aws secretsmanager get-secret-value --secret-id $VOTE_ACCOUNT_SECRET_ARN --query SecretString --output text --region $AWS_REGION > ~/vote-account-keypair.json
        mv ~/vote-account-keypair.json /home/bcuser/config/vote-account-keypair.json
    fi
mv /opt/node/node-consensus-template.sh /home/bcuser/bin/node-service.sh
fi

if [[ "$SOLANA_NODE_TYPE" == "baserpc" ]]; then
  mv /opt/node/node-base-rpc-template.sh /home/bcuser/bin/node-service.sh
fi

if [[ "$SOLANA_NODE_TYPE" == "extendedrpc" ]]; then
  mv /opt/node/node-extended-rpc-template.sh /home/bcuser/bin/node-service.sh
fi

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

sed -i "s;__SOLANA_METRICS_CONFIG__;\"$SOLANA_METRICS_CONFIG\";g" /home/bcuser/bin/node-service.sh
sed -i "s/__EXPECTED_GENESIS_HASH__/$EXPECTED_GENESIS_HASH/g" /home/bcuser/bin/node-service.sh
sed -i "s/__KNOWN_VALIDATORS__/$KNOWN_VALIDATORS/g" /home/bcuser/bin/node-service.sh
sed -i "s/__ENTRY_POINTS__/$ENTRY_POINTS/g" /home/bcuser/bin/node-service.sh
chmod +x /home/bcuser/bin/node-service.sh

mkdir /data/data/ledger
ln -s /data/data/ledger /home/bcuser
chown -R bcuser:bcuser /data
chown -R bcuser:bcuser /home/bcuser

echo "Starting node as a service"

mv /opt/node/node.service /etc/systemd/system/node.service
systemctl daemon-reload
systemctl enable --now node
