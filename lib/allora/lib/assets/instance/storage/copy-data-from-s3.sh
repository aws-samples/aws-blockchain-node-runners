#!/bin/bash

source /etc/cdk_environment
TOKEN=$(curl -s -X PUT "http://169.254.169.254/latest/api/token" -H "X-aws-ec2-metadata-token-ttl-seconds: 21600")
INSTANCE_ID=$(curl -H "X-aws-ec2-metadata-token: $TOKEN" -s http://169.254.169.254/latest/meta-data/instance-id)

echo "Sync started at " $(date)
SECONDS=0

s5cmd --log error cp --exclude 'lost+found' $SNAPSHOT_S3_PATH/data/* /data && \
chown -R bcuser:bcuser /data && \
echo "Sync finished at " $(date) && \
echo "$(($SECONDS / 60)) minutes and $(($SECONDS % 60)) seconds elapsed." && \
su bcuser && \
docker compose -f /home/bcuser/docker-compose.yml up -d && \
aws autoscaling complete-lifecycle-action --lifecycle-action-result CONTINUE --instance-id $INSTANCE_ID --lifecycle-hook-name "$LIFECYCLE_HOOK_NAME" --auto-scaling-group-name "$AUTOSCALING_GROUP_NAME"  --region $REGION  || \
aws autoscaling complete-lifecycle-action --lifecycle-action-result ABANDON --instance-id $INSTANCE_ID --lifecycle-hook-name "$LIFECYCLE_HOOK_NAME" --auto-scaling-group-name "$AUTOSCALING_GROUP_NAME"  --region $REGION
