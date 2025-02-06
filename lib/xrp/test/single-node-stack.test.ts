import { Match, Template } from "aws-cdk-lib/assertions";
import * as cdk from "aws-cdk-lib";
import * as dotenv from "dotenv";
dotenv.config({ path: './test/.env-test' });
import * as config from "../lib/config/XRPConfig";
import { XRPCommonStack } from "../lib/common-stack";
import { XRPSingleNodeStack } from "../lib/single-node-stack";


describe("XRPSingleNodeStack", () => {
    test("synthesizes the way we expect", () => {
        const app = new cdk.App();
        const xrpCommonStack = new XRPCommonStack(app, "xrp-common", {
            env: { account: config.baseConfig.accountId, region: config.baseConfig.region },
            stackName: `xrp-nodes-common`,
        });

        // Create the XRPSingleNodeStack.
        const xrpSingleNodeStack = new XRPSingleNodeStack(app, "XRP-sync-node", {
            env: { account: config.baseConfig.accountId, region: config.baseConfig.region },
            stackName: `XRP-single-node`,
            instanceType: config.baseNodeConfig.instanceType,
            instanceCpuType: config.baseNodeConfig.instanceCpuType,
            dataVolume: config.baseNodeConfig.dataVolume,
            hubNetworkID: config.baseNodeConfig.hubNetworkID,
            instanceRole: xrpCommonStack.instanceRole,
        });

        // Prepare the stack for assertions.
        const template = Template.fromStack(xrpSingleNodeStack);

        // Has EC2 instance security group.
        template.hasResourceProperties("AWS::EC2::SecurityGroup", {
            GroupDescription: Match.anyValue(),
            VpcId: Match.anyValue(),
            SecurityGroupEgress: [
                {
                    "CidrIp": "0.0.0.0/0",
                    "Description": "Allow all outbound traffic by default",
                    "IpProtocol": "-1"
                }
            ],
            SecurityGroupIngress: [
                {
                    "CidrIp": "0.0.0.0/0",
                    "Description": "P2P protocols",
                    "FromPort": 51235,
                    "IpProtocol": "tcp",
                    "ToPort": 51235
                },
                {
                    "CidrIp": "0.0.0.0/0",
                    "Description": "P2P protocols",
                    "FromPort": 2459,
                    "IpProtocol": "tcp",
                    "ToPort": 2459
                },
                {
                    "CidrIp": "1.2.3.4/5",
                    "Description": "RPC port HTTP (user access needs to be restricted. Allowed access only from internal IPs)",
                    "FromPort": 6005,
                    "IpProtocol": "tcp",
                    "ToPort": 6005
                }
            ]
        })

        // Has EC2 instance with node configuration
        template.hasResourceProperties("AWS::EC2::Instance", {
            AvailabilityZone: Match.anyValue(),
            UserData: Match.anyValue(),
            BlockDeviceMappings: [
                {
                    DeviceName: "/dev/xvda",
                    Ebs: {
                        DeleteOnTermination: true,
                        Encrypted: true,
                        Iops: 3000,
                        VolumeSize: 46,
                        VolumeType: "gp3"
                    }
                }
            ],
            IamInstanceProfile: Match.anyValue(),
            ImageId: Match.anyValue(),
            InstanceType: "r7a.12xlarge",
            Monitoring: true,
            PropagateTagsToVolumeOnCreation: true,
            SecurityGroupIds: Match.anyValue(),
            SubnetId: Match.anyValue(),
        })

        // Has EBS data volume.
        template.hasResourceProperties("AWS::EC2::Volume", {
            AvailabilityZone: Match.anyValue(),
            Encrypted: true,
            Iops: 12000,
            MultiAttachEnabled: false,
            Size: 2000,
            Throughput: 700,
            VolumeType: "gp3"
        })

        // Has EBS data volume attachment.
        template.hasResourceProperties("AWS::EC2::VolumeAttachment", {
            Device: "/dev/sdf",
            InstanceId: Match.anyValue(),
            VolumeId: Match.anyValue(),
        })

        // Has CloudWatch dashboard.
        template.hasResourceProperties("AWS::CloudWatch::Dashboard", {
            DashboardBody: Match.anyValue(),
            DashboardName: {"Fn::Join": ["", ["XRP-single-node-",{ "Ref": Match.anyValue() }]]}
        })

    });
});
