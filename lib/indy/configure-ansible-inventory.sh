#!/bin/bash

STEWARD1=$(jq -r .[].steward1Output ./indy-test-deploy-output.json)
STEWARD2=$(jq -r .[].steward2Output ./indy-test-deploy-output.json)
STEWARD3=$(jq -r .[].steward3Output ./indy-test-deploy-output.json)
STEWARD4=$(jq -r .[].steward4Output ./indy-test-deploy-output.json)

TRUSTEE1=$(jq -r .[].trustee1Output ./indy-test-deploy-output.json)
TRUSTEE2=$(jq -r .[].trustee2Output ./indy-test-deploy-output.json)
TRUSTEE3=$(jq -r .[].trustee3Output ./indy-test-deploy-output.json)

ANSIBLE_BUCKET_NAME=$(jq -r .[].AnsibleFileTransferBucketName ./indy-test-deploy-output.json)
AWS_DEPLOYMENT_REGION=$(jq -r .[].DeploymentRegion ./indy-test-deploy-output.json)

cp ./ansible/inventory/inventory.yml.template ./ansible/inventory/inventory.yml

sed -i "s/_steward1InstanceId_/$STEWARD1/" ./ansible/inventory/inventory.yml
sed -i "s/_steward2InstanceId_/$STEWARD2/" ./ansible/inventory/inventory.yml
sed -i "s/_steward3InstanceId_/$STEWARD3/" ./ansible/inventory/inventory.yml
sed -i "s/_steward4InstanceId_/$STEWARD4/" ./ansible/inventory/inventory.yml

sed -i "s/_trustee1InstanceId_/$TRUSTEE1/" ./ansible/inventory/inventory.yml
sed -i "s/_trustee2InstanceId_/$TRUSTEE2/" ./ansible/inventory/inventory.yml
sed -i "s/_trustee3InstanceId_/$TRUSTEE3/" ./ansible/inventory/inventory.yml

sed -i "s/_ansible-file-transfer-bucket_/$ANSIBLE_BUCKET_NAME/" ./ansible/inventory/inventory.yml
sed -i "s/_aws_region_/$AWS_DEPLOYMENT_REGION/" ./ansible/inventory/inventory.yml