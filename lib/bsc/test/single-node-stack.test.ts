import { Match, Template } from "aws-cdk-lib/assertions";
import * as cdk from "aws-cdk-lib";
import * as dotenv from 'dotenv';
dotenv.config({ path: './test/.env-test' });
import * as config from "../lib/config/bscConfig";
import * as configTypes from "../lib/config/bscConfig.interface";
import { BscSingleNodeStack } from "../lib/single-node-stack";

describe("BSCSingleNodeStack", () => {
  test("synthesizes the way we expect", () => {
    const app = new cdk.App();

    // Create the EthSingleNodeStack.
    const bscSingleNodeStack = new BscSingleNodeStack(app, "bsc-single-node", {
      stackName: `bsc-single-node`,

      env: { account: config.baseConfig.accountId, region: config.baseConfig.region },
      nodeRole: <configTypes.BscNodeRole> "single-node",
      instanceType: config.baseNodeConfig.instanceType,
      instanceCpuType: config.baseNodeConfig.instanceCpuType,
      bscNetwork: config.baseNodeConfig.bscNetwork,
      nodeConfiguration: config.baseNodeConfig.nodeConfiguration,
      dataVolume: config.baseNodeConfig.dataVolume,
  });

    // Prepare the stack for assertions.
    const template = Template.fromStack(bscSingleNodeStack);

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
          "Description": "BSC RPC Port",
          "FromPort": 8545,
          "IpProtocol": "tcp",
          "ToPort": 8545
         },
         {
          "CidrIp": "1.2.3.4/5",
          "Description": "BSC WebSocket Port",
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
        "Fn::Join": ["", ["bsc-single-node-",{ "Ref": Match.anyValue() }]]
      }
    })

 });
});
