import * as cdk from "aws-cdk-lib";
import * as cdkConstructs from "constructs";
import * as iam from 'aws-cdk-lib/aws-iam';
import * as nag from "cdk-nag";

export interface XRPCommonStackProps extends cdk.StackProps {

}

export class XRPCommonStack extends cdk.Stack {
    AWS_STACKNAME = cdk.Stack.of(this).stackName;
    AWS_ACCOUNT_ID = cdk.Stack.of(this).account;
    instanceRole: iam.Role;

    constructor(scope: cdkConstructs.Construct, id: string, props: XRPCommonStackProps) {
        super(scope, id, props);

        const region = cdk.Stack.of(this).region;

         this.instanceRole = new iam.Role(this, `node-role`, {
            assumedBy: new iam.ServicePrincipal("ec2.amazonaws.com"),
            managedPolicies: [
                iam.ManagedPolicy.fromAwsManagedPolicyName("SecretsManagerReadWrite"),
                iam.ManagedPolicy.fromAwsManagedPolicyName("AmazonSSMManagedInstanceCore"),
                iam.ManagedPolicy.fromAwsManagedPolicyName("CloudWatchAgentServerPolicy"),
            ],
        });

        this.instanceRole.addToPolicy(new iam.PolicyStatement({
             // Can't target specific stack: https://github.com/aws/aws-cdk/issues/22657
            resources: ["*"],
            actions: ["cloudformation:SignalResource"],
           }));

        this.instanceRole.addToPolicy(new iam.PolicyStatement({
           resources: [`arn:aws:autoscaling:${region}:${this.AWS_ACCOUNT_ID}:autoScalingGroup:*:autoScalingGroupName/xrp-*`],
           actions: ["autoscaling:CompleteLifecycleAction"],
          }));

        this.instanceRole.addToPolicy(
            new iam.PolicyStatement({
                resources: [
                    `arn:aws:s3:::cloudformation-examples`,
                    `arn:aws:s3:::cloudformation-examples/*`,
                ],
                actions: ["s3:ListBucket", "s3:*Object", "s3:GetBucket*"],
            })
        );

        new cdk.CfnOutput(this, "Instance Role ARN", {
            value: this.instanceRole.roleArn,
            exportName: "XRPNodeInstanceRoleArn",
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
            ],
            true
        );
    }
}
