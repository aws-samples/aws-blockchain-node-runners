const cdk = require("aws-cdk-lib");
const iam = require("aws-cdk-lib/aws-iam");
const nag = require("cdk-nag");

class BitcoinCommonStack extends cdk.Stack {
    constructor(scope, id, props) {
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
        nag.NagSuppressions.addResourceSuppressions(
            this.instanceRole,
            [
                {
                    id: "AwsSolutions-IAM4",
                    reason: "AmazonSSMManagedInstanceCore and CloudWatchAgentServerPolicy are sufficient for this use case.",
                },
                {
                    id: "AwsSolutions-IAM5",
                    reason: "Managed policies and wildcard usage are acceptable for this limited-scope Bitcoin node role.",
                },
            ]
        );
    }
}

module.exports = { BitcoinCommonStack };
