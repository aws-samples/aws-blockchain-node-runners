import { Handler } from 'aws-lambda';
import assert from 'assert';
import { getCurrentKeyUsedByEC2Instance, detachKeyFromEc2Instance } from '../clients/dynamodbClient';
import { sendLifecycleHookFailure, sendLifecycleHookSuccess } from '../clients/ec2AutoScalingClient';
import { disassociateInstanceProfile, getInstanceVolumeId, getInstanceAZ } from '../clients/ec2Client';
import { EBS_CONFIG } from '../constants/besu';
import {
  getContainerInstance,
  isInstanceDrainedOrDeleted,
  setContainerInstanceStateToDraining,
} from '../clients/ecsClient';
import { getValidatorClusterName } from '../constants/resource-names';

export const handler: Handler = async (event, context) => {
  console.log('INFO: Received event: ', JSON.stringify(event));

  const instanceId = event.detail.EC2InstanceId;
  if (!instanceId) {
    console.log('WARN: Got event without EC2InstanceId.');
    await sendLifecycleHookFailure(event.detail);
    return;
  }
  console.log('InstanceId: ', instanceId);

  assert(process.env.SHARD_ID, 'shardId env variable is required');

  try {
    const validatorKey = await getCurrentKeyUsedByEC2Instance(instanceId);
    console.log('Found current key used by the instance: ', JSON.stringify(validatorKey));
    if (validatorKey.AssociationId) {
      try {
        await disassociateInstanceProfile(validatorKey.AssociationId as string);
      } catch (disassociateRoleError) {
        //Association might have been deleted at this point and this is non-blocking task so logging error then continue
        console.log(
          `Error: ${disassociateRoleError} occurred when disassociating role from ec2 instance. Continuing..`,
        );
      }
    }
    if (!validatorKey.AvailabilityZone || !validatorKey.VolumeId) {
      // Should only need to happen once.
      console.log('Populating VolumeId and AZ');
      validatorKey.AvailabilityZone = await getInstanceAZ(instanceId);
      console.log('InstanceAZ: ', validatorKey.AvailabilityZone);
      validatorKey.VolumeId = await getInstanceVolumeId(instanceId, EBS_CONFIG.DATA_VOLUME_NAME);
      console.log('InstanceVolumeId: ', validatorKey.VolumeId);
    }

    await detachKeyFromEc2Instance(validatorKey);
    await drainEcsInstance(process.env.SHARD_ID as string, instanceId);

    await sendLifecycleHookSuccess(event.detail);
    console.log('Cleaned up successfully.');
  } catch (error) {
    console.log(`Error occurred detaching key from ec2 instance: ${error}`);
    await sendLifecycleHookFailure(event.detail);
    throw error;
  }
};

async function drainEcsInstance(shardId: string, instanceId: string) {
  try {
    //drain running task on the instance
    const validatorClusterName = getValidatorClusterName(process.env.SHARD_ID as string);
    const containerInstanceArn = await getContainerInstance(validatorClusterName, instanceId);
    //set container instance to draining, this will trigger instance connection draining
    await setContainerInstanceStateToDraining(validatorClusterName, containerInstanceArn);

    //check if any tasks on the instance, timeout at 20s
    const maxRetry = 10;
    let numOfRetry = 0;
    let instanceDrainedOrDeleted = false;

    while (numOfRetry < maxRetry && instanceDrainedOrDeleted == false) {
      //sleep for 2s
      await new Promise((r) => setTimeout(r, 2000));
      instanceDrainedOrDeleted = await isInstanceDrainedOrDeleted(validatorClusterName, containerInstanceArn);
      numOfRetry++;
    }
    console.log(
      `Draining tasks: ${instanceDrainedOrDeleted ? 'SUCCESS' : 'FAILURE'}. Number of retries: ${numOfRetry}`,
    );
  } catch (drainContainerInstanceError) {
    //log error and continue, connection draining failure is a non-blocking issue to instance termination
    console.log(`Error: ${drainContainerInstanceError} occurred when draining ECS container instance. Continuing..`);
  }
}
