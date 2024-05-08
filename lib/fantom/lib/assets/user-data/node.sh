#!/bin/bash
set +e

{ echo "AWS_REGION=${_AWS_REGION_}"
  echo "ASSETS_S3_PATH=${_ASSETS_S3_PATH_}"
  echo "FANTOM_SNAPSHOTS_URI=${_FANTOM_SNAPSHOTS_URI_}"
  echo "STACK_NAME=${_STACK_NAME_}"
  echo "STACK_ID=${_STACK_ID_}"
  echo "RESOURCE_ID=${_NODE_CF_LOGICAL_ID_}"
  echo "DATA_VOLUME_TYPE=${_DATA_VOLUME_TYPE_}"
  echo "DATA_VOLUME_SIZE=${_DATA_VOLUME_SIZE_}"
  echo "FANTOM_NODE_TYPE=${_FANTOM_NODE_TYPE_}"
  echo "FANTOM_NETWORK=${_FANTOM_NETWORK_}"
  echo "LIFECYCLE_HOOK_NAME=${_LIFECYCLE_HOOK_NAME_}"
  echo "AUTOSCALING_GROUP_NAME=${_AUTOSCALING_GROUP_NAME_}"
  echo "NODE_ROLE=${_NODE_ROLE_}"
  } >> /etc/environment

source /etc/environment

exec > >(tee /var/log/user-data.log|logger -t user-data -s 2>/dev/console) 2>&1

sleep 10

apt -yqq update
apt -yqq install awscli unzip jq python3-pip axel pigz build-essential git

echo "Assigning Swap Space"
# Check if a swap file already exists
if [ -f /swapfile ]; then
  # Remove the existing swap file
  swapoff /swapfile
  rm -rf /swapfile
fi

# Create a new swap file
total_mem=$(grep MemTotal /proc/meminfo | awk '{print $2}')
# Calculate the swap size
swap_size=$((total_mem / 3))
# Convert the swap size to MB
swap_size_mb=$((swap_size / 1024))
unit=M
fallocate -l $swap_size_mb$unit /swapfile
chmod 600 /swapfile
mkswap /swapfile
swapon /swapfile

# Enable the swap space to persist after reboot.
echo "/swapfile none swap sw 0 0" | sudo tee -a /etc/fstab

sysctl vm.swappiness=6
sysctl vm.vfs_cache_pressure=10
echo "vm.swappiness=10" | sudo tee -a /etc/sysctl.conf
echo "vm.vfs_cache_pressure=10"  | sudo tee -a /etc/sysctl.conf

free -h



# Download golang
mkdir -p temp && cd temp
wget https://go.dev/dl/go1.19.3.linux-amd64.tar.gz
sudo tar -xvf go1.19.3.linux-amd64.tar.gz
sudo rm -rf /usr/local/go
sudo mv go /usr/local/
rm go1.19.3.linux-amd64.tar.gz

# Setup golang environment variables
echo 'export GOROOT=/usr/local/go' > ~/.bash_aliases
echo 'export GOPATH=$HOME/go' >> ~/.bash_aliases
echo 'export PATH=$GOPATH/bin:$GOROOT/bin:$PATH' >> ~/.bash_aliases
source ~/.bash_aliases

echo 'export GOROOT=/usr/local/go
export GOPATH=$HOME/go
export PATH=$GOPATH/bin:$GOROOT/bin:$PATH' > /etc/profile.d/custom-path.sh

cd /opt

echo "Downloading assets zip file"
aws s3 cp $ASSETS_S3_PATH ./assets.zip --region $AWS_REGION
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

echo 'Adding bcuser user and group'
sudo groupadd -g 1002 bcuser
sudo useradd -u 1002 -g 1002 -m -s /bin/bash bcuser
sudo usermod -aG sudo bcuser

echo "Install FANTOM client"

sudo su -l bcuser -c "git clone https://github.com/Fantom-foundation/go-opera.git && \
  cd go-opera/ && \
  git checkout release/1.1.3-rc.5 && \
  make"

  
echo 'Configuring FANTOM Node service as a system service'
# Copy startup script to correct location
if [[ "$FANTOM_NODE_TYPE" == "read" ]]; then
  sudo mkdir /home/bcuser/bin
  sudo mv /opt/fantom/read-template.sh /home/bcuser/bin/node.sh
fi

