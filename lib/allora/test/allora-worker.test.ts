import * as cdk from 'aws-cdk-lib';
import { Template, Match } from 'aws-cdk-lib/assertions';
import { AlloraStack } from '../lib/single-node-stack';
import * as dotenv from 'dotenv';
dotenv.config({ path: './test/.env-test' });
import { baseConfig, singleNodeConfig } from '../lib/config/node-config';

describe("AlloranodeStack", () => {
  test('Stack has correct resources', () => {
    const app = new cdk.App();
    const stack = new AlloraStack(app, 'TestStack', {
      stackName: 'allora-single-node',
      env: {
        account: baseConfig.accountId,
        region: baseConfig.region 
      },
      ...singleNodeConfig
    });

    const template = Template.fromStack(stack);

    // Check for Security Group with inbound TCP 9010 rule
    template.hasResourceProperties('AWS::EC2::SecurityGroup', {
      SecurityGroupEgress: [
        {
          CidrIp: "0.0.0.0/0",
          Description: "Allow all outbound traffic by default",
          IpProtocol: "-1"
        }
        ],
      SecurityGroupIngress: [
        {
          CidrIp: "1.2.3.4/5",
          Description: "ALLORA Offchain Source",
          FromPort: 8000,
          IpProtocol: "tcp",
          ToPort: 8000
        }
        ],
    });

    // Check for EC2 Instance
    template.hasResourceProperties('AWS::EC2::Instance', {
      InstanceType: 't3.medium',
      ImageId: Match.anyValue(),
      BlockDeviceMappings: [
        {
          DeviceName: '/dev/xvda',
          Ebs: {
            VolumeSize: 46,
            VolumeType: 'gp3',
          },
        },
      ],
    });

    // Has EBS data volume.
    template.hasResourceProperties("AWS::EC2::Volume", {
      AvailabilityZone: Match.anyValue(),
      Encrypted: true,
      Iops: 3000,
      MultiAttachEnabled: false,
      Size: 256,
      Throughput: 125,
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
        "Fn::Join": ["", ["AlloraStack-", { "Ref": Match.anyValue() }]]
      }
    })
  });
});
