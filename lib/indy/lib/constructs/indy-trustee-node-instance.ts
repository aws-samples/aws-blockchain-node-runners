import * as cdk from "aws-cdk-lib";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as nag from "cdk-nag";
import { Construct } from "constructs";
import * as configTypes from "../config/indyConfig.interface";

export interface IndyNodeInstanceProps {
    readonly vpc: ec2.IVpc;
    readonly nodeSG: ec2.ISecurityGroup;
    readonly instanceType: ec2.InstanceType;
    readonly instanceCpuType: ec2.AmazonLinuxCpuType;
    readonly dataVolumes: configTypes.IndyDataVolumeConfig[];
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
            blockDevices: [
                {
                    deviceName: "/dev/sda1",
                    volume: ec2.BlockDeviceVolume.ebs(30, {
                        volumeType: ec2.EbsDeviceVolumeType.GP3,
                        encrypted: true,
                        deleteOnTermination: true,
                    }),
                },
            ],
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

        nag.NagSuppressions.addResourceSuppressions(
            this,
            [
                {
                    id: "AwsSolutions-IAM4",
                    reason: "AmazonSSMManagedInstanceCore are restrictive enough"
                },
                {
                    id: "AwsSolutions-IAM5",
                    reason: "It is ok to use wildcard in the secret name. this is a specific target"
                },
                {
                    id: "AwsSolutions-EC28",
                    reason: "Using basic monitoring to save costs"
                },
                {
                    id: "AwsSolutions-EC29",
                    reason: "Its Ok to terminate this instance as the same copies of the data are stored on each node",

                },
            ],
            true
        );
    }
}
