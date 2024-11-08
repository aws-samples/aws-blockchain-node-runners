import { Handler } from 'aws-lambda';
import assert from 'assert';
import {
  ValidatorKey,
  assignKeyToEc2Instance,
  getAvailableKeys,
  updateKeyAssociation,
  updateVolumeIdAndAZ,
  detachKeyFromEc2Instance,
  getInUseKeys,
  changeKeyOwner,
} from '../clients/dynamodbClient';
import {
  assignRoleToInstance,
  findTerminatedInstance,
  getInstancePrivateIP,
  getInstanceAZ,
  attachVolume,
  createVolume,
} from '../clients/ec2Client';
import { sendLifecycleHookFailure, sendLifecycleHookSuccess } from '../clients/ec2AutoScalingClient';
import { updateIPAddressMapping } from '../clients/route53Client';
import { getValidatorHostName } from '../constants/resource-names';
import { SSMSender } from '../clients/ssmSender';
import { getFileAsString } from '../clients/s3Client';
import { CLIENT_CONFIG, EBS_CONFIG } from '../constants/besu';
import { getBootNodesWithLauchingNodeRemoved, getBase64PublicKeyInHex } from '../helper/bootnode-helper';
import { EC2_CONFIG_DIR, EC2_DATA_DIR, EC2_PROXY_DIR } from '../constants/ecs';

const MAX_RETRY = 10;

export const handler: Handler = async (event, context) => {
  console.log('INFO: Received event: ', JSON.stringify(event));

  const message = event.detail;
  if (message.NotificationMetadata) {
    const metadata = JSON.parse(message.NotificationMetadata);
    console.log('Extracted Message Metadata: ', JSON.stringify(metadata));
  }

  const instanceId = event.detail.EC2InstanceId;
  if (!instanceId) {
    console.log('WARN: Got event without EC2InstanceId.');
    await sendLifecycleHookFailure(event.detail);
    return;
  }
  console.log('InstanceId: ', instanceId);

  assert(process.env.HOSTED_ZONE_ID && process.env.SHARD_ID, 'shardId and hostedZonedId env variables are required');

  const instanceAZ = await getInstanceAZ(instanceId);
  const privateIpAddress = await getInstanceIpAddress(instanceId);

  if (!privateIpAddress || !instanceAZ) {
    await sendLifecycleHookFailure(event.detail);
    throw new Error('Instance has no networking details, privateIpAddress/instanceAZ is missing');
  }

  let assignedKey;
  try {
    assignedKey = await assignAvailableKey(MAX_RETRY, instanceId, instanceAZ);
    console.log('Validator key: ', JSON.stringify(assignedKey));

    // TODO : Refactor into multiple separate async streams to increase
    //        deployment speed.
    // 1 - Volume Create/Attach
    // 2 - SSM
    // 3 - DNS Update / Wait.
    // 4 - Assign Role.
    const [associationId] = await Promise.all([
      assignRoleToInstance(assignedKey.AccessRole, instanceId),
      // Create a new volume if no volumeId is specified.
      maybeCreateVolume(assignedKey, instanceAZ, process.env.EBS_ENCRYPTION_KEY as string),
      updateIPAddressMapping(
        process.env.HOSTED_ZONE_ID as string,
        getValidatorHostName(process.env.SHARD_ID as string, assignedKey.KeyNumber),
        privateIpAddress,
      ),
    ]);
    console.log('Assigned Role, Updated DNS to IP Address ', privateIpAddress);

    // Get files from S3.
    const s3Bucket = process.env.BUCKET_NAME as string;
    const [genesisFile, bootnodeFile] = await Promise.all([
      getFileAsString(process.env.GENESIS_FILE_NAME as string, s3Bucket),
      getBootNodesWithLauchingNodeRemoved(
        getBase64PublicKeyInHex(assignedKey.PublicKey),
        await getFileAsString(process.env.BOOTNODES_FILE_NAME as string, s3Bucket),
      ),
      updateKeyAssociation(assignedKey, associationId),
      attachVolume(instanceId, assignedKey.VolumeId || '', EBS_CONFIG.DATA_VOLUME_NAME),
    ]);
    console.log('Attached Volume', assignedKey.VolumeId);
    // Upload S3 files to instance + mount volume.
    const ssmSender = new SSMSender(instanceId);
    const PATH_PREFIX = EC2_CONFIG_DIR + '/';
    ssmSender.mountVolumeToInstance(EBS_CONFIG.DATA_VOLUME_NAME, EC2_DATA_DIR);
    ssmSender.createDirectoryOnInstance(EC2_PROXY_DIR);
    ssmSender.createDirectoryOnInstance(EC2_CONFIG_DIR);
    ssmSender.uploadFileToInstance(CLIENT_CONFIG.ECC_KEY_FILE_NAME, assignedKey.KeyArn, PATH_PREFIX);
    ssmSender.uploadFileToInstance(CLIENT_CONFIG.GENESIS_FILE_NAME, genesisFile, PATH_PREFIX);
    ssmSender.uploadFileToInstance(CLIENT_CONFIG.BOOTNODES_FILE_NAME, bootnodeFile, PATH_PREFIX);
    await ssmSender.send();
    await sendLifecycleHookSuccess(event.detail);
  } catch (error) {
    console.log(`Error occurred assigning key access role to ec2 instance: ${error}`);
    if (assignedKey) {
      console.log(`Releasing key: `, JSON.stringify(assignedKey));
      await detachKeyFromEc2Instance(assignedKey);
    }
    await sendLifecycleHookFailure(event.detail);
    throw error;
  }
};

