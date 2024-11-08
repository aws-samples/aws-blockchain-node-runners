import { Construct } from 'constructs';
import { CfnLifecyclePolicy } from 'aws-cdk-lib/aws-dlm';
import { IRole, ManagedPolicy, Role, ServicePrincipal } from 'aws-cdk-lib/aws-iam';
import { CfnTag } from 'aws-cdk-lib/core/lib/cfn-tag';

export interface DLMPolicyProps {
  readonly targetTag: CfnTag;
  readonly stage: string;
  readonly shardId: string;
  readonly region: string;
}

export const snapshotManagementSchedule = {
  snapshotCreationIntervalInHours: 24,
  snapshotRetentionIntervalInDays: 14,
  snapshotCreationTimes: ['06:55'],
};

export class DLMPolicy extends Construct {
  private dlmPolicy: CfnLifecyclePolicy;

  constructor(scope: Construct, id: string, props: DLMPolicyProps) {
    super(scope, id);
    const suffix = `${props.shardId}-${props.stage}-${props.region}`;
    const executionRole = this.createRole(suffix);
    this.createPolicy(executionRole, suffix, props);
  }

  private createRole(suffix: string): IRole {
    const name = `dlmPolicyExecutionRole-${suffix}`;
    const executionRole = new Role(this, name, {
      assumedBy: new ServicePrincipal('dlm.amazonaws.com'),
      roleName: name,
    });

    executionRole.addManagedPolicy(
      ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSDataLifecycleManagerServiceRole'),
    );

    return executionRole;
  }

  private createPolicy(executionRole: IRole, suffix: string, props: DLMPolicyProps) {
    this.dlmPolicy = new CfnLifecyclePolicy(this, `validatorInstanceBasedDLMPolicy-${suffix}`, {
      executionRoleArn: executionRole.roleArn,
      description: 'DLM policy for managing validator snapshots',
      state: 'ENABLED',
      policyDetails: {
        resourceTypes: ['INSTANCE'],
        policyType: 'EBS_SNAPSHOT_MANAGEMENT',
        targetTags: [props.targetTag],
        parameters: {
          excludeBootVolume: true,
        },
        schedules: [
          {
            name: 'Daily Snapshots',
            tagsToAdd: [
              {
                key: 'type',
                value: 'DailySnapshot',
              },
            ],
            createRule: {
              interval: snapshotManagementSchedule.snapshotCreationIntervalInHours,
              intervalUnit: 'HOURS',
              times: snapshotManagementSchedule.snapshotCreationTimes,
            },
            retainRule: {
              interval: snapshotManagementSchedule.snapshotRetentionIntervalInDays,
              intervalUnit: 'DAYS',
            },
            copyTags: true,
          },
        ],
      },
    });
  }
}
