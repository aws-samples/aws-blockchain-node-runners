import { Match, Template } from "aws-cdk-lib/assertions";
import * as cdk from "aws-cdk-lib";
import * as dotenv from 'dotenv';
dotenv.config({ path: './test/.env-test' });
import * as config from "../lib/config/node-config";
import { SolanaSingleNodeStack } from "../lib/single-node-stack";

describe("SolanaSingleNodeStack", () => {
  test("synthesizes the way we expect", () => {
    const app = new cdk.App();

    // Create the SolanaSingleNodeStack.
    const solanaSingleNodeStack = new SolanaSingleNodeStack(app, "solana-sync-node", {
      stackName: `solana-single-node-${config.baseNodeConfig.nodeConfiguration}`,
      env: { account: config.baseConfig.accountId, region: config.baseConfig.region },

      instanceType: config.baseNodeConfig.instanceType,
      instanceCpuType: config.baseNodeConfig.instanceCpuType,
      solanaCluster: config.baseNodeConfig.solanaCluster,
      solanaVersion: config.baseNodeConfig.solanaVersion,
      nodeConfiguration: config.baseNodeConfig.nodeConfiguration,
      dataVolume: config.baseNodeConfig.dataVolume,
      accountsVolume: config.baseNodeConfig.accountsVolume,
      solanaNodeIdentitySecretARN: config.baseNodeConfig.solanaNodeIdentitySecretARN,
      voteAccountSecretARN: config.baseNodeConfig.voteAccountSecretARN,
      authorizedWithdrawerAccountSecretARN: config.baseNodeConfig.authorizedWithdrawerAccountSecretARN,
      registrationTransactionFundingAccountSecretARN: config.baseNodeConfig.registrationTransactionFundingAccountSecretARN,
  });

    // Prepare the stack for assertions.
    const template = Template.fromStack(solanaSingleNodeStack);

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
          "Description": "allow all TCP P2P protocols (gossip, turbine, repair, etc)",
          "FromPort": 8800,
          "IpProtocol": "tcp",
          "ToPort": 8814
         },
         {
          "CidrIp": "0.0.0.0/0",
          "Description": "allow all UDP P2P protocols (gossip, turbine, repair, etc)",
          "FromPort": 8800,
          "IpProtocol": "udp",
          "ToPort": 8814
         },
         {
          "CidrIp": "1.2.3.4/5",
          "Description": "allow internal RPC port HTTP (user access needs to be restricted. Allowed access only from internal IPs)",
          "FromPort": 8899,
          "IpProtocol": "tcp",
          "ToPort": 8899
         },
         {
          "CidrIp": "1.2.3.4/5",
          "Description": "allow internal RPC port WebSocket (user access needs to be restricted. Allowed access only from internal IPs)",
          "FromPort": 8900,
          "IpProtocol": "tcp",
          "ToPort": 8900
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
      InstanceType: "r6a.8xlarge",
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

    // Has EBS accounts volume.
    template.hasResourceProperties("AWS::EC2::Volume", {
      AvailabilityZone: Match.anyValue(),
      Encrypted: true,
      Iops: 6000,
      MultiAttachEnabled: false,
      Size: 500,
      Throughput: 700,
      VolumeType: "gp3"
    })

    // Has EBS accounts volume attachment.
    template.hasResourceProperties("AWS::EC2::VolumeAttachment", {
      Device: "/dev/sdg",
      InstanceId: Match.anyValue(),
      VolumeId: Match.anyValue(),
    })

    // Has CloudWatch dashboard.
    template.hasResourceProperties("AWS::CloudWatch::Dashboard", {
      DashboardBody: Match.anyValue(),
      DashboardName: {"Fn::Join": ["", ["solana-single-node-baserpc-",{ "Ref": Match.anyValue() }]]}
    })

 });
});