sudo chmod +x /home/bcuser/bin/node.sh
sudo chown bcuser:bcuser -R /home/bcuser/


if [[ "$STACK_ID" != "none" ]]; then
  echo "Install CloudFormation helper scripts"
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

fi

echo "Starting FANTOM as a service"
sudo bash -c 'cat > /etc/systemd/system/fantom.service <<EOF
[Unit]
Description=FANTOM Node
After=network-online.target
[Service]
Type=simple
Restart=always
RestartSec=30
User=bcuser
Environment="PATH=/bin:/usr/bin:/home/bcuser/bin"
ExecStart=/home/bcuser/bin/node.sh
[Install]
WantedBy=multi-user.target
EOF'

echo "Configuring syncchecker script"
cd /opt
mv /opt/fantom-checker/syncchecker-fantom.sh /opt/syncchecker.sh
chmod +x /opt/syncchecker.sh


(crontab -l; echo "*/1 * * * * /opt/syncchecker.sh >/tmp/syncchecker.log 2>&1") | crontab -
crontab -l

if [ "$NODE_ROLE" == "single-node"  ]; then
  echo "Single node. Signaling completion to CloudFormation"
  cfn-signal --stack $STACK_NAME --resource $RESOURCE_ID --region $AWS_REGION
fi

if [ "$NODE_ROLE" == "single-node"  ]; then
  echo "Single node. Wait for one minute for the volume to be available"
  sleep 60
fi

mkdir -p /data

if [[ "$DATA_VOLUME_TYPE" == "instance-store" ]]; then
  echo "Data volume type is instance store"

  cd /opt
  chmod +x /opt/setup-instance-store-volumes.sh

  (crontab -l; echo "@reboot /opt/setup-instance-store-volumes.sh >/tmp/setup-instance-store-volumes.log 2>&1") | crontab -
  crontab -l

  /opt/setup-instance-store-volumes.sh

else
  echo "Data volume type is EBS"

  DATA_VOLUME_ID=/dev/$(lsblk -lnb | awk -v VOLUME_SIZE_BYTES="$DATA_VOLUME_SIZE" '{if ($4== VOLUME_SIZE_BYTES) {print $1}}')
  mkfs -t ext4 $DATA_VOLUME_ID
  sleep 10
  DATA_VOLUME_UUID=$(lsblk -fn -o UUID  $DATA_VOLUME_ID)
  DATA_VOLUME_FSTAB_CONF="UUID=$DATA_VOLUME_UUID /data ext4 defaults 0 2"
  echo "DATA_VOLUME_ID="$DATA_VOLUME_ID
  echo "DATA_VOLUME_UUID="$DATA_VOLUME_UUID
  echo "DATA_VOLUME_FSTAB_CONF="$DATA_VOLUME_FSTAB_CONF
  echo $DATA_VOLUME_FSTAB_CONF | tee -a /etc/fstab
  mount -a
fi

lsblk -d

# download snapshot if network is mainnet
if [ "$FANTOM_NETWORK" == "mainnet"  ]; then
  echo "Downloading FANTOM snapshot"
  chmod +x /opt/download-snapshot.sh
  /opt/download-snapshot.sh
  if [ "$?" == 0 ]; then
    echo "Snapshot download successful"
  else
    echo "Snapshot download failed, falling back to fresh sync"
  fi
fi

# Download Genesis file
wget https://download.fantom.network/mainnet-109331-no-history.g -O /data/genesis.g

chown bcuser:bcuser -R /data

sudo systemctl daemon-reload
sudo systemctl enable --now fantom

if [[ "$LIFECYCLE_HOOK_NAME" != "none" ]]; then
  echo "Signaling ASG lifecycle hook to complete"
  TOKEN=$(curl -s -X PUT "http://169.254.169.254/latest/api/token" -H "X-aws-ec2-metadata-token-ttl-seconds: 21600")
  INSTANCE_ID=$(curl -H "X-aws-ec2-metadata-token: $TOKEN" -s http://169.254.169.254/latest/meta-data/instance-id)
  aws autoscaling complete-lifecycle-action --lifecycle-action-result CONTINUE --instance-id $INSTANCE_ID --lifecycle-hook-name "$LIFECYCLE_HOOK_NAME" --auto-scaling-group-name "$AUTOSCALING_GROUP_NAME"  --region $AWS_REGION
fi

echo "All Done!!"
set -e