async function getInstanceIpAddress(instanceId: string): Promise<string | undefined> {
  const maxRetry = 15;
  let privateIpAddress;
  let numOfRetry = 0;

  while (numOfRetry < maxRetry) {
    try {
      privateIpAddress = await getInstancePrivateIP(instanceId);
      if (privateIpAddress) {
        console.log('Instance PrivateIpAddress:', privateIpAddress);
        return privateIpAddress;
      }
    } catch (error) {
      console.log(`Retrying ${numOfRetry + 1}th time finding instance's PrivateIpAddress. Error occurred: ${error}`);
    }
    numOfRetry++;
    //sleep 2000ms
    await new Promise((r) => setTimeout(r, 2000));
  }

  return undefined;
}

async function findAvailableKey(instanceAZ: string): Promise<ValidatorKey | undefined> {
  let validatorKeys = await getAvailableKeys(instanceAZ);
  console.log(`Found ${validatorKeys.length} available keys w/ AZ ${instanceAZ}`);
  if (!validatorKeys || validatorKeys.length === 0) {
    // Keys with no AZ should only happen in the first deployment.
    validatorKeys = await getAvailableKeys('');
    console.log(`Found ${validatorKeys.length} available keys w/ no AZ`);
    if (!validatorKeys || validatorKeys.length === 0) {
      return undefined;
    }
  }
  //pick a random available key
  return validatorKeys[getRandomInt(validatorKeys.length)];
}

/**
 * @param maxRetry
 * @param instanceId
 *
 * Fina an available/unreleased key from the Key table and assign it to the instanceId
 */
async function assignAvailableKey(maxRetry: number, instanceId: string, instanceAZ: string): Promise<ValidatorKey> {
  let numOfRetry = 1;
  while (numOfRetry <= maxRetry) {
    const availableKey = await findAvailableKey(instanceAZ);
    if (!availableKey) {
      break;
    }
    try {
      console.log(`Assigning key ${availableKey.KeyArn} to ${instanceId}`);
      return await assignKeyToEc2Instance(availableKey, instanceId, availableKey.AvailabilityZone || '');
    } catch (error) {
      console.log(`Error ${error} occurred when assigning key: ${JSON.stringify(availableKey)}`);
    }
    numOfRetry++;
    //sleep 0-2000ms
    await new Promise((r) => setTimeout(r, getRandomInt(2000)));
  }

  const unreleasedKey = await findUnreleasedKey(instanceAZ);
  if (unreleasedKey) {
    console.log(`Reassigning unreleased key: ${JSON.stringify(unreleasedKey)} to ${instanceId}`);
    return await changeKeyOwner(unreleasedKey, instanceId);
  }

  throw new Error('Cannot assign key to instance. No available/unreleased keys found');
}

/**
 * Find a key whose the owner is terminated
 *
 * @param maxRetry
 * @param instanceId
 *
 */
async function findUnreleasedKey(instanceAZ: string): Promise<ValidatorKey | undefined> {
  const inUseKeys: ValidatorKey[] = await getInUseKeys();
  console.log(`Found ${inUseKeys.length} in-use keys`);
  const instanceIds: string[] = inUseKeys.map((key) => key.InstanceId as string);
  const terminatedInstance = await findTerminatedInstance(instanceIds, instanceAZ);
  console.log(`${JSON.stringify(terminatedInstance)} is terminated.`);
  if (!terminatedInstance) {
    return;
  }
  return inUseKeys.find((key) => key.InstanceId === terminatedInstance);
}

async function maybeCreateVolume(
  validatorKey: ValidatorKey,
  instanceAZ: string,
  encryptionKeyArn: string,
): Promise<void> {
  const existingVolumeId = validatorKey.VolumeId;
  if (!existingVolumeId || existingVolumeId == '') {
    console.log(`VolumeId is '${existingVolumeId}' in DDB : Creating Volume`);
    validatorKey.VolumeId = await createVolume(
      instanceAZ,
      EBS_CONFIG.DEFAULT_SIZE_GB,
      EBS_CONFIG.VOLUME_TYPE,
      encryptionKeyArn,
    );
    validatorKey.AvailabilityZone = instanceAZ;
    console.log(`Created Volume Id = ${validatorKey.VolumeId}`);
    await updateVolumeIdAndAZ(validatorKey);
  } else {
    console.log(`VolumeId is '${existingVolumeId}' in DDB : Skipping Create Volume`);
  }
}

//Generate random number from 0 to < max.
function getRandomInt(max: number): number {
  return Math.floor(Math.random() * max);
}
