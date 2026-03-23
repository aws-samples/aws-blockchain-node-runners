import * as cdk from "aws-cdk-lib";
import { Match, Template } from "aws-cdk-lib/assertions";
import * as dotenv from "dotenv";
dotenv.config({ path: __dirname + "/.env-test" });
import * as config from "../lib/config/node-config";
import { VetCommonStack } from "../lib/common-stack";
import { VETSingleNodeStack } from "../lib/single-node-stack";

describe("VETSingleNodeStack", () => {
    test("synthesizes the way we expect", () => {
        const app = new cdk.App();
        const stackName = `vet-single-node`;
        const commonStack = new VetCommonStack(app, "vet-common", {
            stackName: `vet-nodes-common`,
            env: { account: config.baseConfig.accountId, region: config.baseConfig.region },
        });

        const vetSingleNodeStack = new VETSingleNodeStack(app, stackName, {
            env: { account: config.baseConfig.accountId, region: config.baseConfig.region },
            vetNodeType: config.baseNodeConfig.vetNodeType,
            instanceType: config.baseNodeConfig.instanceType,
            instanceCpuType: config.baseNodeConfig.instanceCpuType,
            dataVolume: config.baseNodeConfig.dataVolume,
            network: config.baseNodeConfig.network,
            vetContainerImage: config.baseNodeConfig.vetContainerImage,
            instanceRole: commonStack.instanceRole,
            syncFromPublicSnapshot: config.baseNodeConfig.syncFromPublicSnapshot,
        });

        // Prepare the stack for assertions.
        const template = Template.fromStack(vetSingleNodeStack);

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
                    "Description": "TCP P2P protocols",
                    "FromPort": 11235,
                    "IpProtocol": "tcp",
                    "ToPort": 11235
                },
                {
                    "CidrIp": "0.0.0.0/0",
                    "Description": "UDP P2P protocols",
                    "FromPort": 11235,
                    "IpProtocol": "udp",
                    "ToPort": 11235
                },
                {
                    "CidrIp": "1.2.3.4/5",
                    "Description": "Admin API (Internal access only)",
                    "FromPort": 2113,
                    "IpProtocol": "tcp",
                    "ToPort": 2113
                },
                {
                    "CidrIp": "1.2.3.4/5",
                    "Description": "HTTP Rest API (Internal access only",
                    "FromPort": 80,
                    "IpProtocol": "tcp",
                    "ToPort": 80
                }
            ]
        })

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
            InstanceType: config.baseNodeConfig.instanceType.toString(),
            Monitoring: true,
            PropagateTagsToVolumeOnCreation: true,
            SecurityGroupIds: [Match.anyValue()],
            SubnetId: Match.anyValue(),
        })

        if (config.baseNodeConfig.dataVolume.type !== "instance-store") {
            template.hasResourceProperties("AWS::EC2::Volume", {
                AvailabilityZone: Match.anyValue(),
                Encrypted: true,
                Iops: config.baseNodeConfig.dataVolume.iops,
                MultiAttachEnabled: false,
                Size: config.baseNodeConfig.dataVolume.sizeGiB,
                Throughput: config.baseNodeConfig.dataVolume.throughput,
                VolumeType: config.baseNodeConfig.dataVolume.type.toString()
            })

            // Has EBS data volume attachment.
            template.hasResourceProperties("AWS::EC2::VolumeAttachment", {
                Device: "/dev/sdf",
                InstanceId: Match.anyValue(),
                VolumeId: Match.anyValue(),
            })
        }

        // Has CloudWatch dashboard.
        template.hasResourceProperties("AWS::CloudWatch::Dashboard", {
            DashboardBody: Match.anyValue(),
            DashboardName: { "Fn::Join": ["", ["vet-single-node-", { "Ref": Match.anyValue() }]] }
        })

    });
});
