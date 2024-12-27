#!/bin/bash
set +e

touch /etc/cdk_environment
chmod 600 /etc/cdk_environment
{
  echo "AWS_REGION=${_AWS_REGION_}"
  echo "ASSETS_S3_PATH=${_ASSETS_S3_PATH_}"
  echo "STACK_NAME=${_STACK_NAME_}"
  echo "STACK_ID=${_STACK_ID_}"
  echo "RESOURCE_ID=${_NODE_CF_LOGICAL_ID_}"
  echo "ACCOUNTS_VOLUME_TYPE=${_ACCOUNTS_VOLUME_TYPE_}"
  echo "ACCOUNTS_VOLUME_SIZE=${_ACCOUNTS_VOLUME_SIZE_}"
  echo "DATA_VOLUME_TYPE=${_DATA_VOLUME_TYPE_}"
  echo "DATA_VOLUME_SIZE=${_DATA_VOLUME_SIZE_}"
  echo "SOLANA_VERSION=${_SOLANA_VERSION_}"
  echo "SOLANA_NODE_TYPE=${_SOLANA_NODE_TYPE_}"
  echo "NODE_IDENTITY_SECRET_ARN=${_NODE_IDENTITY_SECRET_ARN_}"
  echo "VOTE_ACCOUNT_SECRET_ARN=${_VOTE_ACCOUNT_SECRET_ARN_}"
  echo "AUTHORIZED_WITHDRAWER_ACCOUNT_SECRET_ARN=${_AUTHORIZED_WITHDRAWER_ACCOUNT_SECRET_ARN_}"
  echo "REGISTRATION_TRANSACTION_FUNDING_ACCOUNT_SECRET_ARN=${_REGISTRATION_TRANSACTION_FUNDING_ACCOUNT_SECRET_ARN_}"
  echo "SOLANA_CLUSTER=${_SOLANA_CLUSTER_}"
  echo "LIFECYCLE_HOOK_NAME=${_LIFECYCLE_HOOK_NAME_}"
  echo "ASG_NAME=${_ASG_NAME_}"
} >> /etc/cdk_environment
source /etc/cdk_environment

