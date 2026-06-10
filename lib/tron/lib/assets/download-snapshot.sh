#!/bin/bash
set +e

# Bootstrap the TRON database from a snapshot. Three modes via TRON_SNAPSHOT_TYPE:
#   none   - skip (sync from genesis)
#   public - download from TRON's official public snapshot host
#            * lite node: aria2c multi-connection (fast) then extract  (needs ~2x data disk)
#            * full node: streamed wget|tar (disk-safe for ~3TB on a 4TB volume)
#   s3     - restore from your own private S3 staging bucket via s5cmd + zstd (streamed)
#            (fast + parallel + no double-disk; populate it with the snapshot node first)
#
# Inputs (env): TRON_SNAPSHOT_TYPE, TRON_NETWORK, TRON_NODE_TYPE, TRON_DB_ENGINE,
#               TRON_SNAPSHOTS_URL (public override), TRON_SNAPSHOT_S3_BUCKET (s3 mode)

source /etc/environment 2>/dev/null

DATA_DIR=/data
cd "$DATA_DIR" || exit 1

TYPE="${TRON_SNAPSHOT_TYPE:-public}"

if [ "$TYPE" == "none" ]; then
  echo "TRON_SNAPSHOT_TYPE=none. Skipping snapshot; node will sync from genesis."
  exit 0
fi

if [ "$TRON_NODE_TYPE" == "lite" ]; then
  SNAP_FILE="LiteFullNode_output-directory.tgz"
else
  SNAP_FILE="FullNode_output-directory.tgz"
fi

# ---------------------------------------------------------------------------
# S3 mode: restore from the private staging bucket (streamed, no double disk)
# ---------------------------------------------------------------------------
if [ "$TYPE" == "s3" ]; then
  if [ -z "$TRON_SNAPSHOT_S3_BUCKET" ] || [ "$TRON_SNAPSHOT_S3_BUCKET" == "none" ]; then
    echo "TRON_SNAPSHOT_TYPE=s3 but TRON_SNAPSHOT_S3_BUCKET is not set. Skipping; node will sync from genesis."
    echo "Deploy the snapshot node first to populate the bucket."
    exit 0
  fi
  if [ "$TRON_NODE_TYPE" == "lite" ]; then
    S3_FILE="LiteFullNode_output-directory.tar.zst"
  else
    S3_FILE="FullNode_output-directory.tar.zst"
  fi
  S3_KEY="${TRON_NETWORK}/${TRON_NODE_TYPE}/${S3_FILE}"
  echo "Restoring snapshot from s3://${TRON_SNAPSHOT_S3_BUCKET}/${S3_KEY} via s5cmd + zstd (streamed)"
  s5cmd cat "s3://${TRON_SNAPSHOT_S3_BUCKET}/${S3_KEY}" | zstd -dc -T0 | tar xf - -C "$DATA_DIR"
  status=${PIPESTATUS[0]}
  if [ "$status" -ne 0 ]; then
    echo "WARNING: S3 restore failed (s5cmd status $status). Node will sync from genesis."
  else
    echo "S3 snapshot restore complete at $(date '+%Y-%m-%d %H:%M:%S')"
  fi
  chown -R bcuser:bcuser "$DATA_DIR" 2>/dev/null
  exit 0
fi

