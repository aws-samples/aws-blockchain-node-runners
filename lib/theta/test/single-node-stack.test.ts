import { Match, Template } from "aws-cdk-lib/assertions";
import * as cdk from "aws-cdk-lib";
import * as dotenv from 'dotenv';
dotenv.config({ path: './test/.env-test' });
import * as config from "../lib/config/edgeConfig";
import * as configTypes from "../lib/config/edgeConfig.interface";
import { EdgeSingleNodeStack } from "../lib/single-node-stack";

describe("EdgeSingleNodeStack", () => {
  test("synthesizes the way we expect", () => {
    const app = new cdk.App();

    // Create the EthSingleNodeStack.
    const edgeSingleNodeStack = new EdgeSingleNodeStack(app, "edge-single-node", {
      stackName: `edge-single-node`,

      env: { account: config.baseConfig.accountId, region: config.baseConfig.region },
      nodeRole: <configTypes.EdgeNodeRole> "single-node",
      instanceType: config.baseNodeConfig.instanceType,
      instanceCpuType: config.baseNodeConfig.instanceCpuType,
      edgeNodeGpu: config.baseNodeConfig.edgeNodeGpu,
      edgeNetwork: config.baseNodeConfig.edgeNetwork,
      edgeLauncherVersion: config.baseNodeConfig.edgeLauncherVersion,
      dataVolume: config.baseNodeConfig.dataVolume,
  });

    // Prepare the stack for assertions.
    const template = Template.fromStack(edgeSingleNodeStack);

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
          "CidrIp": "1.2.3.4/5",
          "Description": "Theta Edge Node RPC Port",
          "FromPort": 15888,
          "IpProtocol": "tcp",
          "ToPort": 15888
         },
         {
          "CidrIp": "1.2.3.4/5",
          "Description": "Theta Edge Core RPC Port",
          "FromPort": 17888,
          "IpProtocol": "tcp",
          "ToPort": 17888
         },
         {
          "CidrIp": "1.2.3.4/5",
          "Description": "Theta Edge Encoder RPC Port",
          "FromPort": 17935,
          "IpProtocol": "tcp",
          "ToPort": 17935
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
      InstanceType: "g4dn.2xlarge",
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
      Size: 256,
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
        "Fn::Join": ["", ["edge-single-node-",{ "Ref": Match.anyValue() }]]
      }
    })

 });
});
