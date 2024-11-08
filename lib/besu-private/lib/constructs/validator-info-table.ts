import { Construct } from 'constructs';

// aws-cdk-lib imports
import { RemovalPolicy } from 'aws-cdk-lib';
import { Table, AttributeType, BillingMode, TableEncryption } from 'aws-cdk-lib/aws-dynamodb';
import { Key } from 'aws-cdk-lib/aws-kms';

// constant imports
import { ResourceName } from '../constants/resource-names';

export interface ValidatorInfoTableProps {
  shardId: string;
  encryptionKey: Key;
}

export class ValidatorInfoTable extends Construct {
  public readonly table: Table;
  public readonly tableName: string;

  constructor(scope: Construct, id: string, props: ValidatorInfoTableProps) {
    super(scope, id);
    this.tableName = ResourceName.Table.ValidatorKeys + props.shardId;

    this.table = new Table(this, 'KeysDDB' + props.shardId, {
      tableName: this.tableName,
      partitionKey: { name: 'KeyArn', type: AttributeType.STRING },
      billingMode: BillingMode.PAY_PER_REQUEST,
      pointInTimeRecovery: true,
      timeToLiveAttribute: 'TTL',
      // TODO : Remove when stack re-creation is not a common occurrence.
      removalPolicy: RemovalPolicy.DESTROY,
      encryption: TableEncryption.CUSTOMER_MANAGED,
      encryptionKey: props.encryptionKey,
    });
  }
}
