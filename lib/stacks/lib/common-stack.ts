import * as cdk from "aws-cdk-lib";
import * as cdkConstructs from "constructs";
import * as iam from 'aws-cdk-lib/aws-iam';
import * as nag from "cdk-nag";

export interface StacksCommonStackProps extends cdk.StackProps {

}

export class StacksCommonStack extends cdk.Stack {
    AWS_STACKNAME = cdk.Stack.of(this).stackName;
    AWS_ACCOUNT_ID = cdk.Stack.of(this).account;

    constructor(scope: cdkConstructs.Construct, id: string, props: StacksCommonStackProps) {
        super(scope, id, props);

        const region = cdk.Stack.of(this).region;

        const instanceRole = new iam.Role(this, `node-role`, {
            assumedBy: new iam.ServicePrincipal("ec2.amazonaws.com"),
            managedPolicies: [
                iam.ManagedPolicy.fromAwsManagedPolicyName("SecretsManagerReadWrite"),
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
           resources: [`arn:aws:autoscaling:${region}:${this.AWS_ACCOUNT_ID}:autoScalingGroup:*:autoScalingGroupName/stacks-*`],
           actions: ["autoscaling:CompleteLifecycleAction"],
        }));

        new cdk.CfnOutput(this, "Instance Role ARN", {
            value: instanceRole.roleArn,
            exportName: "StacksNodeInstanceRoleArn",
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
