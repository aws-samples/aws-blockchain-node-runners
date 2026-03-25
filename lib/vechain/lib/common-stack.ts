import * as cdk from "aws-cdk-lib";
import * as iam from 'aws-cdk-lib/aws-iam';
import * as nag from "cdk-nag";
import * as cdkConstructs from "constructs";

export interface VetCommonStackProps extends cdk.StackProps {
}

export class VetCommonStack extends cdk.Stack {
    AWS_STACKNAME = cdk.Stack.of(this).stackName;
    AWS_ACCOUNT_ID = cdk.Stack.of(this).account;
    AWS_REGION = cdk.Stack.of(this).region

    instanceRole: iam.Role;

    constructor(scope: cdkConstructs.Construct, id: string, props: VetCommonStackProps) {
        super(scope, id, props);

        this.instanceRole = new iam.Role(this, `node-role`, {
            assumedBy: new iam.ServicePrincipal("ec2.amazonaws.com"),
            managedPolicies: [
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
            resources: [`arn:aws:autoscaling:${this.AWS_REGION}:${this.AWS_ACCOUNT_ID}:autoScalingGroup:*:autoScalingGroupName/vet-*`],
            actions: ["autoscaling:CompleteLifecycleAction"],
        }));

        // Allow ASG lifecycle heartbeats from the instance when needed
        this.instanceRole.addToPolicy(new iam.PolicyStatement({
            resources: [`arn:aws:autoscaling:${this.AWS_REGION}:${this.AWS_ACCOUNT_ID}:autoScalingGroup:*:autoScalingGroupName/vet-*`],
            actions: ["autoscaling:RecordLifecycleActionHeartbeat"],
        }));

        new cdk.CfnOutput(this, "Instance Role ARN", {
            value: this.instanceRole.roleArn,
            exportName: "VetNodeInstanceRoleArn",
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
