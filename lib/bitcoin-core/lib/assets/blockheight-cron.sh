#!/bin/bash
# This script is used to set up a cron job to send the Bitcoin block height to Amazon CloudWatch every 5 minutes.
REGION=${AWS_REGION}
(crontab -l 2>/dev/null; echo "*/5 * * * * sudo /usr/bin/docker exec bitcoind bitcoin-cli getblockcount | xargs -I {} sudo /usr/bin/aws cloudwatch put-metric-data --metric-name BlockHeight --namespace Bitcoin --unit Count --value {} --region $REGION") | crontab -
