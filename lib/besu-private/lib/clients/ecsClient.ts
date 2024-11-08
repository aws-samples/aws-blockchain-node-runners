import {
  ECSClient,
  ListContainerInstancesCommand,
  DescribeContainerInstancesCommand,
  DescribeContainerInstancesResponse,
  UpdateContainerInstancesStateCommand,
  ContainerInstanceStatus,
} from '@aws-sdk/client-ecs';

// Export for unit testing.
export const ecsClient = new ECSClient({});

export async function getContainerInstance(clusterName: string, ec2InstanceId: string): Promise<string> {
  const listContainerInstancesCommand = new ListContainerInstancesCommand({
    cluster: clusterName,
    filter: `ec2InstanceId==${ec2InstanceId}`,
  });

  const response = await ecsClient.send(listContainerInstancesCommand);
  if (response.containerInstanceArns && response.containerInstanceArns.length > 0) {
    return response.containerInstanceArns[0];
  }
  return '';
}

/**
 * Set container instance state to draining, this will trigger NLB connection draining.
 * @param clusterName
 * @param containerInstanceArn
 */
export async function setContainerInstanceStateToDraining(
  clusterName: string,
  containerInstanceArn: string,
): Promise<void> {
  const updateContainerInstancesStateCommand = new UpdateContainerInstancesStateCommand({
    cluster: clusterName,
    containerInstances: [containerInstanceArn],
    status: ContainerInstanceStatus.DRAINING,
  });

  const response = await ecsClient.send(updateContainerInstancesStateCommand);
  if (response.failures && response.failures.length > 0) {
    throw new Error(`Failure when calling UpdateContainerInstancesState: ${JSON.stringify(response.failures)}`);
  }
}

/**
 * Describe container instance, return DescribeContainerInstancesResult
 * @param clusterName
 * @param containerInstanceArn
 */
export async function describeContainerInstance(
  clusterName: string,
  containerInstanceArn: string,
): Promise<DescribeContainerInstancesResponse> {
  const describeContainerInstancesCommand = new DescribeContainerInstancesCommand({
    cluster: clusterName,
    containerInstances: [containerInstanceArn],
  });

  return await ecsClient.send(describeContainerInstancesCommand);
}

/**
 * Return true if the container instance drained from running tasks or deleted
 * @param clusterName
 * @param containerInstanceArn
 */
export async function isInstanceDrainedOrDeleted(clusterName: string, containerInstanceArn: string): Promise<boolean> {
  const ecsResponse: DescribeContainerInstancesResponse = await describeContainerInstance(
    clusterName,
    containerInstanceArn,
  );

  if (ecsResponse.containerInstances && ecsResponse.containerInstances.length > 0) {
    return (
      ecsResponse.containerInstances[0].runningTasksCount == 0 &&
      ecsResponse.containerInstances[0].pendingTasksCount == 0
    );
  } else if (ecsResponse.failures && ecsResponse.failures.length > 0) {
    //MISSING = container not found: https://docs.aws.amazon.com/AmazonECS/latest/developerguide/api_failures_messages.html
    if (ecsResponse.failures.find((failure) => failure.reason === 'MISSING')) {
      return true;
    }
  }

  throw new Error(`Unexpected failure when calling DescribeContainerInstances: ${JSON.stringify(ecsResponse)}`);
}