TOKEN=$(curl -s -X PUT "http://169.254.169.254/latest/api/token" -H "X-aws-ec2-metadata-token-ttl-seconds: 21600")
INSTANCE_ID=$(curl -H "X-aws-ec2-metadata-token: $TOKEN" -s http://169.254.169.254/latest/meta-data/instance-id)

apt-get -yqq update
apt-get -yqq install jq unzip python3-pip chrony

if [ "$ARCH" == "x86_64" ]; then
  CW_AGENT_BINARY_URI=https://s3.amazonaws.com/amazoncloudwatch-agent/ubuntu/amd64/latest/amazon-cloudwatch-agent.deb
  AWS_CLI_BINARY_URI=https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip
else
  CW_AGENT_BINARY_URI=https://s3.amazonaws.com/amazoncloudwatch-agent/ubuntu/arm64/latest/amazon-cloudwatch-agent.deb
  AWS_CLI_BINARY_URI=https://awscli.amazonaws.com/awscli-exe-linux-aarch64.zip
fi

cd /opt || exit 1

ARCH=$(uname -m)

echo "Intalling AWS CLI"
curl "$AWS_CLI_BINARY_URI" -o "awscliv2.zip"
unzip awscliv2.zip
/opt/aws/install

echo "Downloading assets zip file"
aws s3 cp $ASSETS_S3_PATH ./assets.zip --region $AWS_REGION
unzip -q assets.zip

echo 'Preparing fs for node configuration'
mkdir /data
mkdir /data/data
mkdir /data/accounts

echo 'Adding bcuser user and group'
groupadd -g 1002 bcuser
useradd -u 1002 -g 1002 -m -s /bin/bash bcuser
usermod -aG bcuser bcuser

mkdir /home/bcuser/bin
chown bcuser:bcuser /home/bcuser/bin

echo "Setting up the node"
# shellcheck disable=SC1101
/opt/node/setup.sh \
"$SOLANA_VERSION" "$SOLANA_NODE_TYPE" "$SOLANA_CLUSTER" \
"$NODE_IDENTITY_SECRET_ARN" \
"$VOTE_ACCOUNT_SECRET_ARN" \
"$AUTHORIZED_WITHDRAWER_ACCOUNT_SECRET_ARN" \
"$REGISTRATION_TRANSACTION_FUNDING_ACCOUNT_SECRET_ARN"

# If in Single Node stack (have Stack ID), configuring ClodFormation helpers to signal the completion of deployment"
if [[ "$STACK_ID" != "none" ]]; then
  #If cfn-signal is not available, install it
  if ! command -v cfn-signal &> /dev/null
  then
    echo "cfn-signal could not be found, installing"
    /opt/instance/cfn-hup/setup.sh "$STACK_NAME" "$AWS_REGION"
  else
    echo "cfn-signal is available, skipping installation"
  fi
  cfn-signal --stack "$STACK_NAME" --resource "$RESOURCE_ID" --region "$AWS_REGION"
fi

echo "Waiting for volumes to be available"
sleep 60

if [[ "$DATA_VOLUME_TYPE" == "instance-store" ]]; then
  echo "Data volume type is instance store"

  (crontab -l; echo "@reboot /opt/instance/storage/setup.sh /data/data xfs > /tmp/setup-store-volume-data.log 2>&1") | crontab -
  crontab -l

  /opt/instance/storage/setup.sh /data/data xfs
else
  echo "Data volume type is EBS"
  /opt/instance/storage/setup.sh /data/data xfs "$DATA_VOLUME_SIZE"
fi

if [[ "$ACCOUNTS_VOLUME_TYPE" == "instance-store" ]]; then
  echo "Accounts volume type is instance store"
    (crontab -l; echo "@reboot /opt/instance/storage/setup.sh /data/accounts xfs > /tmp/setup-store-volume-accounts.log 2>&1") | crontab -
    crontab -l

    /opt/instance/storage/setup.sh /data/accounts xfs
else
  echo "Accounts volume type is EBS"
  /opt/instance/storage/setup.sh /data/accounts xfs "$ACCOUNTS_VOLUME_SIZE"
fi

if [[ "$STACK_ID" != "none" ]]; then
  /opt/instance/storage/update-cloudwatch-dashboard.sh "$STACK_NAME-$INSTANCE_ID"
fi

echo 'Install & configure CloudWatch Agent'
wget -q $CW_AGENT_BINARY_URI
dpkg -i -E amazon-cloudwatch-agent.deb

mkdir -p /opt/aws/amazon-cloudwatch-agent/etc/
cp /opt/cw-agent.json /opt/aws/amazon-cloudwatch-agent/etc/custom-amazon-cloudwatch-agent.json

echo "Starting CloudWatch Agent"
/opt/aws/amazon-cloudwatch-agent/bin/amazon-cloudwatch-agent-ctl \
-a fetch-config -c file:/opt/aws/amazon-cloudwatch-agent/etc/custom-amazon-cloudwatch-agent.json -m ec2 -s
systemctl restart amazon-cloudwatch-agent

systemctl daemon-reload

echo "Starting up the node service"
systemctl enable --now node

echo "Configuring and starting sync-checker"
/opt/sync-checker/setup.sh "/opt/sync-checker/syncchecker.sh"

if [[ "$LIFECYCLE_HOOK_NAME" != "none" ]]; then
  echo "Signaling ASG lifecycle hook to complete"
  TOKEN=$(curl -s -X PUT "http://169.254.169.254/latest/api/token" -H "X-aws-ec2-metadata-token-ttl-seconds: 21600")
  INSTANCE_ID=$(curl -H "X-aws-ec2-metadata-token: $TOKEN" -s http://169.254.169.254/latest/meta-data/instance-id)
  aws autoscaling complete-lifecycle-action --lifecycle-action-result CONTINUE --instance-id $INSTANCE_ID --lifecycle-hook-name "$LIFECYCLE_HOOK_NAME" --auto-scaling-group-name "$ASG_NAME"  --region $AWS_REGION
fi

echo "All Done!!"
