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
--vote-account /home/solana/config/vote-account-keypair.json \
__KNOWN_VALIDATORS__ \
--expected-genesis-hash __EXPECTED_GENESIS_HASH__ \
__ENTRY_POINTS__ \
--rpc-port 8899 \
--no-port-check \
--wal-recovery-mode skip_any_corrupted_record \
--init-complete-file /var/solana/data/init-completed \
--limit-ledger-size 50000000 \
--accounts /var/solana/accounts \
--no-os-cpu-stats-reporting \
--no-os-memory-stats-reporting \
--no-os-network-stats-reporting \
--log -