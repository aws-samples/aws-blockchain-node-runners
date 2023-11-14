#!/bin/bash
set -o errexit
set -o nounset
set -o pipefail
# Remove empty snapshots
find "/var/solana/data/ledger" -name "snapshot-*" -size 0 -print -exec rm {} \; || true
export RUST_LOG=warning
export RUST_BACKTRACE=full
export SOLANA_METRICS_CONFIG=__SOLANA_METRICS_CONFIG__
/home/solana/bin/solana-validator \
--ledger /var/solana/data/ledger \
--identity /home/solana/config/validator-keypair.json \
__KNOWN_VALIDATORS__ \
--expected-genesis-hash __EXPECTED_GENESIS_HASH__ \
__ENTRY_POINTS__ \
--no-voting \
--snapshot-interval-slots 500 \
--maximum-local-snapshot-age 500 \
--full-rpc-api \
--rpc-port 8899 \
--gossip-port 8801 \
--dynamic-port-range 8800-8813 \
--no-port-check \
--wal-recovery-mode skip_any_corrupted_record \
--enable-rpc-transaction-history \
--enable-cpi-and-log-storage \
--init-complete-file /var/solana/data/init-completed \
--snapshot-compression none \
--require-tower \
--no-wait-for-vote-to-start-leader \
--limit-ledger-size 50000000 \
--accounts /var/solana/accounts \
--no-os-cpu-stats-reporting \
--no-os-memory-stats-reporting \
--no-os-network-stats-reporting \
--log -
