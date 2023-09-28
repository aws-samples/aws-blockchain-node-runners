import * as cdk from "aws-cdk-lib";
import * as cdkConstructs from "constructs";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as iam from 'aws-cdk-lib/aws-iam';
import * as nag from "cdk-nag";
import * as s3Assets from "aws-cdk-lib/aws-s3-assets";
import * as path from "path";
import { SnapshotsS3BucketConstruct } from "../../constructs/snapshots-bucket";

export interface PolygonCommonStackProps extends cdk.StackProps {
    createVpcEnpointS3: boolean;

}

export class PolygonCommonStack extends cdk.Stack {
    AWS_STACKNAME = cdk.Stack.of(this).stackName;
    AWS_ACCOUNT_ID = cdk.Stack.of(this).account;

    constructor(scope: cdkConstructs.Construct, id: string, props: PolygonCommonStackProps) {
        super(scope, id, props);

        const vpc = ec2.Vpc.fromLookup(this, "vpc", { isDefault: true });
        const region = cdk.Stack.of(this).region;
        const asset = new s3Assets.Asset(this, "assets", {
            path: path.join(__dirname, "assets"),
        });

        const snapshotsBucket = new SnapshotsS3BucketConstruct(this, `snapshots-s3-bucket`, {
            bucketName: `polygon-snapshots-${this.AWS_ACCOUNT_ID}-${this.AWS_STACKNAME}`,
           });

        
        if (props.createVpcEnpointS3){
            const s3VPCEndpoint = vpc.addGatewayEndpoint('s3-vpc-endpoint', {
                service: ec2.GatewayVpcEndpointAwsService.S3,
            })

            s3VPCEndpoint.addToPolicy(new iam.PolicyStatement({
                principals: [new iam.AnyPrincipal()],
                resources: [
                    snapshotsBucket.bucketArn, 
                    snapshotsBucket.arnForObjects("*"),
                    `arn:aws:s3:::amazonlinux-2-repos-${region}`,
                    `arn:aws:s3:::amazonlinux-2-repos-${region}/*`,
                    `arn:aws:s3:::${asset.s3BucketName}`,
                    `arn:aws:s3:::${asset.s3BucketName}/*`,
                ],
                actions: ["s3:ListBucket", "s3:*Object", "s3:GetBucket*"],
            }));
            
            new cdk.CfnOutput(this, "VPC Gateway Endpoint ID", {
                value: s3VPCEndpoint.vpcEndpointId,
                exportName: "VPCGatewayEndpointID",
            });
        } else {
            // We assume that the VPC endpoint is already created by another stack so we re-using the ID it has exported.
            const importedS3VPCEndpointID = cdk.Fn.importValue("VPCGatewayEndpointID");
            const s3VPCEndpoint = <cdk.aws_ec2.GatewayVpcEndpoint> ec2.GatewayVpcEndpoint.fromGatewayVpcEndpointId(this, "s3-vpc-endpoint", importedS3VPCEndpointID);
            s3VPCEndpoint.addToPolicy(new iam.PolicyStatement({
                principals: [new iam.AnyPrincipal()],
                resources: [
                    snapshotsBucket.bucketArn, 
                    snapshotsBucket.arnForObjects("*"),
                ],
                actions: ["s3:ListBucket", "s3:*Object", "s3:GetBucket*"],
            }));
        }

        const instanceRole = new iam.Role(this, `node-role`, {
            assumedBy: new iam.ServicePrincipal("ec2.amazonaws.com"),
            managedPolicies: [
                iam.ManagedPolicy.fromAwsManagedPolicyName("AmazonSSMManagedInstanceCore"),
                iam.ManagedPolicy.fromAwsManagedPolicyName("CloudWatchAgentServerPolicy"),
            ],
        });

        instanceRole.addToPolicy(new iam.PolicyStatement({
             // Can't target specific stack: https://github.com/aws/aws-cdk/issues/22657
            resources: ["*"],
            actions: ["cloudformation:SignalResource"],
           }));
        
        instanceRole.addToPolicy(new iam.PolicyStatement({
           resources: [`arn:aws:autoscaling:${region}:${this.AWS_ACCOUNT_ID}:autoScalingGroup:*:autoScalingGroupName/polygon-*`],
           actions: ["autoscaling:CompleteLifecycleAction"],
          }));
        
        instanceRole.addToPolicy(new iam.PolicyStatement({
           resources: [snapshotsBucket.bucketArn, snapshotsBucket.arnForObjects("*")],
           actions: ["s3:ListBucket", "s3:*Object"],
          }));

        new cdk.CfnOutput(this, "Instance Role ARN", {
            value: instanceRole.roleArn,
            exportName: "PolygonNodeInstanceRoleArn",
        });

        new cdk.CfnOutput(this, "Snapshot Bucket Name", {
            value: snapshotsBucket.bucketName,
            exportName: "PolygonNodeSnapshotBucketName",
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
