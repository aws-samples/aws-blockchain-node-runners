import { Match, Template } from "aws-cdk-lib/assertions";
import * as cdk from "aws-cdk-lib";
import * as dotenv from 'dotenv';
dotenv.config({ path: './test/.env-test' });
import * as config from "../lib/config/node-config";
import { SuiSingleNodeStack } from "../lib/single-node-stack";

describe("SuiSingleNodeStack", () => {
  test("synthesizes the way we expect", () => {
    const app = new cdk.App();

    // Create the SuiSingleNodeStack.
    const suiSingleNodeStack = new SuiSingleNodeStack(app, "sui-single-node", {
      stackName: `sui-single-node-${config.baseNodeConfig.suiNetworkId}`,
      env: { account: config.baseConfig.accountId, region: config.baseConfig.region },
      instanceType: config.baseNodeConfig.instanceType,
      instanceCpuType: config.baseNodeConfig.instanceCpuType,
      dataVolume: config.baseNodeConfig.dataVolume,
      suiNetworkId: config.baseNodeConfig.suiNetworkId,
  });

    // Prepare the stack for assertions.
    const template = Template.fromStack(suiSingleNodeStack);

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
         "Description": "Sui P2P",
         "FromPort": 8084,
         "IpProtocol": "udp",
         "ToPort": 8084
        },
        {
         "CidrIp": "0.0.0.0/0",
         "Description": "Sui Metrics",
         "FromPort": 9184,
         "IpProtocol": "tcp",
         "ToPort": 9184
        },
        {
         "CidrIp": "1.2.3.4/5",
         "Description": "JSON-RPC",
         "FromPort": 9000,
         "IpProtocol": "tcp",
         "ToPort": 9000
        }
       ]
    })

    // Has EC2 instance with node configuration
    template.hasResourceProperties("AWS::EC2::Instance", {
      AvailabilityZone: Match.anyValue(),
      UserData: Match.anyValue(),
      BlockDeviceMappings: [
        {
          DeviceName: "/dev/sda1",
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
      InstanceType: "m6i.4xlarge",
      Monitoring: true,
      PropagateTagsToVolumeOnCreation: true,
      SecurityGroupIds: Match.anyValue(),
      SubnetId: Match.anyValue(),
    })

    // Has EBS data volume.
    template.hasResourceProperties("AWS::EC2::Volume", {
      AvailabilityZone: Match.anyValue(),
      Encrypted: true,
      Iops: 3000,
      MultiAttachEnabled: false,
      Size: 4000,
      Throughput: 700,
      VolumeType: "gp3"
    })

    // Has EBS data volume attachment.
    template.hasResourceProperties("AWS::EC2::VolumeAttachment", {
      Device: "/dev/sdf",
      InstanceId: Match.anyValue(),
      VolumeId: Match.anyValue(),
    })

    // Has EBS accounts volume.
    template.hasResourceProperties("AWS::EC2::Volume", {
      AvailabilityZone: Match.anyValue(),
      Encrypted: true,
      Iops: 3000,
      MultiAttachEnabled: false,
      Size: 4000,
      Throughput: 700,
      VolumeType: "gp3"
    })

    // Has EBS accounts volume attachment.
    template.hasResourceProperties("AWS::EC2::VolumeAttachment", {
      Device: "/dev/sdf",
      InstanceId: Match.anyValue(),
      VolumeId: Match.anyValue(),
    })

    // Has CloudWatch dashboard.
    template.hasResourceProperties("AWS::CloudWatch::Dashboard", {
      DashboardBody: Match.anyValue(),
      DashboardName: {"Fn::Join": ["", ["sui-single-node-testnet-",{ "Ref": Match.anyValue() }]]}
    })

 });
});
