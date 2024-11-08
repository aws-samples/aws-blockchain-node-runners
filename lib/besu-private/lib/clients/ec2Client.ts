import {
  AssociateIamInstanceProfileCommand,
  AttachVolumeCommand,
  CreateVolumeCommand,
  AttachVolumeCommandOutput,
  CreateVolumeCommandOutput,
  ReplaceIamInstanceProfileAssociationCommand,
  DisassociateIamInstanceProfileCommand,
  DescribeIamInstanceProfileAssociationsCommand,
  DescribeInstancesCommand,
  DescribeInstancesResult,
  DescribeSnapshotsCommand,
  DescribeVolumesCommand,
  EC2Client,
  Snapshot,
  VolumeType
} from '@aws-sdk/client-ec2';

// Export for unit testing.
export const ec2Client = new EC2Client({});
export const EC2_INSTANCE_STATE_CODE_TERMINATED = 48;

export async function assignRoleToInstance(instanceProfileArn: string, instanceId: string) {
  const existingRoleAssociationId = await getExistingRoleAssociation(instanceId);
  const ec2Response = existingRoleAssociationId
    ? await replaceInstanceProfile(existingRoleAssociationId, instanceProfileArn, instanceId)
    : await associateInstanceProfile(instanceProfileArn, instanceId);
  if (ec2Response.IamInstanceProfileAssociation && ec2Response.IamInstanceProfileAssociation.AssociationId) {
    return ec2Response.IamInstanceProfileAssociation.AssociationId;
  } else {
    throw new Error(`Cannot assign role ${instanceProfileArn} to instance ${instanceId}`);
  }
}

/**
 * Replace existing role-instance association with new instance profile
 * @param existingAssociationId
 * @param instanceProfileArn
 * @param instanceId
 */
async function replaceInstanceProfile(
  existingAssociationId: string,
  instanceProfileArn: string,
  instanceId: string,
): Promise<any> {
  const replaceProfileCommand = new ReplaceIamInstanceProfileAssociationCommand({
    AssociationId: existingAssociationId,
    IamInstanceProfile: {
      Arn: instanceProfileArn,
    },
  });
  return await ec2Client.send(replaceProfileCommand);
}

/**
 * Associate an instance profile to an ec2 instance
 * @param instanceProfileArn
 * @param instanceId
 */
export async function associateInstanceProfile(instanceProfileArn: string, instanceId: string): Promise<any> {
  const associateProfileCommand = new AssociateIamInstanceProfileCommand({
    IamInstanceProfile: {
      Arn: instanceProfileArn,
    },
    InstanceId: instanceId,
  });
  return await ec2Client.send(associateProfileCommand);
}

/**
 * Get existing role - instance association
 * @param instanceId
 */
async function getExistingRoleAssociation(instanceId: string): Promise<string> {
  const describeInstanceProfileCommand = new DescribeIamInstanceProfileAssociationsCommand({
    Filters: [
      {
        Name: 'instance-id',
        Values: [instanceId],
      },
      {
        Name: 'state',
        Values: ['Associated'],
      },
    ],
  });

  const describeInstanceProfileResponse = await ec2Client.send(describeInstanceProfileCommand);
  if (
    !describeInstanceProfileResponse.IamInstanceProfileAssociations ||
    describeInstanceProfileResponse.IamInstanceProfileAssociations.length == 0
  ) {
    return '';
  }
  return describeInstanceProfileResponse.IamInstanceProfileAssociations[0].AssociationId as string;
}

export async function disassociateInstanceProfile(associationId: string) {
  const disassociateIamProfileCommand = new DisassociateIamInstanceProfileCommand({
    AssociationId: associationId,
  });
  await ec2Client.send(disassociateIamProfileCommand);
}

export async function getInstancePrivateIP(instanceId: string): Promise<string> {
  const describeInstancesResult = await describeInstances([instanceId]);
  if (!describeInstancesResult?.Reservations?.[0].Instances?.[0].NetworkInterfaces) {
    throw new Error(`DescribeInstances returns empty response: ${JSON.stringify(describeInstancesResult)}`);
  }
  return describeInstancesResult.Reservations[0].Instances[0].NetworkInterfaces[0].PrivateIpAddress as string;
}

export async function getInstanceAZ(instanceId: string): Promise<string> {
  const describeInstancesResult = await describeInstances([instanceId]);
  if (!describeInstancesResult?.Reservations?.[0].Instances?.[0].Placement) {
    throw new Error(`DescribeInstances returns empty response: ${JSON.stringify(describeInstancesResult)}`);
  }
  return describeInstancesResult.Reservations[0].Instances[0].Placement.AvailabilityZone as string;
}

