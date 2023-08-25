import * as cdk from "aws-cdk-lib";
import * as cdkContructs from 'constructs';
import * as s3 from "aws-cdk-lib/aws-s3";

export interface SnapshotsS3BucketConstructProps {
    bucketName: string;
}
export class SnapshotsS3BucketConstruct extends cdkContructs.Construct {
    public bucketName: string;
    public bucketArn: string;
    public arnForObjects: any;

  constructor(scope: cdkContructs.Construct, id: string, props: SnapshotsS3BucketConstructProps) {
    super(scope, id);
    const { 
        bucketName
    } = props;

    const snapshotsBucket = new s3.Bucket(this, id, {
        bucketName: bucketName,
        removalPolicy: cdk.RemovalPolicy.DESTROY,
        autoDeleteObjects: true,
        versioned: false,
        accessControl: s3.BucketAccessControl.PRIVATE,
        publicReadAccess: false,
        blockPublicAccess: new s3.BlockPublicAccess(s3.BlockPublicAccess.BLOCK_ALL),
        bucketKeyEnabled: false,
        encryption: s3.BucketEncryption.S3_MANAGED,
        enforceSSL: true,
      });
    
      this.bucketName = snapshotsBucket.bucketName;
      this.bucketArn = snapshotsBucket.bucketArn;
      this.arnForObjects = snapshotsBucket.arnForObjects;
  }
}