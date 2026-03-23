#!/bin/bash
# check_vet_sequence.sh - publish Vechain best block to CloudWatch
set -x

# Write logs to /var/log/check_vet_sequence.log
exec > >(tee /var/log/check_vet_sequence.log | logger -t check_vet_sequence -s 2>/dev/console) 2>&1

# Region and Instance ID are set in the cdk_environment file
source /etc/cdk_environment

best_block=$(curl -s http://localhost/blocks/best | jq -r '.number // 0')

timestamp=$(date +"%Y-%m-%dT%H:%M:%S%:z")

# only push if best block call was successful
if [ -n "${best_block}" ] && [ "${best_block}" -ne 0 ]; then
  aws cloudwatch put-metric-data \
    --metric-name vet_best_block \
    --namespace CWAgent \
    --value "${best_block}" \
    --timestamp "${timestamp}" \
    --dimensions InstanceId="${INSTANCE_ID}" \
    --region "${AWS_REGION}"
fi
