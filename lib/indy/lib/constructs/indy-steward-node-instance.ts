import * as cdk from "aws-cdk-lib";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as S3 from "aws-cdk-lib/aws-s3";
import { Construct } from "constructs";
import * as nag from "cdk-nag";
import { readFileSync } from "fs";
import * as configTypes from "../config/indyConfig.interface";


export interface IndyNodeInstanceProps {
    readonly vpc: ec2.IVpc;
    readonly clientSG: ec2.ISecurityGroup;
    readonly nodeSG: ec2.ISecurityGroup;
    readonly ansibleBucket: S3.Bucket;
    readonly instanceType: ec2.InstanceType;
    readonly instanceCpuType: ec2.AmazonLinuxCpuType;
    readonly dataVolumes: configTypes.IndyDataVolumeConfig[];
}

export class IndyStewardNodeInstance extends Construct {
    public readonly instance: ec2.Instance;

    constructor(scope: Construct, id: string, props: IndyNodeInstanceProps) {
        super(scope, id);

        const { vpc, clientSG, nodeSG } = props;

        const clientNic: ec2.CfnInstance.NetworkInterfaceProperty = {
            deviceIndex: "0",
            groupSet: [clientSG.securityGroupId],
            subnetId: vpc.privateSubnets[0].subnetId,
            description: "Client NIC",
        };

        const nodeNic: ec2.CfnInstance.NetworkInterfaceProperty = {
            deviceIndex: "1",
            groupSet: [nodeSG.securityGroupId],
            subnetId: vpc.privateSubnets[0].subnetId,
            description: "Node NIC",
        };

        const instance = new ec2.Instance(this, "Instance", {
            vpc: vpc,
            instanceType: ec2.InstanceType.of(ec2.InstanceClass.T3, ec2.InstanceSize.LARGE),
            machineImage: ec2.MachineImage.fromSsmParameter(
                "/aws/service/canonical/ubuntu/server/focal/stable/current/amd64/hvm/ebs-gp2/ami-id",
            ),
            ssmSessionPermissions: true,
            userData: ec2.UserData.custom(readFileSync("./lib/assets/user-data/steward.sh", "base64")),
            blockDevices: [
                {
                    deviceName: "/dev/sda1",
                    volume: ec2.BlockDeviceVolume.ebs(200, {
                        volumeType: ec2.EbsDeviceVolumeType.GP3,
                        encrypted: true,
                        deleteOnTermination: true,
                    }),
                },
            ],
        });

        cdk.Tags.of(instance).add("Name", id);

        instance.addToRolePolicy(
            new cdk.aws_iam.PolicyStatement({
                effect: cdk.aws_iam.Effect.ALLOW,
                actions: ["secretsmanager:GetSecretValue"],
                resources: [`arn:aws:secretsmanager:${cdk.Aws.REGION}:${cdk.Aws.ACCOUNT_ID}:secret:${id}-*`],
            }),
        );

        props.ansibleBucket.grantRead(instance);

        const cfnInstance = instance.node.defaultChild as ec2.CfnInstance;
        cfnInstance.addPropertyDeletionOverride("SubnetId");
        cfnInstance.addPropertyDeletionOverride("SecurityGroupIds");
        cfnInstance.networkInterfaces = [clientNic, nodeNic];

        instance.applyRemovalPolicy(cdk.RemovalPolicy.DESTROY);

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
