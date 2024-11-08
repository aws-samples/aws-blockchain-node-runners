import { Construct } from 'constructs';
import path = require('path');
import { PolicyStatement } from 'aws-cdk-lib/aws-iam';
import { ResourceName } from '../constants/resource-names';
import { PrivateHostedZone } from 'aws-cdk-lib/aws-route53';
import { ChainEventHandlerLambda } from './chain-event-handler-function';

export interface InstanceLaunchHookProps {
  readonly resourcePrefix: string;
  readonly serviceAccount: string;
  readonly region: string;
  readonly tableName: string;
  readonly shardId: string;
  readonly autoScalingGroupName: string;
  readonly hostedZone: PrivateHostedZone;
  readonly s3BucketName: string;
  readonly genesisFileName: string;
  readonly bootnodesFileName: string;
  readonly ebsEncryptionKeyArn: string;
}

export class InstanceLaunchHook extends Construct {
  readonly lambda: ChainEventHandlerLambda;
  /**
   * Constructs a new instance of the InstanceLaunchHook class.
   */
  constructor(scope: Construct, id: string, props: InstanceLaunchHookProps) {
    super(scope, id);

    const func = new ChainEventHandlerLambda(this, `${props.resourcePrefix}-InstanceLaunchFunction`, {
      functionPath: path.join(__dirname, `../lambda-functions/asg-instance-launch-hook-func.ts`),
      functionName: `Shard${props.shardId}-${props.resourcePrefix}-${ResourceName.Lambda.LifecycleHookName}-Launch`,
      logicalId: `Shard${props.shardId}${props.resourcePrefix}${ResourceName.Lambda.LifecycleHookName}Launch`,
      environment: {
        SHARD_ID: props.shardId,
        DDB_TABLE_NAME: props.tableName,
        HOSTED_ZONE_ID: props.hostedZone.hostedZoneId,
        BUCKET_NAME: props.s3BucketName,
        BOOTNODES_FILE_NAME: props.bootnodesFileName,
        GENESIS_FILE_NAME: props.genesisFileName,
        EBS_ENCRYPTION_KEY: props.ebsEncryptionKeyArn,
      },
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

    // https://aws.amazon.com/blogs/database/bring-your-own-encryption-keys-to-amazon-dynamodb/
    func.addToRolePolicy(
      new PolicyStatement({
        actions: [
          'kms:CreateGrant',
          'kms:DescribeKey',
          'kms:Encrypt',
          'kms:Decrypt',
          'kms:ReEncrypt*',
          'kms:GenerateDataKey',
          'kms:GenerateDataKeyWithoutPlaintext',
        ],
        resources: ['*'],
      }),
    );

    // Associate roles to ec2 instances
    func.addToRolePolicy(
      new PolicyStatement({
        actions: [
          'ec2:AssociateIamInstanceProfile',
          'ec2:ReplaceIamInstanceProfileAssociation',
          'ec2:DescribeIamInstanceProfileAssociations',
          'ec2:DescribeInstances',
          'ec2:DescribeSnapshots',
          'ec2:AttachVolume',
          'ec2:CreateVolume',
          'ec2:DescribeVolumes',
        ],
        resources: ['*'],
      }),
    );

    func.addToRolePolicy(
      new PolicyStatement({
        actions: ['ssm:SendCommand'],
        resources: ['*'],
      }),
    );

    // Permission to update DNS.
    func.addToRolePolicy(
      new PolicyStatement({
        resources: [props.hostedZone.hostedZoneArn, 'arn:aws:route53:::change/*'],
        actions: ['route53:ListResourceRecordSets', 'route53:ChangeResourceRecordSets', 'route53:GetChange'],
      }),
    );

    // Permission to pass iam role for key access role only
    func.addToRolePolicy(
      new PolicyStatement({
        actions: ['iam:PassRole'],
        resources: [
          `arn:aws:iam::${props.serviceAccount}:role/Shard-${props.shardId}-${ResourceName.SM.KeySigningRolePrefix}*`,
        ],
      }),
    );

    // Scan and update DDB key table
    func.addToRolePolicy(
      new PolicyStatement({
        actions: ['dynamodb:Scan', 'dynamodb:UpdateItem'],
        resources: [`arn:aws:dynamodb:${props.region}:${props.serviceAccount}:table/${props.tableName}`],
      }),
    );

    // Update DNS records
    func.addToRolePolicy(
      new PolicyStatement({
        actions: ['route53:ChangeResourceRecordSets'],
        resources: [`arn:aws:route53:::hostedzone/${props.hostedZone.hostedZoneId}`],
      }),
    );

    func.addToRolePolicy(
      new PolicyStatement({
        actions: ['s3:GetObject'],
        resources: [`arn:aws:s3:::${props.s3BucketName}/*`],
      }),
    );

    this.lambda = func;
  }
}
