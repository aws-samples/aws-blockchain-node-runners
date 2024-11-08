import { DynamoDBClient, UpdateItemCommand, ScanCommand } from '@aws-sdk/client-dynamodb';
import { marshall, unmarshall } from '@aws-sdk/util-dynamodb';
import { KeyStatus } from '../constants/key-status';

const ddbClient = new DynamoDBClient({});

export interface ValidatorKey {
  PublicKey: string;
  KeyNumber: number;
  AccessRole: string;
  InstanceId?: string;
  AssociationId?: string;
  KeyArn: string;
  KeyStatus: KeyStatus;
  VolumeId?: string;
  AvailabilityZone?: string;
}

export async function getAvailableKeys(instanceAZ: string): Promise<ValidatorKey[]> {
  const scanResponse = await ddbClient.send(
    new ScanCommand({
      TableName: process.env.DDB_TABLE_NAME,
      FilterExpression: 'KeyStatus = :val and AvailabilityZone = :az',
      ExpressionAttributeValues: marshall({ ':val': KeyStatus.AVAILABLE, ':az': instanceAZ }),
    }),
  );

  if (!scanResponse.Items) {
    return [];
  }

  return scanResponse.Items.map((item) => unmarshall(item) as ValidatorKey);
}

export async function getInUseKeys(): Promise<ValidatorKey[]> {
  const scanResponse = await ddbClient.send(
    new ScanCommand({
      TableName: process.env.DDB_TABLE_NAME,
      FilterExpression: 'KeyStatus = :val',
      ExpressionAttributeValues: marshall({ ':val': KeyStatus.IN_USE }),
    }),
  );

  if (!scanResponse.Items) {
    return [];
  }

  return scanResponse.Items.map((item) => unmarshall(item) as ValidatorKey);
}

export async function assignKeyToEc2Instance(
  key: ValidatorKey,
  ec2InstanceId: string,
  availabilityZone: string,
): Promise<ValidatorKey> {
  const itemToUpdate = { ...key };
  itemToUpdate.InstanceId = ec2InstanceId;
  itemToUpdate.KeyStatus = KeyStatus.IN_USE;

  await ddbClient.send(
    new UpdateItemCommand({
      TableName: process.env.DDB_TABLE_NAME,
      Key: marshall({
        KeyArn: key.KeyArn,
      }),
      ExpressionAttributeValues: marshall({
        ':statusVal': KeyStatus.AVAILABLE,
        ':instanceId': ec2InstanceId,
        ':newStatusVal': KeyStatus.IN_USE,
        ':az': availabilityZone,
      }),
      UpdateExpression: 'set InstanceId = :instanceId, KeyStatus = :newStatusVal',
      ConditionExpression: 'KeyStatus = :statusVal and AvailabilityZone = :az',
    }),
  );
  return itemToUpdate;
}

/**
 * Change owner of a key, current status has to be IN USE as this is to change the owner when the current key owner is already terminated
 * @param key
 * @param ec2InstanceId
 */
export async function changeKeyOwner(key: ValidatorKey, ec2InstanceId: string): Promise<ValidatorKey> {
  const itemToUpdate = { ...key };
  itemToUpdate.InstanceId = ec2InstanceId;

  await ddbClient.send(
    new UpdateItemCommand({
      TableName: process.env.DDB_TABLE_NAME,
      Key: marshall({
        KeyArn: key.KeyArn,
      }),
      ExpressionAttributeValues: marshall({
        ':statusVal': KeyStatus.IN_USE,
        ':currentInstanceId': key.InstanceId,
        ':instanceId': ec2InstanceId,
      }),
      UpdateExpression: 'set InstanceId = :instanceId',
      ConditionExpression: 'KeyStatus = :statusVal and InstanceId = :currentInstanceId',
    }),
  );
  return itemToUpdate;
}

/**
 * Set associationId = ec2 - Iam instance profile association Id
 * @param key
 * @param associationId
 */
export async function updateKeyAssociation(key: ValidatorKey, associationId: string): Promise<ValidatorKey> {
  const itemToUpdate = { ...key };
  itemToUpdate.AssociationId = associationId;
  await ddbClient.send(
    new UpdateItemCommand({
      TableName: process.env.DDB_TABLE_NAME,
      Key: marshall({
        KeyArn: key.KeyArn,
      }),
      ExpressionAttributeValues: marshall({ ':instanceId': key.InstanceId as string, ':associationId': associationId }),
      UpdateExpression: 'set AssociationId = :associationId',
      ConditionExpression: 'InstanceId = :instanceId',
    }),
  );
  return itemToUpdate;
}

export async function updateVolumeIdAndAZ(key: ValidatorKey): Promise<ValidatorKey> {
  await ddbClient.send(
    new UpdateItemCommand({
      TableName: process.env.DDB_TABLE_NAME,
      Key: marshall({
        KeyArn: key.KeyArn,
      }),
      ExpressionAttributeValues: marshall({
        ':instanceId': key.InstanceId as string,
        ':volumeId': key.VolumeId,
        ':az': key.AvailabilityZone,
      }),
      UpdateExpression: 'set VolumeId = :volumeId, AvailabilityZone = :az',
      ConditionExpression: 'InstanceId = :instanceId',
    }),
  );
  return key;
}

/**
 * Find the key associated to the instanceId with KeyStatus = IN_USE
 * @param ec2InstanceId
 */
export async function getCurrentKeyUsedByEC2Instance(ec2InstanceId: string): Promise<ValidatorKey> {
  const scanResponse = await ddbClient.send(
    new ScanCommand({
      TableName: process.env.DDB_TABLE_NAME,
      FilterExpression: 'KeyStatus = :keyStatus and InstanceId = :instanceId',
      ExpressionAttributeValues: marshall({ ':keyStatus': KeyStatus.IN_USE, ':instanceId': ec2InstanceId }),
    }),
  );
  if (!scanResponse.Items || scanResponse.Items.length == 0) {
    throw new Error(`No key found for ${ec2InstanceId}`);
  }

  return unmarshall(scanResponse.Items[0]) as ValidatorKey;
}

/**
 * Release a key. Set InstanceId and AssociationId to empty string, KeyStatus to AVAILABLE
 * @param key
 */
export async function detachKeyFromEc2Instance(key: ValidatorKey): Promise<void> {
  const itemToUpdate = { ...key };
  itemToUpdate.InstanceId = '';
  itemToUpdate.AssociationId = '';
  itemToUpdate.KeyStatus = KeyStatus.AVAILABLE;

  await ddbClient.send(
    new UpdateItemCommand({
      TableName: process.env.DDB_TABLE_NAME,
      Key: marshall({
        KeyArn: key.KeyArn,
      }),
      ExpressionAttributeValues: marshall({
        ':statusVal': KeyStatus.AVAILABLE,
        ':instanceId': key.InstanceId,
        ':newInstanceId': '',
        ':associationId': '',
        ':volumeId': key.VolumeId || '',
        ':az': key.AvailabilityZone || '',
      }),
      UpdateExpression:
        'set AssociationId = :associationId, InstanceId = :newInstanceId, KeyStatus = :statusVal, VolumeId = :volumeId, AvailabilityZone = :az',
      ConditionExpression: 'InstanceId = :instanceId',
    }),
  );
}
