# Blockchain Snapshots on AWS

## Overview

[Blockchain Snapshots on AWS](https://awslabs.github.io/blockchain-snapshots/) publishes current snapshots of several blockchains in Amazon S3, in a few AWS Regions, at no charge for the snapshots themselves. With `SNAPSHOT_PROVIDER="blockchain-snapshots"`, a supported blueprint restores its node from the latest snapshot at first boot instead of syncing from genesis.

You don't choose the snapshot. Each blueprint configuration maps its `BC_NETWORK` to a snapshot ID, and the tool resolves that ID to the newest snapshot in your Region's catalog when the instance boots.

Blockchain Snapshots on AWS is not an AWS service and carries no availability, freshness or correctness guarantee. Snapshot data is mirrored from third-party blockchain teams. A restored node still validates the chain against its peers.

## Supported Blueprints

| Blueprint | `CLIENT_CONFIG` | `BC_NETWORK` | Snapshot ID | What is restored |
|-----------|-----------------|--------------|-------------|------------------|
| Ethereum | `geth-<version>-lighthouse-<version>-full.yml` | `mainnet` | `ethereum-mainnet-geth` | Geth database (`/data/execution/geth`) |
| Ethereum | `geth-<version>-lighthouse-<version>-full.yml` | `hoodi` | `ethereum-hoodi-geth` | Geth database (`/data/execution/geth`) |
| Ethereum | `nethermind-<version>-teku-<version>-full.yml` | `mainnet` | `ethereum-mainnet-nethermind` | Nethermind database (`/data/execution/nethermind_db`) |
| Ethereum | `reth-<version>-lighthouse-<version>-full.yml` | `mainnet` | `ethereum-mainnet-reth` | Reth data directory (`/data/execution`) |
| Solana | `agave-<version>-rpc-*.sh`, `frankendancer-<version>-rpc-*.sh` | `mainnet-beta` | `solana-mainnet-agave` | Full and incremental snapshot archives (`/data/data/ledger`) |

On Ethereum, the consensus client keeps using checkpoint sync. On Solana, the validator unpacks the archives itself and starts without fetching a snapshot from peers (`--no-snapshot-fetch` for Agave, `snapshot_fetch = false` for Frankendancer, whose Agave side loads the same archives), so it begins from the restored snapshot. Reth archive nodes, Erigon, Besu, Sepolia, and the Solana testnet and devnet have no snapshot, and synthesis rejects them with the list of supported combinations.

The Ethereum snapshots are built by [ethPandaOps](https://ethpandaops.io/) with their own client settings, recorded in `_snapshot_metadata.json` in the restored directory. Two of them change what the node can serve:

- **Geth** (`--history.chain=postmerge`) and **Reth** (`--prune.bodies.pre-merge`, `--prune.receipts.before=15537394`) don't include block bodies and receipts before the Merge (block 15,537,394), so RPC calls for pre-Merge blocks, transactions, receipts and logs return nothing. Sync from scratch instead if you need that history.
- A snapshot can be made by an older client version than the one the configuration pins. In November 2026 the Geth snapshot came from 1.17.7, Nethermind from 2.1.0 and Reth from 2.7.0, and the pinned 1.17.10, 2.2.2 and 2.10.1 opened them.

The mapping lives in each blueprint's `package.json`: see [Adding Snapshots to a Blueprint](#adding-snapshots-to-a-blueprint).

## Prerequisites

1. **A snapshot Region.** Set `AWS_REGION` to `us-east-1`, `us-east-2`, `eu-west-1` or `ap-northeast-1`. Synthesis fails in any other Region.
2. **An Amazon S3 gateway VPC endpoint** in the VPC you deploy into (the default VPC unless your stack sets one). The snapshot buckets are reachable only through one, and the stack does not create it. It must be associated with the route table of:
   - single-node: the public subnet in the instance's Availability Zone (`AWS_AZ`, or the one the stack picks);
   - ha-nodes: every public subnet of the VPC, because the Auto Scaling Group can launch into any of them.

   S3 gateway endpoints have no charge. Associating one with a route table sends all Amazon S3 traffic in the Region from that subnet through the endpoint, for every workload in the subnet. Bucket policies that allow access by public IP address (`aws:SourceIp`) stop matching those requests.

   Synthesis checks the endpoint's route tables, not its policy. If the endpoint has a custom policy, it must allow `s3:ListBucket` on `arn:aws:s3:::blockchain-snapshots-<region>` and `s3:GetObject` on `arn:aws:s3:::blockchain-snapshots-<region>/*`. Otherwise synthesis passes and the restore fails at boot with `cannot reach s3://blockchain-snapshots-<region>`. The default policy allows full access.

To find your default VPC's route tables and create the endpoint:

```bash
export AWS_REGION=us-east-1
VPC_ID=$(aws ec2 describe-vpcs --filters Name=is-default,Values=true \
  --query 'Vpcs[0].VpcId' --output text --region $AWS_REGION)

# Existing S3 gateway endpoints in the VPC, and the route tables they serve
aws ec2 describe-vpc-endpoints --region $AWS_REGION \
  --filters Name=vpc-id,Values=$VPC_ID Name=service-name,Values=com.amazonaws.$AWS_REGION.s3 \
            Name=vpc-endpoint-type,Values=Gateway \
  --query 'VpcEndpoints[].{Id:VpcEndpointId,RouteTables:RouteTableIds}'

# Route tables of the VPC (subnets without an explicit association use the main one)
aws ec2 describe-route-tables --region $AWS_REGION --filters Name=vpc-id,Values=$VPC_ID \
  --query 'RouteTables[].{Id:RouteTableId,Main:Associations[?Main].Main|[0],Subnets:Associations[].SubnetId}'

# Create the endpoint (or add route tables to an existing one with
# aws ec2 modify-vpc-endpoint --add-route-table-ids)
aws ec2 create-vpc-endpoint --region $AWS_REGION --vpc-id $VPC_ID \
  --vpc-endpoint-type Gateway --service-name com.amazonaws.$AWS_REGION.s3 \
  --route-table-ids rtb-xxxxxxxx
```

3. **Free space for the restore.** Before it writes anything, the tool checks the free space on the file system that holds the output directory and fails if there is too little. It needs the snapshot's `storage.required_bytes` from the catalog when listed. Otherwise the requirement depends on how the snapshot is delivered:

   | Delivery | Snapshots | Free space needed |
   |----------|-----------|-------------------|
   | Seekable archive | `ethereum-mainnet-geth`, `ethereum-mainnet-nethermind`, `ethereum-mainnet-reth` | The extracted size |
   | Streamed archive | `ethereum-hoodi-geth` | Twice the download size |
   | Archive set | `solana-mainnet-agave` | 1.05 times the download size |

   Size the data volume for that, plus the other data on the volume (for example the consensus client) and growth. The [live catalog](https://awslabs.github.io/blockchain-snapshots/) lists current sizes. `SNAPSHOT_STAGING_VOL_SIZE` must be `0`: the tool writes straight into the data directory.

## Configuration

Add to `.env`:

```bash
SNAPSHOT_ENABLED="true"
SNAPSHOT_PROVIDER="blockchain-snapshots"
```

The supported samples in `blueprints/ethereum/samples/` and `blueprints/solana/samples/` carry these lines commented out. Without `SNAPSHOT_PROVIDER` (or with `SNAPSHOT_PROVIDER="blueprint"`), `SNAPSHOT_ENABLED` keeps its existing meaning: the blueprint's own snapshot download, if it has one. See [Configuration Reference](/docs/guides/configuration-reference).

## What Happens

**At synthesis**, in this order:

1. `AWS_REGION` must be a snapshot Region, `SNAPSHOT_STAGING_VOL_SIZE` must be `0`, and the selected `CLIENT_CONFIG` must map `BC_NETWORK` to a snapshot ID.
2. The stack looks up the VPC's S3 gateway endpoints with the CDK Cloud Control context provider and fails unless they cover the route tables listed under [Prerequisites](#prerequisites). The error names the VPC, route tables and subnets.
3. The instance role gets `s3:ListBucket` on `blockchain-snapshots-<region>` and `s3:GetObject` on its objects, and nothing else for snapshots.

The lookup result is cached in `cdk.context.json`, like the default VPC lookup. After you create or change the endpoint, clear the cached result with the `npx cdk context --reset ...` command the error prints, then synthesize again.

**At first boot**, the blueprint's `node.sh` runs `assets/common/blockchain-snapshots.sh` before it starts the node:

1. It writes the in-progress marker (see [Re-runs and Retries](#re-runs-and-retries)) and a `node.service` drop-in, `/etc/systemd/system/node.service.d/blockchain-snapshots.conf`, that keeps the node from starting while that marker exists.
2. It checks that the Region's snapshot bucket is reachable, before installing or downloading anything. If it isn't, it logs an error that names the missing S3 gateway endpoint.
3. It installs the tool's dependencies from Ubuntu packages (`git`, `python3-boto3`, `python3-zstandard`, `zstd`).
4. It fetches the tool from `https://github.com/awslabs/blockchain-snapshots` at a pinned commit and refuses to run if the checked-out commit differs.
5. It runs `dist/snapshot.sh` as `bcuser`, so the node user owns the data. The script resolves the latest snapshot, checks the bucket, artifact size and free space, and extracts it into the output directory.
6. It logs the resolved snapshot (`<id> version <block or slot>, <bytes> bytes in <seconds>s`), replaces the in-progress marker with the restored marker, and removes the drop-in.

On Solana, `node.sh` then prepares the archives for the validator's first start:

- It removes the restored `genesis.tar.bz2`, so the validator downloads genesis and checks it against the expected genesis hash. With the archive alone, Agave never unpacks it and retries forever.
- It checks that the incremental archive holds the bank its name says. The incremental is republished about hourly under a fixed S3 key, so a restore can download a newer one than the catalog named, and the validator refuses it ("snapshot slot mismatch"). A mismatched incremental is removed, and the validator starts from the full archive with more slots to replay.

Progress appears in the `cloud-init-output` log group under the `[blockchain-snapshots]` prefix. The node starts only after the restore succeeds.

## Restore Times

Measured on 23 November 2026 in `us-east-1` with the samples' instance and volume types:

| Snapshot | Download size | Storage | Restore time |
|----------|---------------|---------|--------------|
| `ethereum-hoodi-geth` | 103 GB | gp3, 250 MB/s | about 9 minutes |
| `ethereum-mainnet-geth` | 1.24 TB | gp3, 1,000 MB/s | about 35 minutes |
| `ethereum-mainnet-nethermind` | 1.19 TB | gp3, 1,000 MB/s | about 33 minutes |
| `ethereum-mainnet-reth` | 857 GB | instance store (i8g.4xlarge) | about 10 minutes |
| `solana-mainnet-agave` | 127 GB | instance store (i7i.12xlarge) | about 12 minutes |

The node then executes the blocks produced since the snapshot was taken, usually less than a day of blocks.

## Security

- **Pinned tool.** The repository publishes no releases, so the tool is pinned to a commit in `assets/common/blockchain-snapshots.sh` and verified after checkout. The registry of Regions and catalogs is read from that same checkout (`--registry`), not from the project's website, which follows its main branch.
- **No unpinned downloads.** The tool's own `--setup` is not used, because it downloads mountpoint-s3 (`latest`) and the AWS CLI without a checksum. Dependencies come from Ubuntu packages, the AWS CLI is the one the bootstrap already installs, and reads use direct S3 requests (`--source s3`).
- **Least privilege.** The tool runs as `bcuser` with an empty environment, and the instance role can only read the one snapshot bucket of its Region.
- **What is not pinned.** The snapshot itself is the latest one in the catalog at boot time. The tool checks catalog shape, exact S3 URIs and artifact sizes, and checks seekable snapshots against their download manifest. It does not verify a signature. The node's own validation against its peers is the final check.

## Re-runs and Retries

Markers next to the output directory make the restore safe to re-run:

| Marker | Meaning |
|--------|---------|
| `<output-dir>.snapshot-restored` | Restore finished. Holds the tool's `--json` result. Later runs skip the restore. |
| `<output-dir>.snapshot-in-progress` | A restore started and did not finish. Written before the first step that can fail. The next run deletes whatever the output directory holds and starts over. |

If the output directory already contains data and neither marker exists (for example, a node that synced before you enabled snapshots), the restore is skipped and the data is never overwritten.

If the restore fails, node setup stops instead of starting a sync from genesis, and the bootstrap retries on the next boot. The drop-in keeps `node.service` from starting in the meantime: after a failed setup the bootstrap tries to restart the previous `node.service`, and `systemctl status node.service` then shows the start was skipped because the in-progress marker exists. Fix the cause (see [Troubleshooting](/docs/guides/troubleshooting#blockchain-snapshots-on-aws-restore-failed)), then reboot the instance.

On instance-store volumes, the markers live on the data volume, so a stop and start, which wipes the volume, restores the snapshot again. `node.service` already exists on such an instance, which is why the marker and drop-in are written before anything that can fail.

## Updating the Pinned Tool Version

Maintainers bump the pin like a client version, on a branch with a test deployment:

1. Review the diff between the pinned commit and the new one in `awslabs/blockchain-snapshots`, especially `dist/snapshot.sh`, `dist/snapshot-catalog.py` and `dist/regions.json`.
2. Update `BLOCKCHAIN_SNAPSHOTS_COMMIT` in `assets/common/blockchain-snapshots.sh`.
3. If `dist/regions.json` changed, update `BlockchainSnapshotsRegions` in `lib/interfaces/constants.ts` to match.
4. If the catalog lists a new snapshot ID for a supported blueprint, add it to the blueprint's mapping.
5. Deploy one supported configuration in a test account and confirm the restore and sync.

## Adding Snapshots to a Blueprint

Add a `blockchainSnapshots` object to each configuration in the blueprint's `package.json` that can restore from a snapshot, mapping `BC_NETWORK` values to snapshot IDs from the catalog:

```json
"availableConfigurations": [
  {
    "name": "geth-1.17.10-lighthouse-8.3.3-full.yml",
    "blockchainSnapshots": {
      "mainnet": "ethereum-mainnet-geth",
      "hoodi": "ethereum-hoodi-geth"
    }
  }
]
```

Map a configuration only if it runs the same client and node type as the snapshot (a full-node snapshot can't seed an archive node). Then call the helper from the blueprint's `node.sh` before it starts `node.service`, with the directory the snapshot's contents belong in. Check the snapshot's layout first: the Ethereum snapshots hold the client's database directory, not its data directory, so Geth's go to `<datadir>/geth` and Nethermind's to `<datadir>/nethermind_db`:

```bash
if [ "$SNAPSHOT_ENABLED" = "true" ] && [ "$SNAPSHOT_PROVIDER" = "blockchain-snapshots" ]; then
    bash /opt/assets/common/blockchain-snapshots.sh /data/<client-database-dir>
fi
```

The output directory must be a subdirectory, not a mount point such as `/data`. See [Adding New Protocols](/docs/ai-prompts/add-protocol-with-ai).

## See Also

- [Blockchain Snapshots on AWS](https://awslabs.github.io/blockchain-snapshots/): live catalog, delivery protocols and `snapshot.sh` reference
- [Configuration Reference](/docs/guides/configuration-reference): `SNAPSHOT_ENABLED` and `SNAPSHOT_PROVIDER`
- [Troubleshooting](/docs/guides/troubleshooting#blockchain-snapshots-on-aws-restore-failed): synthesis and restore errors
