# Snapshot Staging Volume for Large Snapshots

## Overview

The snapshot staging volume is a temporary EBS gp3 volume that holds the compressed snapshot archive during download, preventing disk overflow on the primary data volume. This is required when the compressed archive size plus the extracted data size exceeds the available disk space on `/data`.

Without staging, the download-then-extract approach stores both the compressed archive and extracted data on the same volume simultaneously. For large snapshots (e.g., Base mainnet reth at ~4.86 TB compressed, ~9-10 TB extracted), peak disk usage of ~14-15 TB exceeds typical instance-store capacity (~10.5 TB), causing the disk to fill to 100% and the node to never start.

## How It Works

The staging volume system consists of universal CDK infrastructure and a shared helper script that any blueprint can source:

**Universal Components** (CDK layer):
1. **single-node-construct.ts**: Creates and attaches a gp3 staging volume when `SNAPSHOT_STAGING_VOL_SIZE > 0`
2. **ha-nodes-construct.ts**: Grants IAM permissions for instances to self-create staging volumes in HA mode
3. **user-data-ubuntu.sh**: Passes `SNAPSHOT_STAGING_VOL_SIZE` and `SNAPSHOT_STAGING_VOL_ID` to `/etc/cdk_environment`

**Shared Helper** (`assets/common/snapshot-staging.sh`):
4. **staging_mount()**: Detects device, formats ext4 if needed, mounts at `/mnt/snapshot-staging`, exports `STAGING_DOWNLOAD_PATH`
5. **staging_cleanup()**: Unmounts, detaches, and deletes the staging volume after extraction