# ---------------------------------------------------------------------------
# Public mode: resolve the official snapshot URL
# ---------------------------------------------------------------------------
SNAPSHOT_URL="$TRON_SNAPSHOTS_URL"
if [ -z "$SNAPSHOT_URL" ] || [ "$SNAPSHOT_URL" == "none" ]; then
  if [ "$TRON_NETWORK" == "nile" ]; then
    echo "WARNING: no default Nile RocksDB snapshot. Set TRON_SNAPSHOTS_URL or the node syncs from genesis."
    exit 0
  fi
  # Official mainnet RocksDB source (America). Auto-discover the latest dated backup dir.
  # Integrity note: this is TRON's official public snapshot host but is plain HTTP from a bare IP,
  # so it provides no transport integrity. Override with TRON_SNAPSHOTS_URL to use a trusted/HTTPS
  # mirror. TRON does not currently publish a snapshot checksum; add verification here if one exists.
  SNAP_HOST="http://35.197.17.205"
  LATEST_DIR=$(curl -s --max-time 30 "$SNAP_HOST/" | grep -oE 'backup[0-9]{8}/' | sort -u | tail -1)
  if [ -z "$LATEST_DIR" ]; then
    echo "WARNING: could not auto-discover latest snapshot dir on $SNAP_HOST. Syncing from genesis."
    exit 0
  fi
  SNAPSHOT_URL="$SNAP_HOST/$LATEST_DIR$SNAP_FILE"
fi
echo "Public snapshot URL: $SNAPSHOT_URL"

if [ "$TRON_NODE_TYPE" == "full" ]; then
  # Full node ~3TB. aria2c parallel (~3x faster) needs ~2x disk (archive + extracted, ~6TB).
  # Use it only if the data volume has room; otherwise stream to stay within a 4TB volume.
  FREE_BYTES=$(df --output=avail -B1 "$DATA_DIR" | tail -1 | tr -d ' ')
  NEED_BYTES=$(( 6 * 1024 * 1024 * 1024 * 1024 ))
  if [ -n "$FREE_BYTES" ] && [ "$FREE_BYTES" -gt "$NEED_BYTES" ]; then
    echo "Full node: volume has room ($(df -h "$DATA_DIR" | tail -1 | awk '{print $4}') free), using aria2c multi-connection at $(date '+%Y-%m-%d %H:%M:%S')"
    aria2c -s16 -x16 -k100M --max-tries=0 --retry-wait=10 "$SNAPSHOT_URL" -d "$DATA_DIR" -o snapshot.tgz
    if [ $? -eq 0 ]; then
      tar --use-compress-program="pigz -d" -xf "$DATA_DIR/snapshot.tgz" -C "$DATA_DIR" && rm -f "$DATA_DIR/snapshot.tgz"
      echo "Snapshot extracted at $(date '+%Y-%m-%d %H:%M:%S')"
    else
      echo "WARNING: aria2c download failed. Node will sync from genesis."
    fi
  else
    echo "Full node: limited disk, streamed download + extract (disk-efficient) at $(date '+%Y-%m-%d %H:%M:%S')"
    MAX_RETRIES=5; attempt=1
    while [ "$attempt" -le "$MAX_RETRIES" ]; do
      wget -q -O - "$SNAPSHOT_URL" | pigz -dc | tar xf - -C "$DATA_DIR"
      [ "${PIPESTATUS[0]}" -eq 0 ] && { echo "Snapshot extracted at $(date '+%Y-%m-%d %H:%M:%S')"; break; }
      echo "Attempt $attempt failed, retrying in 30s..."; attempt=$((attempt+1)); sleep 30
    done
  fi
else
  # Lite node: small (~53GB). aria2c multi-connection for speed, then extract.
  echo "Lite node: aria2c multi-connection download then extract at $(date '+%Y-%m-%d %H:%M:%S')"
  aria2c -s16 -x16 -k100M --max-tries=0 --retry-wait=10 "$SNAPSHOT_URL" -d "$DATA_DIR" -o snapshot.tgz
  if [ $? -eq 0 ]; then
    tar --use-compress-program="pigz -d" -xf "$DATA_DIR/snapshot.tgz" -C "$DATA_DIR" && rm -f "$DATA_DIR/snapshot.tgz"
    echo "Snapshot extracted at $(date '+%Y-%m-%d %H:%M:%S')"
  else
    echo "WARNING: aria2c download failed. Node will sync from genesis."
  fi
fi

chown -R bcuser:bcuser "$DATA_DIR" 2>/dev/null
echo "Snapshot step complete."
