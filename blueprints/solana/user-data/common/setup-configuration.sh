#!/bin/bash
# Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
# SPDX-License-Identifier: Apache-2.0

# Solana system configuration and kernel tuning
# Applies sysctl settings required for optimal Solana validator performance

set -e

echo "Applying Solana system configuration..."

# Kernel tuning for Solana
cat > /etc/sysctl.d/20-solana-additionals.conf <<EOF
kernel.hung_task_timeout_secs=600
vm.stat_interval=10
vm.dirty_ratio=40
vm.dirty_background_ratio=10
vm.dirty_expire_centisecs=36000
vm.dirty_writeback_centisecs=3000
vm.dirtytime_expire_seconds=43200
kernel.timer_migration=0
kernel.pid_max=65536
net.ipv4.tcp_fastopen=3
fs.nr_open=1000000
EOF

cat > /etc/sysctl.d/20-solana-mmaps.conf <<EOF
# Increase memory mapped files limit (required for Solana accounts DB)
vm.max_map_count=1000000
EOF

cat > /etc/sysctl.d/20-solana-udp-buffers.conf <<EOF
# Increase UDP buffer size (required for Solana gossip protocol)
net.core.rmem_default=134217728
net.core.rmem_max=134217728
net.core.wmem_default=134217728
net.core.wmem_max=134217728
EOF

# Apply sysctl settings
sysctl -p /etc/sysctl.d/20-solana-mmaps.conf
sysctl -p /etc/sysctl.d/20-solana-udp-buffers.conf
sysctl -p /etc/sysctl.d/20-solana-additionals.conf

# Increase systemd default file descriptor and memory lock limits
if ! grep -q "DefaultLimitNOFILE=1000000" /etc/systemd/system.conf; then
    echo "DefaultLimitNOFILE=1000000" >> /etc/systemd/system.conf
fi
if ! grep -q "DefaultLimitMEMLOCK=2000000000" /etc/systemd/system.conf; then
    echo "DefaultLimitMEMLOCK=2000000000" >> /etc/systemd/system.conf
fi

# Set per-process file descriptor limit
cat > /etc/security/limits.d/90-solana-nofiles.conf <<EOF
# Increase process file descriptor count limit for Solana
* - nofile 1000000
# Increase memory locked limit (kB)
* - memlock 2000000000
EOF

# Create bcuser if it doesn't exist
if ! id bcuser &>/dev/null; then
    useradd -m -s /bin/bash bcuser
    echo "Created bcuser account"
fi

mkdir -p /home/bcuser/bin
mkdir -p /home/bcuser/config
chown -R bcuser:bcuser /home/bcuser

echo "Solana system configuration applied successfully"
