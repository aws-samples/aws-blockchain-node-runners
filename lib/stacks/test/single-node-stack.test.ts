import { Match, Template } from "aws-cdk-lib/assertions";
import * as cdk from "aws-cdk-lib";
import * as dotenv from 'dotenv';
dotenv.config({ path: './test/.env-test' });
import * as config from "../lib/config/stacksConfig";
import { StacksSingleNodeStack } from "../lib/single-node-stack";

describe("StacksSingleNodeStack", () => {
  test("synthesizes the way we expect", () => {
    const app = new cdk.App();

    // Create the StacksSingleNodeStack.
    const stacksSingleNodeStack = new StacksSingleNodeStack(app, "stacks-sync-node", {
      stackName: `stacks-single-node-${config.baseNodeConfig.stacksNodeConfiguration}`,
      env: { account: config.baseConfig.accountId, region: config.baseConfig.region },
      ...config.baseNodeConfig
  });

    // Prepare the stack for assertions.
    const template = Template.fromStack(stacksSingleNodeStack);

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
          "Description": Match.anyValue(),
          "FromPort": 8800,
          "IpProtocol": "tcp",
          "ToPort": 8814
         },
         {
          "CidrIp": "0.0.0.0/0",
          "Description": Match.anyValue(),
          "FromPort": 8800,
          "IpProtocol": "udp",
          "ToPort": 8814
         },
         {
          "CidrIp": "1.2.3.4/5",
          "Description": Match.anyValue(),
          "FromPort": 8899,
          "IpProtocol": "tcp",
          "ToPort": 8899
         },
         {
          "CidrIp": "1.2.3.4/5",
          "Description": Match.anyValue(),
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
      InstanceType: Match.anyValue(),
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

    // Has CloudWatch dashboard.
    template.hasResourceProperties("AWS::CloudWatch::Dashboard", Match.anyValue())

 });
});
