// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

export const InstanceStoreageDeviceVolumeType = "instance-store";
export const NoneValue = "none";
export const VolumeDeviceNames = ["/dev/sdf", "/dev/sdg", "/dev/sdh", "/dev/sdi", "/dev/sdj", "/dev/sdk"]
export const GibibytesToBytesConversionCoefficient = 1073741824;

/**
 * Blockchain Snapshots on AWS (https://awslabs.github.io/blockchain-snapshots/).
 * Regions with a snapshot bucket, mirroring dist/regions.json at the commit
 * pinned in assets/common/blockchain-snapshots.sh. Update both together.
 */
export const BlockchainSnapshotsRegions = ["us-east-1", "us-east-2", "eu-west-1", "ap-northeast-1"];
/** Each Region's snapshot bucket is "<prefix><region>". */
export const BlockchainSnapshotsBucketPrefix = "blockchain-snapshots-";
