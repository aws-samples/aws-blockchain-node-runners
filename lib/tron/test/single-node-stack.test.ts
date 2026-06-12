import { Match, Template } from "aws-cdk-lib/assertions";
import * as cdk from "aws-cdk-lib";
import * as dotenv from 'dotenv';
dotenv.config({ path: './test/.env-test' });
import * as config from "../lib/config/tronConfig";
import { TronSingleNodeStack } from "../lib/single-node-stack";

describe("TRONSingleNodeStack", () => {
  test("synthesizes the way we expect", () => {
    const app = new cdk.App();

    // Create the EthSingleNodeStack.
    const tronSingleNodeStack = new TronSingleNodeStack(app, "tron-single-node", {
      stackName: `tron-single-node`,

      env: { account: config.baseConfig.accountId, region: config.baseConfig.region },
      ...config.baseNodeConfig
  });

    // Prepare the stack for assertions.
    const template = Template.fromStack(tronSingleNodeStack);

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
          "Description": "TRON P2P (TCP)",
          "FromPort": 18888,
          "IpProtocol": "tcp",
          "ToPort": 18888
         },
         {
          "CidrIp": "0.0.0.0/0",
          "Description": "TRON P2P node discovery (UDP)",
          "FromPort": 18888,
          "IpProtocol": "udp",
          "ToPort": 18888
         },
         {
          "CidrIp": "1.2.3.4/5",
          "Description": "TRON HTTP FullNode API",
          "FromPort": 8090,
          "IpProtocol": "tcp",
          "ToPort": 8090
         },
         {
          "CidrIp": "1.2.3.4/5",
          "Description": "TRON gRPC API",
          "FromPort": 50051,
          "IpProtocol": "tcp",
          "ToPort": 50051
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
        "Fn::Join": ["", ["tron-single-node-",{ "Ref": Match.anyValue() }]]
      }
    })

 });
});
