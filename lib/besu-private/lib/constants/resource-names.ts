// Constants for infrastructure resource name

export const ResourceName = {
  Table: {
    ValidatorKeys: 'BesuValidatorKeys',
    ReadNode: 'BesuReadNodes',
  },
  // Secrets Manager
  SM: {
    KeyNamePrefix: 'ValidatorSignKey',
    KeyConstructPrefix: 'ValidatorSigningKeyConstruct',
    KeySigningRolePrefix: 'ValidatorEC2Role',
  },
  EC2: {
    ValidatorInstanceProfilePrefix: 'ValidatorInstanceProfile',
  },
  Lambda: {
    LifecycleHookName: 'LifecycleHook',
    GenesisGeneratorLambda: 'GenesisArtifactLambda',
    BootNodeArtifactGeneratorLambda: 'BootNodeArtifactLambda',
    PublicKeyLambda: 'PublicKeyFetcherLambda',
  },
  PrivateHostedZone: {
    // TODO : Make configurable.
    ZoneName: 'privatechain.internaldns.aws.org',
  },
  LaunchTemplate: {
    Name: 'validator-launch-config',
  },
  ASG: {
    Validators: 'validator-fleet-asg',
    GroupNameTagKey: 'aws:autoscaling:groupName',
    NameTagKey: 'Name',
    // TODO : Remove the need for this. This is here because signaling needs to know the asg logical id.
    ValidatorASGLogicalId: 'validatorasg123',
  },
  Cloudwatch: {
    PipelineRollbackTag: 'PipelineRollbackAlarm',
  },
};

export function getAutoscalingGroupName(shardId: string) {
  return `shard-${shardId}-${ResourceName.ASG.Validators}`;
}

export function getValidatorHostName(shardId: string, valKeyNum: number) {
  return `val${valKeyNum}.${getShardZoneName(shardId)}`;
}

export function getShardZoneName(shardId: string) {
  return `ch${shardId}.${ResourceName.PrivateHostedZone.ZoneName}`;
}

export function getValidatorClusterName(shardId: string) {
  return `Shard${shardId}-ValidatorCluster`;
}

export function getValidatorFleetClusterName(shardId: string) {
  return `Shard${shardId}-ValidatorFleetCluster`;
}
