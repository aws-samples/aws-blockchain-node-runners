import { Match, Template } from "aws-cdk-lib/assertions";
import * as cdk from "aws-cdk-lib";
import * as dotenv from 'dotenv';
dotenv.config({ path: './test/.env-test' });
import * as config from "../lib/config/fantomConfig";
import * as configTypes from "../lib/config/fantomConfig.interface";
import { FantomSingleNodeStack } from "../lib/single-node-stack";

describe("FANTOMSingleNodeStack", () => {
  test("synthesizes the way we expect", () => {
    const app = new cdk.App();

    // Create the EthSingleNodeStack.
    const fantomSingleNodeStack = new FantomSingleNodeStack(app, "fantom-single-node", {
      stackName: `fantom-single-node`,

      env: { account: config.baseConfig.accountId, region: config.baseConfig.region },
      nodeRole: <configTypes.FantomNodeRole> "single-node",
      instanceType: config.baseNodeConfig.instanceType,
      instanceCpuType: config.baseNodeConfig.instanceCpuType,
      fantomNetwork: config.baseNodeConfig.fantomNetwork,
      nodeConfiguration: config.baseNodeConfig.nodeConfiguration,
      snapshotsUrl:config.baseNodeConfig.snapshotsUrl,
      dataVolume: config.baseNodeConfig.dataVolume,
  });

    // Prepare the stack for assertions.
    const template = Template.fromStack(fantomSingleNodeStack);

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
          "Description": "P2P",
          "FromPort": 30303,
          "IpProtocol": "tcp",
          "ToPort": 30303
         },
         {
          "CidrIp": "0.0.0.0/0",
          "Description": "P2P",
          "FromPort": 30303,
          "IpProtocol": "udp",
          "ToPort": 30303
         },
         {
          "CidrIp": "1.2.3.4/5",
          "Description": "FANTOM RPC Port",
          "FromPort": 8545,
          "IpProtocol": "tcp",
          "ToPort": 8545
         },
         {
          "CidrIp": "1.2.3.4/5",
          "Description": "FANTOM WebSocket Port",
          "FromPort": 8546,
          "IpProtocol": "tcp",
          "ToPort": 8546
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
      InstanceType: "m7g.4xlarge",
      Monitoring: true,
      PropagateTagsToVolumeOnCreation: true,
      SecurityGroupIds: Match.anyValue(),
      SubnetId: Match.anyValue(),
    })

    // Has EBS data volume.
    template.hasResourceProperties("AWS::EC2::Volume", {
      AvailabilityZone: Match.anyValue(),
      Encrypted: true,
      Iops: 10000,
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

    // Has CloudWatch dashboard.
    template.hasResourceProperties("AWS::CloudWatch::Dashboard", {
      DashboardBody: Match.anyValue(),
      DashboardName: {
        "Fn::Join": ["", ["fantom-single-node-",{ "Ref": Match.anyValue() }]]
      }
    })

 });
});
