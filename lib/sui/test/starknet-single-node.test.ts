import {Match, Template} from "aws-cdk-lib/assertions";
import * as cdk from "aws-cdk-lib";
import * as dotenv from 'dotenv';

dotenv.config({path: './test/.env-test'});
import * as config from "../lib/config/starknetConfig";
import {StarknetSingleNodeStack} from "../lib/single-node-stack";

describe("StarknetSingleNodeStack", () => {
  let app: cdk.App;
  let starknetSingleNodeStack: StarknetSingleNodeStack;
  let template: Template;
  beforeAll(() => {
    app = new cdk.App();

    // Create the StarknetSingleNodeStack.
    starknetSingleNodeStack = new StarknetSingleNodeStack(app, "starknet-single-node", {
      stackName: `starknet-single-node-${config.baseConfig.accountId}`,
      env: {account: config.baseConfig.accountId, region: config.baseConfig.region},

      instanceType: config.baseNodeConfig.instanceType,
      instanceCpuType: config.baseNodeConfig.instanceCpuType,
      starknetNodeVersion: config.baseNodeConfig.starknetNodeVersion,
      dataVolume: config.baseNodeConfig.dataVolume,
      starknetNetworkId: config.baseNodeConfig.starknetNetworkId,
      starknetL1Endpoint: config.baseNodeConfig.starknetL1Endpoint,
      snapshotUrl: config.baseNodeConfig.snapshotUrl
    });

    template = Template.fromStack(starknetSingleNodeStack);
  });

  test("Check Security Group", () => {
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
          "Description": "Starknet Client RPC",
          "FromPort": 6060,
          "IpProtocol": "tcp",
          "ToPort": 6060
        }
      ]
    })
  });


  test("Check EC2 Settings", () => {
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
            VolumeType: "gp3",
          }
        }
      ],
      IamInstanceProfile: Match.anyValue(),
      ImageId: Match.anyValue(),
      InstanceType: "m6a.2xlarge",
      Monitoring: true,
      PropagateTagsToVolumeOnCreation: true,
      SecurityGroupIds: Match.anyValue(),
      SubnetId: Match.anyValue(),
    });

    // // Has EBS data volume.
    template.hasResourceProperties("AWS::EC2::Volume", {
      AvailabilityZone: Match.anyValue(),
      Encrypted: true,
      Iops: 3000,
      MultiAttachEnabled: false,
      Size: 250,
      Throughput: 700,
      VolumeType: "gp3",
    })

    // Has EBS data volume attachment.
    template.hasResourceProperties("AWS::EC2::VolumeAttachment", {
      Device: "/dev/sdf",
      InstanceId: Match.anyValue(),
      VolumeId: Match.anyValue(),
    })
  });

  test("Check CloudWatch Dashboard", () => {
    // Has CloudWatch dashboard.
    template.hasResourceProperties("AWS::CloudWatch::Dashboard", {
      DashboardBody: Match.anyValue(),
      DashboardName: `starknet-single-node-${config.baseConfig.accountId}`
    })
  });
});
