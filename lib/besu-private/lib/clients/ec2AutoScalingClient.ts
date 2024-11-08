import { AutoScalingClient, CompleteLifecycleActionCommand } from '@aws-sdk/client-auto-scaling';
import { LifecycleHookAction } from '../constants/lifecycle-hook-action';

const autoScalingClient = new AutoScalingClient();

export async function sendLifecycleHookSuccess(message: any) {
  await sendLifecycleHookResultToAutoScaling(message, LifecycleHookAction.CONTINUE);
}

export async function sendLifecycleHookFailure(message: any) {
  await sendLifecycleHookResultToAutoScaling(message, LifecycleHookAction.ABANDON);
}

async function sendLifecycleHookResultToAutoScaling(message: any, actionResult: LifecycleHookAction) {
  const command = new CompleteLifecycleActionCommand({
    LifecycleHookName: message.LifecycleHookName,
    AutoScalingGroupName: message.AutoScalingGroupName,
    LifecycleActionResult: actionResult,
    LifecycleActionToken: message.LifecycleActionToken,
    InstanceId: message.EC2InstanceId,
  });
  return await autoScalingClient.send(command);
}
