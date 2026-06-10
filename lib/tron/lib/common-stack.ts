import * as cdk from "aws-cdk-lib";
import * as cdkConstructs from "constructs";
import * as iam from "aws-cdk-lib/aws-iam";
import * as nag from "cdk-nag";
import { SnapshotsS3BucketConstruct } from "../../constructs/snapshots-bucket";

export interface TronCommonStackProps extends cdk.StackProps {
}

export class TronCommonStack extends cdk.Stack {
    AWS_STACK_NAME = cdk.Stack.of(this).stackName;
    AWS_ACCOUNT_ID = cdk.Stack.of(this).account;

    constructor(scope: cdkConstructs.Construct, id: string, props: TronCommonStackProps) {
        super(scope, id, props);

        const region = cdk.Stack.of(this).region;

        const instanceRole = new iam.Role(this, "node-role", {
            assumedBy: new iam.ServicePrincipal("ec2.amazonaws.com"),
            managedPolicies: [
                iam.ManagedPolicy.fromAwsManagedPolicyName("AmazonSSMManagedInstanceCore"),
                iam.ManagedPolicy.fromAwsManagedPolicyName("CloudWatchAgentServerPolicy")
            ]
        });

        instanceRole.addToPolicy(new iam.PolicyStatement({
            resources: [`arn:aws:cloudformation:${region}:${this.AWS_ACCOUNT_ID}:stack/tron-*/*`],
            actions: ["cloudformation:SignalResource"]
        }));

        instanceRole.addToPolicy(new iam.PolicyStatement({
            resources: [`arn:aws:autoscaling:${region}:${this.AWS_ACCOUNT_ID}:autoScalingGroup:*:autoScalingGroupName/tron-*`],
            actions: ["autoscaling:CompleteLifecycleAction"]
        }));

        // in lifecycle
        instanceRole.addToPolicy(new iam.PolicyStatement({
            resources: [`arn:aws:autoscaling:${region}:${this.AWS_ACCOUNT_ID}:autoScalingGroup:*:autoScalingGroupName/tron-*`],
            actions: ["autoscaling:RecordLifecycleActionHeartbeat"]
        }));

        // Private S3 bucket for snapshot staging (used when TRON_SNAPSHOT_TYPE=s3).
        // The snapshot node uploads here; RPC/single nodes restore from here via s5cmd.
        const snapshotsBucket = new SnapshotsS3BucketConstruct(this, "snapshots-bucket", {
            bucketName: `tron-snapshots-${this.AWS_ACCOUNT_ID}-${region}`
        });
        instanceRole.addToPolicy(new iam.PolicyStatement({
            resources: [snapshotsBucket.bucketArn, snapshotsBucket.arnForObjects("*")],
            actions: ["s3:ListBucket", "s3:GetObject", "s3:PutObject", "s3:DeleteObject"]
        }));

        new cdk.CfnOutput(this, "Instance Role ARN", {
            value: instanceRole.roleArn,
            exportName: "TronNodeInstanceRoleArn"
        });

        new cdk.CfnOutput(this, "Snapshot Bucket Name", {
            value: snapshotsBucket.bucketName,
            exportName: "TronNodeSnapshotBucketName"
        });

        // cdk-nag suppressions
        nag.NagSuppressions.addResourceSuppressions(
            this,
            [
                {
                    id: "AwsSolutions-IAM4",
                    reason: "AmazonSSMManagedInstanceCore and CloudWatchAgentServerPolicy are restrictive enough"
                },
                {
                    id: "AwsSolutions-IAM5",
                    reason: "Can't target specific stack: https://github.com/aws/aws-cdk/issues/22657"
                },
                {
                    id: "AwsSolutions-S1",
                    reason: "Server access logs are not required for the transient snapshot staging bucket"
                }
            ],
            true
        );
    }
}
