import { Match, Template } from "aws-cdk-lib/assertions";
import * as cdk from "aws-cdk-lib";
import * as dotenv from 'dotenv';
dotenv.config({ path: './test/.env-test' });
import * as config from "../lib/config/tzConfig";
import * as configTypes from "../lib/config/tzConfig.interface";
import { TzSingleNodeStack } from "../lib/single-node-stack";

describe("TZSingleNodeStack", () => {
  test("synthesizes the way we expect", () => {
    const app = new cdk.App();

    // Create the EthSingleNodeStack.
    const tzSingleNodeStack = new TzSingleNodeStack(app, "tz-single-node", {
      stackName: `tz-single-node`,

      env: { account: config.baseConfig.accountId, region: config.baseConfig.region },
      nodeRole: <configTypes.TzNodeRole> "single-node",
      instanceType: config.baseNodeConfig.instanceType,
      instanceCpuType: config.baseNodeConfig.instanceCpuType,
      tzNetwork: config.baseNodeConfig.tzNetwork,
      historyMode: config.baseNodeConfig.historyMode,
      snapshotsUrl:config.baseNodeConfig.snapshotsUrl,
      dataVolume: config.baseNodeConfig.dataVolume,
      octezDownloadUri: config.baseNodeConfig.octezDownloadUri,
      downloadSnapshot: true
  });

    // Prepare the stack for assertions.
    const template = Template.fromStack(tzSingleNodeStack);

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
          "Description": "Peer connection port",
          "FromPort": 9732,
          "IpProtocol": "tcp",
          "ToPort": 9732
         },
         {
          "CidrIp": "0.0.0.0/0",
          "Description": "Peer connection port",
          "FromPort": 9732,
          "IpProtocol": "udp",
          "ToPort": 9732
         },
         {
          "CidrIp": "1.2.3.4/5",
          "Description": "RPC Port",
          "FromPort": 8732,
          "IpProtocol": "tcp",
          "ToPort": 8732
         },
         {
          "CidrIp": "1.2.3.4/5",
          "Description": "RPC Port",
          "FromPort": 8732,
          "IpProtocol": "udp",
          "ToPort": 8732
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
      InstanceType: "m6gd.xlarge",
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
      Size: 1000,
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
        "Fn::Join": ["", ["tz-single-node-",{ "Ref": Match.anyValue() }]]
      }
    })

 });
});
