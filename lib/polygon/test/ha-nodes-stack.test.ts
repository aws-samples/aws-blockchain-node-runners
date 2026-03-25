import { Match, Template } from "aws-cdk-lib/assertions";
import * as cdk from "aws-cdk-lib";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import { PolygonHaNodesStack } from "../lib/ha-nodes-stack";

describe("PolygonHaNodesStack", () => {
  test("synthesizes the way we expect", () => {
    const app = new cdk.App();

    const haNodesStack = new PolygonHaNodesStack(app, "polygon-ha-nodes", {
      env: { account: "1234567890", region: "us-east-1" },
      stackName: "polygon-ha-nodes",
      network: "amoy" as any,
      erigonImage: "0xpolygon/erigon:v3.4.0",
      heimdallApiUrl: "https://heimdall-api-amoy.polygon.technology",
      instanceType: new ec2.InstanceType("m7g.xlarge"),
      instanceCpuType: ec2.AmazonLinuxCpuType.ARM_64,
      numberOfNodes: 2,
      albHealthCheckGracePeriodMin: 10,
      heartBeatDelayMin: 60,
      dataVolume: { sizeGiB: 1000, type: "gp3", iops: 5000, throughput: 250 },
    });

    const template = Template.fromStack(haNodesStack);

    // Has Auto Scaling Group.
    template.hasResourceProperties("AWS::AutoScaling::AutoScalingGroup", {
      DesiredCapacity: "2",
      HealthCheckType: "ELB",
      VPCZoneIdentifier: Match.anyValue(),
      TargetGroupARNs: Match.anyValue(),
    });

    // Has ALB.
    template.hasResourceProperties("AWS::ElasticLoadBalancingV2::LoadBalancer", {
      Scheme: "internal",
      Type: "application",
      SecurityGroups: [Match.anyValue()],
    });

    // Has Launch Template.
    template.hasResourceProperties("AWS::EC2::LaunchTemplate", {
      LaunchTemplateData: {
        InstanceType: "m7g.xlarge",
        SecurityGroupIds: [Match.anyValue()],
        UserData: Match.anyValue(),
      },
    });

    // Has Security Group.
    template.hasResourceProperties("AWS::EC2::SecurityGroup", {
      GroupDescription: Match.anyValue(),
      VpcId: Match.anyValue(),
    });
  });
});
