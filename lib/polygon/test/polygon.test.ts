import { Match, Template } from "aws-cdk-lib/assertions";
import * as cdk from "aws-cdk-lib";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import { Aspects } from "aws-cdk-lib";
import { AwsSolutionsChecks } from "cdk-nag";
import { PolygonCommonStack } from "../lib/common-stack";
import { PolygonSingleNodeStack } from "../lib/single-node-stack";

describe("PolygonCommonStack", () => {
  test("synthesizes the way we expect", () => {
    const app = new cdk.App();

    const commonStack = new PolygonCommonStack(app, "polygon-common", {
      env: { account: "1234567890", region: "us-east-1" },
      stackName: "polygon-nodes-common",
    });

    const template = Template.fromStack(commonStack);

    // Has EC2 instance role with SSM and CloudWatch policies.
    template.hasResourceProperties("AWS::IAM::Role", {
      AssumeRolePolicyDocument: {
        Statement: [
          {
            Action: "sts:AssumeRole",
            Effect: "Allow",
            Principal: {
              Service: "ec2.amazonaws.com",
            },
          },
        ],
      },
      ManagedPolicyArns: [
        {
          "Fn::Join": [
            "",
            [
              "arn:",
              { Ref: "AWS::Partition" },
              ":iam::aws:policy/AmazonSSMManagedInstanceCore",
            ],
          ],
        },
        {
          "Fn::Join": [
            "",
            [
              "arn:",
              { Ref: "AWS::Partition" },
              ":iam::aws:policy/CloudWatchAgentServerPolicy",
            ],
          ],
        },
      ],
    });

    // Exports the instance role ARN.
    template.hasOutput("InstanceRoleARN", {
      Export: { Name: "PolygonNodeInstanceRoleArn" },
    });
  });

  test("passes cdk-nag AwsSolutions checks", () => {
    const app = new cdk.App();

    const commonStack = new PolygonCommonStack(app, "polygon-common-nag", {
      env: { account: "1234567890", region: "us-east-1" },
      stackName: "polygon-nodes-common-nag",
    });

    Aspects.of(app).add(new AwsSolutionsChecks({ verbose: true }));

    // Force synthesis to trigger nag checks — no errors means pass.
    const warnings = app.synth().getStackByName(commonStack.stackName).messages
      .filter((m) => m.level === "error");
    expect(warnings).toHaveLength(0);
  });
});

describe("PolygonSingleNodeStack", () => {
  test("synthesizes the way we expect", () => {
    const app = new cdk.App();

    const singleNodeStack = new PolygonSingleNodeStack(app, "polygon-single-node", {
      env: { account: "1234567890", region: "us-east-1" },
      stackName: "polygon-single-node",
      network: "amoy" as any,
      erigonImage: "0xpolygon/erigon:v3.4.0",
      heimdallApiUrl: "https://heimdall-api-amoy.polygon.technology",
      instanceType: new ec2.InstanceType("m7g.xlarge"),
      instanceCpuType: ec2.AmazonLinuxCpuType.ARM_64,
      dataVolume: { sizeGiB: 1000, type: "gp3", iops: 5000, throughput: 250 },
    });

    const template = Template.fromStack(singleNodeStack);

    // Has EC2 instance.
    template.hasResourceProperties("AWS::EC2::Instance", {
      InstanceType: "m7g.xlarge",
      Monitoring: true,
      SecurityGroupIds: Match.anyValue(),
      SubnetId: Match.anyValue(),
    });

    // Has security group with expected egress.
    template.hasResourceProperties("AWS::EC2::SecurityGroup", {
      GroupDescription: Match.anyValue(),
      VpcId: Match.anyValue(),
      SecurityGroupEgress: [
        {
          CidrIp: "0.0.0.0/0",
          Description: "Allow all outbound traffic by default",
          IpProtocol: "-1",
        },
      ],
    });

    // Has Erigon P2P port (30303), torrent (42069), and RPC (8545) in security group inline rules.
    template.hasResourceProperties("AWS::EC2::SecurityGroup", {
      SecurityGroupIngress: Match.arrayWith([
        Match.objectLike({ FromPort: 30303, IpProtocol: "tcp" }),
        Match.objectLike({ FromPort: 42069, IpProtocol: "tcp" }),
        Match.objectLike({ FromPort: 8545, IpProtocol: "tcp" }),
      ]),
    });

    // No Heimdall ports in security group.
    const sgResources = template.findResources("AWS::EC2::SecurityGroup");
    const allIngressPorts = Object.values(sgResources).flatMap(
      (r: any) => (r.Properties?.SecurityGroupIngress || []).map((i: any) => i.FromPort)
    );
    expect(allIngressPorts).not.toContain(26656);
    expect(allIngressPorts).not.toContain(26657);
    expect(allIngressPorts).not.toContain(1317);

    // Has EBS data volume.
    template.hasResourceProperties("AWS::EC2::Volume", {
      AvailabilityZone: Match.anyValue(),
      Encrypted: true,
      Iops: 5000,
      Size: 1000,
      Throughput: 250,
      VolumeType: "gp3",
    });

    // Has EBS data volume attachment.
    template.hasResourceProperties("AWS::EC2::VolumeAttachment", {
      Device: "/dev/sdf",
      InstanceId: Match.anyValue(),
      VolumeId: Match.anyValue(),
    });
  });
});
