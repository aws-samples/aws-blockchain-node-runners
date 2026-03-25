import * as cdk from "aws-cdk-lib";
import * as cdkConstructs from "constructs";
import * as iam from "aws-cdk-lib/aws-iam";
import * as s3Assets from "aws-cdk-lib/aws-s3-assets";
import * as path from "path";
import * as nag from "cdk-nag";

export class PolygonCommonStack extends cdk.Stack {
    constructor(scope: cdkConstructs.Construct, id: string, props?: cdk.StackProps) {
        super(scope, id, props);

        const region = cdk.Stack.of(this).region;
        const asset = new s3Assets.Asset(this, "assets", {
            path: path.join(__dirname, "assets"),
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
                resources: ["*"],
                actions: ["cloudformation:SignalResource"],
            })
        );

        new cdk.CfnOutput(this, "Instance Role ARN", {
            value: instanceRole.roleArn,
            exportName: "PolygonNodeInstanceRoleArn",
        });

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
            ],
            true
        );
    }
}