**Protocol-Specific Component** (in the blueprint's `user-data/common/` directory):
6. **download-snapshot.sh**: Sources the staging helper, downloads to `$STAGING_DOWNLOAD_PATH`, extracts to `/data`, then calls `staging_cleanup()`

```
┌─────────────────────────────────────────────────────────────────────┐
│ CDK Layer (universal, all blueprints)                               │
│                                                                     │
│  single-node-construct.ts / ha-nodes-construct.ts                   │
│    → Creates gp3 staging volume when SNAPSHOT_STAGING_VOL_SIZE > 0  │
│    → Attaches to instance (single-node) or grants IAM (HA)         │
│    → Passes SNAPSHOT_STAGING_VOL_ID to user-data env                │
└─────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────────┐
│ Shared Helper (assets/common/snapshot-staging.sh)                   │
│                                                                     │
│  Functions:                                                         │
│    staging_mount()   — format + mount staging vol at                │
│                        /mnt/snapshot-staging                        │
│    staging_cleanup() — unmount + detach + delete volume             │
│                                                                     │
│  Reads from /etc/cdk_environment:                                   │
│    SNAPSHOT_STAGING_VOL_SIZE, SNAPSHOT_STAGING_VOL_ID               │
└─────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────────┐
│ Blueprint Layer (protocol-specific download-snapshot.sh)            │
│                                                                     │
│  blueprints/base/user-data/common/download-snapshot.sh              │
│    → Sources /opt/assets/common/snapshot-staging.sh                 │
│    → Calls staging_mount()                                          │
│    → Downloads to $STAGING_DOWNLOAD_PATH                            │
│    → Extracts to /data                                              │
│    → Calls staging_cleanup()                                        │
│                                                                     │
│  blueprints/bnb/user-data/common/download-snapshot.sh               │
│    → Same pattern                                                   │
└─────────────────────────────────────────────────────────────────────┘
```

## When to Use

**Required when**:
- `compressed_archive_size + extracted_data_size > available /data space`
- Deploying protocols with very large snapshots (multi-TB compressed archives)
- Using instance-store volumes where total capacity is fixed

**NOT required when**:
- The compressed archive is small relative to available disk space
- Using EBS volumes large enough to hold both archive and extracted data simultaneously
- Streaming extraction is viable (no connection drops requiring resume)

## Volume Sizing Guidance

Set `SNAPSHOT_STAGING_VOL_SIZE` to approximately 1.1x the compressed archive size:

| Protocol | Network | Client | Archive Size | Recommended `SNAPSHOT_STAGING_VOL_SIZE` |
|----------|---------|--------|-------------|----------------------------------------|
| Base | mainnet | op-reth | ~4.86 TB | `5000` GiB |
| Base | mainnet | op-geth | ~1.5 TB | `2000` GiB |
| BNB | mainnet | bsc-reth | ~9.7 TB | `10000` GiB |
| BNB | mainnet | bsc-geth | ~365 GB | `500` GiB |

**Rule of thumb**: `SNAPSHOT_STAGING_VOL_SIZE` ≈ 1.1 × compressed archive size in GiB.

## Cost Analysis

The staging volume is temporary — it exists only during snapshot download and extraction (typically 1-3 days depending on archive size and network speed).

**Example: Base mainnet op-reth (5 TB staging volume, ~2 days)**:
- Storage: 5,000 GiB × $0.08/GiB/mo × (2 days / 30) = ~$27
- Provisioned throughput (1000 MB/s): ~$2.33 for 2 days
- **Total: ~$29**

**Compared to failure cost**:
- Failed deployment without staging: ~$480+ wasted in compute costs over 2 days with no functional node
- The staging volume pays for itself by preventing a single failed deployment

## Orphan Prevention

The staging volume is automatically cleaned up in all scenarios:

| Scenario | Cleanup Mechanism |
|----------|-------------------|
| Happy path (extraction succeeds) | `staging_cleanup()` unmounts, detaches, and deletes the volume |
| Instance terminated during download | CloudFormation stack delete removes the volume (single-node) |
| ASG instance terminated (HA mode) | Volume tagged with instance ID; stack delete or manual cleanup |
| Stack deleted during download | CloudFormation deletes instance first (auto-detaches), then deletes volume |
| Script crashes after mount | Volume remains attached; stack delete handles cleanup |

For single-node deployments, the staging volume is created by CloudFormation with `RemovalPolicy.DESTROY`, guaranteeing cleanup on stack deletion.

For HA deployments, volumes are tagged with `Purpose=snapshot-staging` and the instance ID for identification and manual cleanup if needed.

## Cleanup Verification

`staging_cleanup()` verifies that the staging volume is actually deleted before
reporting success. It captures the result of each AWS call, and after the delete
it re-checks with `describe-volumes`:

- If the volume is confirmed gone, it logs `Staging volume cleanup complete` and returns success.
- If any step fails (missing IAM permission, stalled detach, unreachable metadata service), it logs a greppable `ERROR: staging cleanup: ...` line that includes the volume ID, and returns a non-zero status.
- If the volume id is missing from `/etc/cdk_environment` (for example after a reboot mid-download), cleanup attempts to rediscover the volume by its `Purpose=snapshot-staging` tag and attachment to the instance before giving up.

The blueprint `download-snapshot.sh` scripts invoke cleanup from an `EXIT` trap
that surfaces a failed cleanup loudly (it logs an `ERROR` about a possible
orphaned volume) without failing the node, since the snapshot itself may have
extracted successfully. Search `cloud-init-output` for `ERROR: staging cleanup`
or `still exists after cleanup` to detect an orphaned volume.

## Testing the Staging Lifecycle (Dummy blueprint)

The `dummy` blueprint includes a cheap debug path that exercises the full staging
lifecycle (mount → write synthetic archive → extract → unmount → detach → delete)
against a small volume, so the cleanup behavior can be validated without a
multi-TB real download.

To run it, deploy the dummy staging-debug sample to a **test/sandbox** account:

```bash
cp blueprints/dummy/samples/.env-testnet-staging-debug .env
# set AWS_ACCOUNT_ID and AWS_REGION
npx cdk deploy --json --outputs-file deploy-output-dummy-staging.json
```

Then check `cloud-init-output` for the verdict line:

- `STAGING DEBUG: PASS` — the staging volume was created and successfully deleted.
- `STAGING DEBUG: FAIL (orphaned volume vol-...)` — cleanup did not confirm deletion; investigate the named volume.

With `SNAPSHOT_STAGING_VOL_SIZE=0` the debug path is a no-op, matching production
behavior when staging is disabled.

## See Also

- [Configuration Reference](/docs/guides/configuration-reference) - `SNAPSHOT_STAGING_VOL_SIZE` variable documentation
- [Deployment Guide](/docs/guides/deployment-guide) - Configuring staging volumes during deployment
- [Troubleshooting](/docs/guides/troubleshooting) - Disk fills during snapshot download
- [Adding New Protocols](/docs/ai-prompts/add-protocol-with-ai) - Implementing staging volume support for new protocols
