import * as cdk from "aws-cdk-lib";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import { Construct } from "constructs";

export interface IndyNodeInstanceProps {
    readonly vpc: ec2.IVpc;
    readonly nodeSG: ec2.ISecurityGroup;
}

export class IndyTrusteeNodeInstance extends Construct {
    public readonly instance: ec2.Instance;

    constructor(scope: Construct, id: string, props: IndyNodeInstanceProps) {
        super(scope, id);

        const { vpc } = props;

        const instance = new ec2.Instance(this, "Instance", {
            vpc: vpc,
            instanceType: ec2.InstanceType.of(ec2.InstanceClass.T3, ec2.InstanceSize.MEDIUM),
            machineImage: ec2.MachineImage.fromSsmParameter(
                "/aws/service/canonical/ubuntu/server/focal/stable/current/amd64/hvm/ebs-gp2/ami-id",
            ),
            ssmSessionPermissions: true,
            securityGroup: props.nodeSG,
        });
        instance.applyRemovalPolicy(cdk.RemovalPolicy.DESTROY);

        cdk.Tags.of(instance).add("Name", id);

        instance.addToRolePolicy(
            new cdk.aws_iam.PolicyStatement({
                effect: cdk.aws_iam.Effect.ALLOW,
                actions: ["secretsmanager:GetSecretValue"],
                resources: [`arn:aws:secretsmanager:${cdk.Aws.REGION}:${cdk.Aws.ACCOUNT_ID}:secret:${id}-*`],
            }),
        );

        new cdk.CfnOutput(this, `${id}InstanceId`, {
            value: instance.instanceId,
            exportName: `${id}InstanceId`,
        });

        this.instance = instance;
    }
}
