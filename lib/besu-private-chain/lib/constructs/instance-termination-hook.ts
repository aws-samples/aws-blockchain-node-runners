import { Construct } from 'constructs';
import path = require('path');
import { PolicyStatement } from 'aws-cdk-lib/aws-iam';
import { ChainEventHandlerLambda } from './chain-event-handler-function';
import { getValidatorClusterName, ResourceName } from '../constants/resource-names';
import { Runtime } from 'aws-cdk-lib/aws-lambda';

export interface InstanceLaunchHookProps {
  readonly resourcePrefix: string;
  readonly serviceAccount: string;
  readonly region: string;
  readonly tableName: string;
  readonly shardId: string;
  readonly autoScalingGroupName: string;
}

export class InstanceTerminationHook extends Construct {
  readonly lambda: ChainEventHandlerLambda;
  /**
   * Constructs a new instance of the InstanceLaunchHook class.
   */
  constructor(scope: Construct, id: string, props: InstanceLaunchHookProps) {
    super(scope, id);

    const func = new ChainEventHandlerLambda(this, `${props.resourcePrefix}-InstanceTerminationFunction`, {
      functionPath: path.join(__dirname, `../lambda-functions/asg-instance-termination-hook-func.ts`),
      functionName: `Shard${props.shardId}-${props.resourcePrefix}-${ResourceName.Lambda.LifecycleHookName}-Termination`,
      logicalId: `Shard${props.shardId}${props.resourcePrefix}${ResourceName.Lambda.LifecycleHookName}Termination`,
      environment: {
        DDB_TABLE_NAME: props.tableName,
        SHARD_ID: props.shardId,
      },
      runtime: Runtime.NODEJS_LATEST,
    });

    // Permission to complete ASG Lifecycle Action
    func.addToRolePolicy(
      new PolicyStatement({
        actions: ['autoscaling:CompleteLifecycleAction'],
        resources: [
          `arn:aws:autoscaling:${props.region}:${props.serviceAccount}:autoScalingGroup:*:autoScalingGroupName/${props.autoScalingGroupName}`,
        ],
      }),
    );

    // Associate roles to ec2 instances
    func.addToRolePolicy(
      new PolicyStatement({
        actions: ['ec2:DisassociateIamInstanceProfile', 'ec2:DescribeInstances'],
        resources: ['*'],
      }),
    );

    // Update DDB key table
    func.addToRolePolicy(
      new PolicyStatement({
        actions: ['dynamodb:Scan', 'dynamodb:UpdateItem'],
        resources: [`arn:aws:dynamodb:${props.region}:${props.serviceAccount}:table/${props.tableName}`],
      }),
    );

    func.addToRolePolicy(
      new PolicyStatement({
        actions: ['ecs:ListContainerInstances'],
        resources: [
          `arn:aws:ecs:${props.region}:${props.serviceAccount}:cluster/${getValidatorClusterName(props.shardId)}`,
        ],
      }),
    );

    func.addToRolePolicy(
      new PolicyStatement({
        actions: ['ecs:DescribeContainerInstances', 'ecs:UpdateContainerInstancesState'],
        resources: ['*'],
        conditions: {
          ArnEquals: {
            'ecs:cluster': `arn:aws:ecs:${props.region}:${props.serviceAccount}:cluster/${getValidatorClusterName(
              props.shardId,
            )}`,
          },
        },
      }),
    );

    func.addToRolePolicy(
      new PolicyStatement({
        actions: [
          'kms:CreateGrant',
          'kms:Decrypt',
          'kms:DescribeKey',
          'kms:EnableKeyRotation',
          'kms:Encrypt',
          'kms:GenerateDataKey',
          'kms:GenerateDataKeyWithoutPlaintext',
          'kms:ReEncrypt*',
        ],
        resources: ['*'],
      }),
    );

    this.lambda = func;
  }
}
