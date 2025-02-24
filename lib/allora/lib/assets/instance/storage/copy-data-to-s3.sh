#!/bin/bash
set +e
source /etc/cdk_environment

/usr/local/bin/docker-compose -f /home/bcuser/docker-compose.yml down
echo "Sync started at " $(date)
s5cmd --log error sync /data $SNAPSHOT_S3_PATH/
echo "Sync finished at " $(date)
sudo touch /data/snapshotted
sudo su bcuser
docker compose -f /home/bcuser/docker-compose.yml up -d
