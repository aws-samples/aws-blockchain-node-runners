#!/bin/bash
set +e

source /etc/environment

echo "Setting up s3-sync as service"
cat >/etc/systemd/system/s3-sync.service <<EOL
[Unit]
Description="Sync S3 with node data"

[Service]
User=tezos
Group=tezos
ExecStart=/opt/copy-data-to-s3.sh

[Install]
WantedBy=multi-user.target
EOL

systemctl enable s3-sync.service
echo "Running S3-sync"
systemctl start s3-sync.service

# Run every minute
echo "Setting up s3 sync"
cat >/etc/systemd/system/s3-sync.timer <<EOL
[Unit]
Description="Run Sync checker service everydat at 1 AM"

[Timer]
OnCalendar=Mon..Sun *-*-* 1:00:00
Unit=s3-sync.service

[Install]
WantedBy=multi-user.target
EOL

echo "Starting s3-sync timer"
systemctl start s3-sync.timer
systemctl enable s3-sync.timer
