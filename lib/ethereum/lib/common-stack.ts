import * as cdk from "aws-cdk-lib";
import * as cdkConstructs from "constructs";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as iam from "aws-cdk-lib/aws-iam";
import * as nag from "cdk-nag";
import * as s3Assets from "aws-cdk-lib/aws-s3-assets";
import * as path from "path";
import { SnapshotsS3BucketConstruct } from "../../constructs/snapshots-bucket";

export interface EthCommonStackProps extends cdk.StackProps {}

export class EthCommonStack extends cdk.Stack {
    AWS_STACKNAME = cdk.Stack.of(this).stackName;
    AWS_ACCOUNT_ID = cdk.Stack.of(this).account;
    AWS_REGION = cdk.Stack.of(this).region

    constructor(scope: cdkConstructs.Construct, id: string, props: EthCommonStackProps) {
        super(scope, id, props);

        const vpc = ec2.Vpc.fromLookup(this, "vpc", { isDefault: true });
        const region = cdk.Stack.of(this).region;
        const asset = new s3Assets.Asset(this, "assets", {
            path: path.join(__dirname, "assets"),
        });

        const snapshotsBucket = new SnapshotsS3BucketConstruct(this, `snapshots-s3-bucket`, {
            bucketName: `eth-snapshots-${this.AWS_STACKNAME}-${this.AWS_ACCOUNT_ID}-${this.AWS_REGION}`,
        });

        const s3VPCEndpoint = vpc.addGatewayEndpoint("s3-vpc-endpoint", {
            service: ec2.GatewayVpcEndpointAwsService.S3,
        });

        const instanceRole = new iam.Role(this, `node-role`, {
            assumedBy: new iam.ServicePrincipal("ec2.amazonaws.com"),
            managedPolicies: [
                iam.ManagedPolicy.fromAwsManagedPolicyName("AmazonSSMManagedInstanceCore"),
                iam.ManagedPolicy.fromAwsManagedPolicyName("CloudWatchAgentServerPolicy"),
            ],
        });

        instanceRole.addToPolicy(
            new iam.PolicyStatement({
                // Can't target specific stack: https://github.com/aws/aws-cdk/issues/22657
                resources: ["*"],
                actions: ["cloudformation:SignalResource"],
            })
        );

        instanceRole.addToPolicy(
            new iam.PolicyStatement({
                resources: [
                    `arn:aws:autoscaling:${region}:${this.AWS_ACCOUNT_ID}:autoScalingGroup:*:autoScalingGroupName/eth-*`,
                ],
                actions: ["autoscaling:CompleteLifecycleAction"],
            })
        );

        instanceRole.addToPolicy(
            new iam.PolicyStatement({
                resources: [snapshotsBucket.bucketArn, snapshotsBucket.arnForObjects("*")],
                actions: ["s3:ListBucket", "s3:*Object"],
            })
        );

        // Limiting access through this VPC endpoint only to our sync bucket and Amazon linux repo bucket
        s3VPCEndpoint.addToPolicy(
            new iam.PolicyStatement({
                principals: [new iam.AnyPrincipal()],
                resources: [
                    snapshotsBucket.bucketArn,
                    snapshotsBucket.arnForObjects("*"),
                    `arn:aws:s3:::al2023-repos-${region}-*`,
                    `arn:aws:s3:::al2023-repos-${region}-*/*`,
                    `arn:aws:s3:::amazonlinux-2-repos-${region}`,
                    `arn:aws:s3:::amazonlinux-2-repos-${region}/*`,
                    `arn:aws:s3:::${asset.s3BucketName}`,
                    `arn:aws:s3:::${asset.s3BucketName}/*`,
                    "arn:aws:s3:::cloudformation-examples",
                    "arn:aws:s3:::cloudformation-examples/*",
                    "arn:aws:s3:::amazoncloudwatch-agent",
                    "arn:aws:s3:::amazoncloudwatch-agent/*"
                ],
                actions: ["s3:ListBucket", "s3:*Object", "s3:GetBucket*"],
            })
        );

        s3VPCEndpoint.addToPolicy(
            new iam.PolicyStatement({
                principals: [new iam.AnyPrincipal()],
                resources: ["arn:aws:s3:::docker-images-prod", "arn:aws:s3:::docker-images-prod/*"],
                actions: ["*"],
                sid: "Allow access to docker images",
            })
        );

        new cdk.CfnOutput(this, "Instance Role ARN", {
            value: instanceRole.roleArn,
            exportName: "NodeInstanceRoleArn",
        });

        new cdk.CfnOutput(this, "Snapshot Bucket Name", {
            value: snapshotsBucket.bucketName,
            exportName: "NodeSnapshotBucketName",
        });

        /**
         * cdk-nag suppressions
         */

        nag.NagSuppressions.addResourceSuppressions(
            this,
            [
                {
                    id: "AwsSolutions-IAM4",
                    reason: "AmazonSSMManagedInstanceCore and CloudWatchAgentServerPolicy are restrictive enough",
                },
                {
                    id: "AwsSolutions-IAM5",
                    reason: "Can't target specific stack: https://github.com/aws/aws-cdk/issues/22657",
                },
                {
                    id: "AwsSolutions-S1",
                    reason: "No access log needed for storying nodes state as it is public data",
                },
            ],
            true
        );
    }
}
