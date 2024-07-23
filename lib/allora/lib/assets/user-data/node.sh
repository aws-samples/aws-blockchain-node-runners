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

echo "Updating and installing required system packages"
yum update -y
amazon-linux-extras install epel -y
yum groupinstall "Development Tools" -y
yum -y install amazon-cloudwatch-agent collectd jq gcc10-10.5.0-1.amzn2.0.2 ncurses-devel telnet aws-cfn-bootstrap

cd /opt

#install AWS CLI
echo 'Installing AWS CLI v2'
curl https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip -o "awscliv2.zip"
unzip -q awscliv2.zip
./aws/install
rm /usr/bin/aws
ln /usr/local/bin/aws /usr/bin/aws

cfn-signal -e $? --stack $STACK_NAME --resource $RESOURCE_ID --region $AWS_REGION

echo "----------------------------------------------"
echo "[user-data] Allora user-data script successful"
echo "----------------------------------------------"