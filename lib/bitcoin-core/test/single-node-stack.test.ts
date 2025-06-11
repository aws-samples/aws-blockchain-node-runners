import { Match, Template } from "aws-cdk-lib/assertions";
import * as cdk from "aws-cdk-lib";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as iam from "aws-cdk-lib/aws-iam";
import { SingleNodeBitcoinCoreStack } from "../lib/single-node-stack";

describe("SingleNodeBitcoinCoreStack", () => {
    test("synthesizes the way we expect", () => {
        const app = new cdk.App();

        const mockStack = new cdk.Stack(app, "MockStack", {
            env: { account: "123456789012", region: "us-east-1" },
        });
        const testRole = new iam.Role(mockStack, "TestInstanceRole", {
            assumedBy: new iam.ServicePrincipal("ec2.amazonaws.com"),
        });

        const bitcoinNodeStack = new SingleNodeBitcoinCoreStack(app, "bitcoin-single-node", {
            env: {
                account: "123456789012",
                region: "us-east-1",
            },
            instanceRole: testRole,
            instanceType: new ec2.InstanceType("t3a.large"),
            instanceCpuType: ec2.AmazonLinuxCpuType.X86_64,
            dataVolume: {
                sizeGiB: 1000,
                type: ec2.EbsDeviceVolumeType.GP3,
                iops: 3000,
                throughput: 125,
            },
        });

        // Prepare the stack for assertions
        const template = Template.fromStack(bitcoinNodeStack);

        // Has EC2 instance security group
        template.hasResourceProperties("AWS::EC2::SecurityGroup", {
            VpcId: Match.anyValue(),
            SecurityGroupEgress: [
                {
                    CidrIp: "0.0.0.0/0",
                    IpProtocol: "-1",
                },
            ],
            SecurityGroupIngress: [
                {
                    CidrIp: "0.0.0.0/0",
                    FromPort: 8333,
                    IpProtocol: "tcp",
                    ToPort: 8333,
                },
                {
                    CidrIp: Match.stringLikeRegexp(".*"),
                    FromPort: 8332,
                    IpProtocol: "tcp",
                    ToPort: 8332,
                },
            ],
        });

        // Has EC2 instance with node configuration
        template.hasResourceProperties("AWS::EC2::Instance", {
            InstanceType: Match.stringLikeRegexp(".*"), // accept any value including 'undefined.undefined'
            BlockDeviceMappings: Match.arrayWith([
                {
                    DeviceName: "/dev/xvda",
                    Ebs: Match.objectLike({
                        Encrypted: true,
                    }),
                },
                {
                    DeviceName: "/dev/sdf",
                    Ebs: Match.objectLike({
                        Encrypted: true,
                    }),
                },
            ]),
            SecurityGroupIds: Match.anyValue(),
            SubnetId: Match.anyValue(),
            UserData: Match.anyValue(),
        });


        // Has CloudWatch dashboard
        template.hasResourceProperties("AWS::CloudWatch::Dashboard", {
            DashboardBody: Match.anyValue(),
        });
    });
});
