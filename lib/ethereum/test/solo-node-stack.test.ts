import { Match, Template } from "aws-cdk-lib/assertions";
import * as cdk from "aws-cdk-lib";
import * as dotenv from 'dotenv';
dotenv.config({ path: './test/.env-test' });
import * as config from "../lib/config/ethConfig";
import { EthSingleNodeStack } from "../lib/single-node-stack";
import { EthNodeRole } from "../lib/config/ethConfig.interface";

describe("EthSyncNodeStack", () => {
  test("synthesizes the way we expect", () => {
    const app = new cdk.App();

    // Create the EthSingleNodeStack.
    const ethSyncNodeStack = new EthSingleNodeStack(app, "eth-single-node", {
      stackName: `eth-single-node-${config.baseConfig.clientCombination}`,

      env: { account: config.baseConfig.accountId, region: config.baseConfig.region },
      ethClientCombination: config.baseConfig.clientCombination,
      nodeRole: <EthNodeRole> "single-node",
      instanceType: config.syncNodeConfig.instanceType,
      instanceCpuType: config.syncNodeConfig.instanceCpuType,
      dataVolumes: config.syncNodeConfig.dataVolumes,
  });

    // Prepare the stack for assertions.
    const template = Template.fromStack(ethSyncNodeStack);

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
         "CidrIp": "0.0.0.0/0",
         "Description": "P2P",
         "FromPort": 30304,
         "IpProtocol": "tcp",
         "ToPort": 30304
        },
        {
         "CidrIp": "0.0.0.0/0",
         "Description": "P2P",
         "FromPort": 30304,
         "IpProtocol": "udp",
         "ToPort": 30304
        },
        {
         "CidrIp": "0.0.0.0/0",
         "Description": "CL Client P2P",
         "FromPort": 9000,
         "IpProtocol": "tcp",
         "ToPort": 9000
        },
        {
         "CidrIp": "0.0.0.0/0",
         "Description": "CL Client P2P",
         "FromPort": 9000,
         "IpProtocol": "udp",
         "ToPort": 9000
        },
        {
         "CidrIp": "1.2.3.4/5",
         "Description": "CL Client API",
         "FromPort": 5051,
         "IpProtocol": "tcp",
         "ToPort": 5051
        },
        {
         "CidrIp": "1.2.3.4/5",
         "Description": "CL Client API",
         "FromPort": 5052,
         "IpProtocol": "tcp",
         "ToPort": 5052
        },
        {
         "CidrIp": "1.2.3.4/5",
         "Description": "EL Client RPC (Auth)",
         "FromPort": 8551,
         "IpProtocol": "tcp",
         "ToPort": 8551
        },
        {
         "CidrIp": "1.2.3.4/5",
         "Description": "EL Client RPC",
         "FromPort": 8545,
         "IpProtocol": "tcp",
         "ToPort": 8545
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
      InstanceType: "m6g.2xlarge",
      Monitoring: true,
      PropagateTagsToVolumeOnCreation: true,
      SecurityGroupIds: Match.anyValue(),
      SubnetId: Match.anyValue(),
    })

    // Has EBS data volume.
    template.hasResourceProperties("AWS::EC2::Volume", {
      AvailabilityZone: Match.anyValue(),
      Encrypted: true,
      Iops: 6000,
      MultiAttachEnabled: false,
      Size: 3072,
      Throughput: 400,
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
        "Fn::Join": [
         "",
         [
          "eth-single-node-geth-lighthouse-",
          {
           "Ref": Match.anyValue()
          }
         ]
        ]
       }
    })

 });
});
