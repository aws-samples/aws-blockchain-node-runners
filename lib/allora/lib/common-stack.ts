import * as cdk from "aws-cdk-lib";
import * as cdkConstructs from "constructs";
import * as iam from "aws-cdk-lib/aws-iam";
import * as secrets from "aws-cdk-lib/aws-secretsmanager";
import * as nag from "cdk-nag";

export interface EdgeCommonStackProps extends cdk.StackProps {

}

export class EdgeCommonStack extends cdk.Stack {
    AWS_STACK_NAME = cdk.Stack.of(this).stackName;
    AWS_ACCOUNT_ID = cdk.Stack.of(this).account;

    constructor(scope: cdkConstructs.Construct, id: string, props: EdgeCommonStackProps) {
        super(scope, id, props);

        const instanceRole = new iam.Role(this, "node-role", {
            assumedBy: new iam.ServicePrincipal("ec2.amazonaws.com"),
            managedPolicies: [
                iam.ManagedPolicy.fromAwsManagedPolicyName("AmazonSSMManagedInstanceCore"),
                iam.ManagedPolicy.fromAwsManagedPolicyName("CloudWatchAgentServerPolicy")

            ]
        });

        instanceRole.addToPolicy(new iam.PolicyStatement({
            resources: ["*"],
            actions: ["cloudformation:SignalResource"]
        }));


        new cdk.CfnOutput(this, "Instance Role ARN", {
            value: instanceRole.roleArn,
            exportName: "EdgeNodeInstanceRoleArn"
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
                }
            ],
            true
        );
    }
}