export async function getInstanceVolumeId(instanceId: string, volumeName: string): Promise<string> {
  const describeInstancesResult = await describeInstances([instanceId]);
  const ebsVolumes = describeInstancesResult?.Reservations?.[0].Instances?.[0].BlockDeviceMappings;
  if (!ebsVolumes) {
    throw new Error(`DescribeInstances returns empty response: ${JSON.stringify(describeInstancesResult)}`);
  }
  return ebsVolumes.filter((ebsVolume) => ebsVolume.DeviceName == volumeName)[0].Ebs?.VolumeId as string;
}

/**
 * Return first found terminated instance if any
 * Else return first invisible instance if any
 * Else return an empty string
 * This function doesn't handle the case where ec2 return an error e.g. instanceId is invalid
 * Although it's possible that case can happen when for e.g. an instance is terminated for long time
 * This is because we should not let it happen in the first place as the key shouldn't be unassigned for too long
 * And so this requires manual intervention if it does happen
 *
 * @param instanceIds
 * @param instanceAZ
 */
export async function findTerminatedInstance(instanceIds: string[], instanceAZ: string): Promise<string> {
  const invisibleInstances = [];
  for (const instanceId of instanceIds) {
    const describeInstancesResult = await describeInstances([instanceId]);
    const firstInstance = describeInstancesResult?.Reservations?.[0]?.Instances?.[0];

    if (!firstInstance) {
      //Terminated instances are only visible for less than one hour and won't be included in the response after the interval
      invisibleInstances.push(instanceId);
    }
    //state code 48 = terminated: https://docs.aws.amazon.com/AWSEC2/latest/APIReference/API_InstanceState.html
    else if (firstInstance.State?.Code === EC2_INSTANCE_STATE_CODE_TERMINATED) {
      return describeInstancesResult?.Reservations?.[0].Instances?.[0].InstanceId as string;
    }
  }

  return invisibleInstances.length > 0 ? invisibleInstances[0] : '';
}

export async function describeInstances(instanceIds: string[]): Promise<DescribeInstancesResult> {
  const describeInstancesCommand = new DescribeInstancesCommand({
    InstanceIds: instanceIds,
  });
  return await ec2Client.send(describeInstancesCommand);
}

export async function getMostRecentSnapshotId(
  snapshotTagKey: string,
  snapshotTagValue: string,
  minVolumeSize: number,
): Promise<string> {
  const describeSnapshotsCommand = new DescribeSnapshotsCommand({
    OwnerIds: ['self'],
    Filters: [
      { Name: `tag:${snapshotTagKey}`, Values: [snapshotTagValue] },
      { Name: 'status', Values: ['completed'] },
    ],
    MaxResults: 300,
  });
  const commandOutput = await ec2Client.send(describeSnapshotsCommand);
  if (!commandOutput || !commandOutput.Snapshots) {
    throw new Error(`DescribeSnapshots returned empty response: ${JSON.stringify(commandOutput)}`);
  }

  if (commandOutput.Snapshots.length == 0) {
    console.log(`WARN : No Snapshots Available with Tag Name:${snapshotTagValue}`);
    return '';
  }
  // Find most recent.
  let bestSnapshot = null;
  const snapshots = commandOutput.Snapshots as Array<Snapshot>;
  for (const snapshot of snapshots) {
    if (snapshot.StartTime && snapshot.StartTime > (bestSnapshot?.StartTime ?? 0)) {
      // Filter out root volume snapshots. TODO : Remove when root volumes are not tagged.
      if ((snapshot.VolumeSize ?? 0) >= minVolumeSize) {
        bestSnapshot = snapshot;
      }
    }
  }
  return bestSnapshot ? (bestSnapshot.SnapshotId as string) : '';
}

export async function createVolume(
  availabilityZone: string,
  sizeInGB: number,
  volumeType: string,
  encryptionKeyArn: string,
): Promise<string> {
  const createVolumeCommand = new CreateVolumeCommand({
    AvailabilityZone: availabilityZone,
    Encrypted: true,
    Size: sizeInGB,
    VolumeType: volumeType as VolumeType,
    KmsKeyId: encryptionKeyArn,
  });
  const output = await ec2Client.send(createVolumeCommand);
  return (output as CreateVolumeCommandOutput).VolumeId || '';
}

export async function attachVolume(
  instanceId: string,
  volumeId: string,
  volumeDevice: string,
): Promise<AttachVolumeCommandOutput> {
  const getVolumeCommand = new DescribeVolumesCommand({
    VolumeIds: [volumeId],
  });
  let output;
  let volState;
  // Assume volume should be available in 2 minutes. Need further research.
  let maxRetry = 12;
  do {
    maxRetry--;
    output = await ec2Client.send(getVolumeCommand);
    volState = output?.Volumes?.pop()?.State;
    console.log(`Attaching Volume ${volumeId}...  Volume State: ${volState}`);
    await delay(10000);
  } while (maxRetry > 0 && volState != 'available');

  const attachVolumeCommand = new AttachVolumeCommand({
    Device: volumeDevice,
    InstanceId: instanceId,
    VolumeId: volumeId,
  });
  return await ec2Client.send(attachVolumeCommand);
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
