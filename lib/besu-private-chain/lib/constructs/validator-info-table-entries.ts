import { Construct } from 'constructs';
import { Duration } from 'aws-cdk-lib';
import { Effect, PolicyStatement } from 'aws-cdk-lib/aws-iam';
import { Key } from 'aws-cdk-lib/aws-kms';
import { AwsCustomResource, AwsCustomResourcePolicy, PhysicalResourceId } from 'aws-cdk-lib/custom-resources';
import { ValidatorECCKeySet } from './validator-ecc-keyset';
import { ValidatorECCKey } from './validator-ecc-key';
import { KeyStatus } from '../constants/key-status';
import { marshall } from '@aws-sdk/util-dynamodb';

const DDB_ROW_EXPIRY_IN_DAYS = 14;

export interface ValidatorInfoTableEntriesProps {
  ValidatorECCKeys: ValidatorECCKeySet;
  tableArn: string;
  tableName: string;
  safeDelete?: boolean;
  validatorKeyTableEncryptionKey: Key;
}

// This class controls the mutation of DDB entries in the ValidatorKeys DDB table.
// based upon the provisioned CDK resources, namely KMS keys and Roles.
export class ValidatorInfoTableEntries extends Construct {
  constructor(scope: Construct, id: string, props: ValidatorInfoTableEntriesProps) {
    super(scope, id);
    // Safe delete won't touch key status. Enabling validators to keep taking
    // this key until TTL.
    const invalidateExpr = props.safeDelete ? '' : ', KeyStatus = :status';

    // https://aws.amazon.com/blogs/database/bring-your-own-encryption-keys-to-amazon-dynamodb/
    const policyStatement = new PolicyStatement({
      effect: Effect.ALLOW,
      actions: [
        'kms:DescribeKey',
        'kms:Encrypt',
        'kms:Decrypt',
        'kms:ReEncrypt*',
        'kms:GenerateDataKey',
        'kms:GenerateDataKeyWithoutPlaintext',
        'dynamodb:PutItem',
        'dynamodb:UpdateItem',
      ],
      resources: [props.tableArn, props.validatorKeyTableEncryptionKey.keyArn],
    });

    const keySet = props.ValidatorECCKeys;
    for (const [keyNumber, keyConstruct] of keySet.eccKeys) {
      const resourceId = PhysicalResourceId.of(`${props.tableName}-key-${keyNumber}-${keyConstruct.eccSecret.secretArn}`);
      new AwsCustomResource(this, 'ddbKey' + keyNumber, {
        onCreate: {
          service: 'DynamoDB',
          action: 'putItem',
          parameters: {
            TableName: props.tableName,
            Item: this.newItemFromKey(keyConstruct),
          },
          physicalResourceId: resourceId,
        },
        onUpdate: {
          service: 'DynamoDB',
          action: 'updateItem',
          parameters: {
            TableName: props.tableName,
            Key: marshall({ KeyArn: keyConstruct.eccSecret.secretArn }),
            UpdateExpression: 'SET AccessRole = :r, KeyNumber = :k, PublicKey = :p',
            ExpressionAttributeValues: marshall({
              ':r': keyConstruct.instanceProfile.attrArn,
              ':k': keyConstruct.keyNumber,
              ':p': keyConstruct.publicKey
            }),
          },
          physicalResourceId: resourceId,
        },
        onDelete: {
          service: 'DynamoDB',
          action: 'updateItem',
          parameters: {
            TableName: props.tableName,
            Key: marshall({ KeyArn: keyConstruct.eccSecret.secretArn }),
            UpdateExpression: 'SET #time_to_live = :ttl' + invalidateExpr,
            ExpressionAttributeValues: this.ttlExpressionFromKey(),
            ExpressionAttributeNames: { '#time_to_live': 'TTL' },
          },
          physicalResourceId: resourceId,
        },
        policy: AwsCustomResourcePolicy.fromStatements([policyStatement]),
      });
    }
  }

  private ttlExpressionFromKey(): any {
    // TTL the ddb entry DDB_ROW_EXPIRY_IN_DAYS days from now upon key deactivation.
    // This is to allow time for validator set change to occur on the blockchain.
    const twoWeeksFromNowInSeconds =
      Duration.days(DDB_ROW_EXPIRY_IN_DAYS).toSeconds() +
      // Rounded to the nearest day, this is to prevent frequent Custom Resource
      // updates caused by changes in the TTL field.
      Math.round(Date.now() / 1000 / 3600 / 24) * 24 * 3600;
    return marshall({
      ':ttl': twoWeeksFromNowInSeconds.toString(),
      ':status': KeyStatus.INACTIVE,
    });
  }

  private newItemFromKey(keyConstruct: ValidatorECCKey): any {
    return marshall({
      PublicKey: keyConstruct.publicKey,
      KeyNumber: keyConstruct.keyNumber,
      AccessRole: keyConstruct.instanceProfile.attrArn,
      KeyArn: keyConstruct.eccSecret.secretArn,
      KeyStatus: KeyStatus.AVAILABLE,
      AvailabilityZone: '',
    });
  }
}
