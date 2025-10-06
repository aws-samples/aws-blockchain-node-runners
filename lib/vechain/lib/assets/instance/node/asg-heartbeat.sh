#!/bin/bash
set -x
# Write logs to /var/log/asg-heartbeat.log
exec > >(tee /var/log/asg-heartbeat.log | logger -t asg-heartbeat -s 2>/dev/console) 2>&1

source /etc/cdk_environment

# Sends a Auto Scaling lifecycle heartbeat to keep the instance in the launch hook from timing out
aws autoscaling record-lifecycle-action-heartbeat \
  --auto-scaling-group-name "$ASG_NAME" \
  --lifecycle-hook-name "$LIFECYCLE_HOOK_NAME" \
  --instance-id "$INSTANCE_ID" \
  --region "$AWS_REGION"
