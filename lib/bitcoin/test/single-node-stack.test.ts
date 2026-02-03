import { Match, Template } from "aws-cdk-lib/assertions";
import * as cdk from "aws-cdk-lib";
import * as dotenv from 'dotenv';
dotenv.config({ path: './test/.env-test' });
import * as config from "../lib/config/bitcoinConfig";
import { BitcoinSingleNodeStack } from "../lib/single-node-stack";

describe("BitcoinSingleNodeStack", () => {
    test("synthesizes the way we expect", () => {
        const app = new cdk.App();

        const bitcoinSingleNodeStack = new BitcoinSingleNodeStack(app, "bitcoin-single-node", {
            stackName: `bitcoin-single-node-${config.baseConfig.network}`,
            env: { account: config.baseConfig.accountId, region: config.baseConfig.region },
            instanceType: config.singleNodeConfig.instanceType,
            instanceCpuType: config.singleNodeConfig.instanceCpuType,
            bitcoinNetwork: config.singleNodeConfig.bitcoinNetwork,
            bitcoinVersion: config.singleNodeConfig.bitcoinVersion,
            nodeConfig: config.singleNodeConfig.nodeConfig,
            snapshotConfig: config.singleNodeConfig.snapshotConfig,
            dataVolume: config.singleNodeConfig.dataVolumes[0],
        });

        const template = Template.fromStack(bitcoinSingleNodeStack);

        // Has EC2 instance security group
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
            SecurityGroupIngress: Match.arrayWith([
                {
                    "CidrIp": "0.0.0.0/0",
                    "Description": "Bitcoin mainnet P2P",
                    "FromPort": 8333,
                    "IpProtocol": "tcp",
                    "ToPort": 8333
                }
            ])
        });

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
            InstanceType: "m7g.large",
            Monitoring: true,
            PropagateTagsToVolumeOnCreation: true,
            SecurityGroupIds: Match.anyValue(),
            SubnetId: Match.anyValue(),
        });

        // Has EBS data volume
        template.hasResourceProperties("AWS::EC2::Volume", {
            AvailabilityZone: Match.anyValue(),
            Encrypted: true,
            Iops: 5000,
            MultiAttachEnabled: false,
            Size: 700,
            Throughput: 250,
            VolumeType: "gp3"
        });

        // Has EBS data volume attachment
        template.hasResourceProperties("AWS::EC2::VolumeAttachment", {
            Device: "/dev/sdf",
            InstanceId: Match.anyValue(),
            VolumeId: Match.anyValue(),
        });

        // Has CloudWatch dashboard
        template.hasResourceProperties("AWS::CloudWatch::Dashboard", {
            DashboardBody: Match.anyValue(),
            DashboardName: { "Fn::Join": ["", ["bitcoin-single-node-mainnet-", { "Ref": Match.anyValue() }]] }
        });
    });
});
