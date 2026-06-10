#!/bin/bash
set +e

# Run on the snapshot node (via daily cron). Produces a consistent TRON DB snapshot
# and uploads it to the private S3 staging bucket so RPC/single nodes can restore fast.
#
# Streaming tar | s5cmd pipe avoids creating a multi-TB local archive.

source /etc/environment 2>/dev/null

if [ -z "$TRON_SNAPSHOT_S3_BUCKET" ] || [ "$TRON_SNAPSHOT_S3_BUCKET" == "none" ]; then
  echo "TRON_SNAPSHOT_S3_BUCKET not set; nothing to upload."
  exit 0
fi

if [ "$TRON_NODE_TYPE" == "lite" ]; then
  SNAP_FILE="LiteFullNode_output-directory.tar.zst"
else
  SNAP_FILE="FullNode_output-directory.tar.zst"
fi
S3_KEY="${TRON_NETWORK}/${TRON_NODE_TYPE}/${SNAP_FILE}"

echo "$(date '+%F %T') Stopping tron for a consistent snapshot"
systemctl stop tron
sleep 10

echo "$(date '+%F %T') Uploading /data/output-directory to s3://${TRON_SNAPSHOT_S3_BUCKET}/${S3_KEY}"
# zstd -T0 = multithreaded compression. We re-store the public gzip snapshot as zstd because
# zstd decompresses far faster (and multithreaded), making s3-mode restore transfer-bound, not gzip-bound.
tar -cf - -C /data output-directory | zstd -T0 | s5cmd pipe "s3://${TRON_SNAPSHOT_S3_BUCKET}/${S3_KEY}"
# Check every stage of the pipe (tar | zstd | s5cmd); a failure in tar or zstd must not be reported as success.
pipe=("${PIPESTATUS[@]}")
status=0
for s in "${pipe[@]}"; do [ "$s" -ne 0 ] && status="$s"; done

echo "$(date '+%F %T') Restarting tron"
systemctl start tron

if [ "$status" -eq 0 ]; then
  echo "$(date '+%F %T') Snapshot upload complete."
else
  echo "$(date '+%F %T') WARNING: snapshot upload failed (s5cmd status $status)."
fi
