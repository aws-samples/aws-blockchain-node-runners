import { Match, Template } from "aws-cdk-lib/assertions";
import * as cdk from "aws-cdk-lib";
import { IndyNodeStack } from "../lib/indy-node-stack";

describe("IndyNodeStack", () => {
  test("synthesizes the way we expect", () => {
    const app = new cdk.App();

    // Create the indyNodeStack.
    const indyNodeStack = new IndyNodeStack(app, "indy-node", {
        stackName: `indy-sample-network-stack`,
    });

    // Prepare the stack for assertions.
    const template = Template.fromStack(indyNodeStack);

    // Has serverAccessLogBucket.
    template.hasResourceProperties("AWS::S3::Bucket", {
      AccessControl: "LogDeliveryWrite",
      BucketEncryption: {
        ServerSideEncryptionConfiguration: [
         {
          ServerSideEncryptionByDefault: {
           SSEAlgorithm: "AES256"
          }
         }
        ]
       },
       PublicAccessBlockConfiguration: {
        BlockPublicAcls: true,
        BlockPublicPolicy: true,
        IgnorePublicAcls: true,
        RestrictPublicBuckets: true
       }
    });

    // Has ClientSecurityGroup
    template.hasResourceProperties("AWS::EC2::SecurityGroup", {
      GroupDescription: Match.stringLikeRegexp('indy-node/ClientSG*'),
      VpcId: Match.anyValue(),
    });

    // Has ClientSecurityGroup IngressRule
    template.hasResourceProperties('AWS::EC2::SecurityGroupIngress', {
      IpProtocol: 'tcp',
      FromPort: 9702,
      ToPort: 9702,
      SourceSecurityGroupId: Match.objectLike({
        'Fn::GetAtt': Match.arrayWith([
          Match.stringLikeRegexp('ClientSG*'),
          'GroupId'
        ])
      })
    });

    // Has NodeSecurityGroup
    template.hasResourceProperties("AWS::EC2::SecurityGroup", {
      GroupDescription: Match.stringLikeRegexp('indy-node/NodeSG*'),
      VpcId: Match.anyValue(),
    });

    // Has NodeSecurityGroup IngressRule
    template.hasResourceProperties('AWS::EC2::SecurityGroupIngress', {
      IpProtocol: 'tcp',
      FromPort: 9701,
      ToPort: 9701,
      SourceSecurityGroupId: Match.objectLike({
        'Fn::GetAtt': Match.arrayWith([
          Match.stringLikeRegexp('NodeSG*'),
          'GroupId'
        ])
      })
    });

    // Has 4 IndyStewardNodeInstance
    template.resourcePropertiesCountIs('AWS::EC2::Instance', {
      "BlockDeviceMappings": [ {
        DeviceName: "/dev/sda1",
        Ebs: {
          VolumeSize: 200,
          VolumeType: "gp3",
          Encrypted: true,
          DeleteOnTermination: true,
        },
      }],
      "IamInstanceProfile": Match.objectLike({
        "Ref": Match.stringLikeRegexp('steward*')
      }),
      "InstanceType": "t3.large",
      "NetworkInterfaces": [
        {
          "Description": "Client NIC",
          "DeviceIndex": "0",
          "GroupSet": Match.arrayWith([
            {
              'Fn::GetAtt': Match.arrayWith([
                Match.stringLikeRegexp('ClientSG*'),
                'GroupId'
              ])
            }
          ]),
          "SubnetId": Match.anyValue()
        },
        {
          "Description": "Node NIC",
          "DeviceIndex": "1",
          "GroupSet": Match.arrayWith([
            {
              'Fn::GetAtt': Match.arrayWith([
                Match.stringLikeRegexp('NodeSG*'),
                'GroupId'
              ])
            }
          ]),
          "SubnetId": Match.anyValue()
        }
      ]
    }, 4);

    // Has 3 IndyTrusteeNodeInstance
    template.resourcePropertiesCountIs('AWS::EC2::Instance', {
      "BlockDeviceMappings": [ {
        DeviceName: "/dev/sda1",
        Ebs: {
          VolumeSize: 30,
          VolumeType: "gp3",
          Encrypted: true,
          DeleteOnTermination: true,
        },
      }],
      "IamInstanceProfile": Match.objectLike({
        "Ref": Match.stringLikeRegexp('trustee*')
      }),
      "InstanceType": "t3.medium",
    }, 3);
 });
});
