import * as cdk from "aws-cdk-lib";
import * as iam from "aws-cdk-lib/aws-iam";
import { NagSuppressions } from "cdk-nag";
import { Construct } from "constructs";

export class BitcoinCommonStack extends cdk.Stack {
    public readonly instanceRole: iam.Role;

    constructor(scope: Construct, id: string, props?: cdk.StackProps) {
        super(scope, id, props);

        this.instanceRole = new iam.Role(this, "BitcoinNodeRole", {
            assumedBy: new iam.ServicePrincipal("ec2.amazonaws.com"),
            managedPolicies: [
                iam.ManagedPolicy.fromAwsManagedPolicyName("AmazonSSMManagedInstanceCore"),
                iam.ManagedPolicy.fromAwsManagedPolicyName("CloudWatchAgentServerPolicy"),
            ],
        });

        new cdk.CfnOutput(this, "InstanceRoleArn", {
            value: this.instanceRole.roleArn,
            exportName: "BitcoinNodeInstanceRoleArn",
        });

        // cdk-nag suppressions
        NagSuppressions.addResourceSuppressions(this.instanceRole, [
            {
                id: "AwsSolutions-IAM4",
                reason: "AmazonSSMManagedInstanceCore and CloudWatchAgentServerPolicy are sufficient for this use case.",
            },
            {
                id: "AwsSolutions-IAM5",
                reason: "Managed policies and wildcard usage are acceptable for this limited-scope Bitcoin node role.",
            },
        ]);
    }
}
