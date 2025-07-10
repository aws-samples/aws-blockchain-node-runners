import * as cdk from "aws-cdk-lib";
import { Match, Template } from "aws-cdk-lib/assertions";
import * as dotenv from "dotenv";
import { VetCommonStack } from "../lib/common-stack";
import * as config from "../lib/config/node-config";
import { VETHaNodeStack } from "../lib/ha-node-stack";
dotenv.config({ path: __dirname + "/.env-test" });

describe("VETHaNodeStackProps", () => {
  test("synthesizes the way we expect", () => {
    const app = new cdk.App();

    const vetCommonStack = new VetCommonStack(app, "vet-common", {
      env: { account: config.baseConfig.accountId, region: config.baseConfig.region },
      stackName: `vet-nodes-common`,
    });

    const vetHaNodeStack = new VETHaNodeStack(app, "vet-ha-nodes", {
      env: { account: config.baseConfig.accountId, region: config.baseConfig.region },
      vetNodeType: config.baseNodeConfig.vetNodeType,
      instanceType: config.baseNodeConfig.instanceType,
      instanceCpuType: config.baseNodeConfig.instanceCpuType,
      dataVolume: config.baseNodeConfig.dataVolume,
      network: config.baseNodeConfig.network,
      vetContainerImage: config.baseNodeConfig.vetContainerImage,
      instanceRole: vetCommonStack.instanceRole,
      albHealthCheckGracePeriodMin: config.haNodeConfig.albHealthCheckGracePeriodMin,
      heartBeatDelayMin: config.haNodeConfig.heartBeatDelayMin,
      numberOfNodes: config.haNodeConfig.numberOfNodes,
      syncFromPublicSnapshot: config.haNodeConfig.syncFromPublicSnapshot,
    });

    const template = Template.fromStack(vetHaNodeStack);

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
          "Description": "TCP P2P protocols",
          "FromPort": 11235,
          "IpProtocol": "tcp",
          "ToPort": 11235
        },
        {
          "CidrIp": "0.0.0.0/0",
          "Description": "UDP P2P protocols",
          "FromPort": 11235,
          "IpProtocol": "udp",
          "ToPort": 11235
        },
        {
          "CidrIp": "1.2.3.4/5",
          "Description": "Admin API (Internal access only)",
          "FromPort": 2113,
          "IpProtocol": "tcp",
          "ToPort": 2113
        },
        {
          "CidrIp": "1.2.3.4/5",
          "Description": "HTTP Rest API (Internal access only",
          "FromPort": 80,
          "IpProtocol": "tcp",
          "ToPort": 80
        },
        {
          "Description": "Allow access from ALB to Blockchain Node",
          "FromPort": 0,
          "IpProtocol": "tcp",
          "SourceSecurityGroupId": {
            "Fn::GetAtt": [
              "hanodealbsecuritygroup335E7255",
              "GroupId"
            ]
          },
          "ToPort": 65535
        }
      ]
    })

    // Has security group from ALB to EC2.
    template.hasResourceProperties("AWS::EC2::SecurityGroupIngress", {
      Description: Match.anyValue(),
      FromPort: 80,
      GroupId: Match.anyValue(),
      IpProtocol: "tcp",
      SourceSecurityGroupId: Match.anyValue(),
      ToPort: 80,
    })

    // Has launch template profile for EC2 instances.
    template.hasResourceProperties("AWS::IAM::InstanceProfile", {
      Roles: [Match.anyValue()]
    });

    // For EBS volumes, the launch template includes both root and data volumes
    if (config.baseNodeConfig.dataVolume.type === "instance-store") {
      template.hasResourceProperties("AWS::EC2::LaunchTemplate", {
        LaunchTemplateData: {
          BlockDeviceMappings: [
            {
              "DeviceName": "/dev/xvda",
              "Ebs": {
                "DeleteOnTermination": true,
                "Encrypted": true,
                "Iops": 3000,
                "Throughput": 125,
                "VolumeSize": 46,
                "VolumeType": "gp3"
              }
            }
          ],
          EbsOptimized: true,
          IamInstanceProfile: Match.anyValue(),
          ImageId: Match.anyValue(),
          InstanceType: config.baseNodeConfig.instanceType.toString(),
          SecurityGroupIds: [Match.anyValue()],
          UserData: Match.anyValue(),
          TagSpecifications: Match.anyValue(),
        }
      })
    } else {

      template.hasResourceProperties("AWS::EC2::LaunchTemplate", {
        LaunchTemplateData: {
          BlockDeviceMappings: [
            {
              "DeviceName": "/dev/xvda",
              "Ebs": {
                "DeleteOnTermination": true,
                "Encrypted": true,
                "Iops": 3000,
                "Throughput": 125,
                "VolumeSize": 46,
                "VolumeType": "gp3"
              }
            },
            {
              "DeviceName": "/dev/sdf",
              "Ebs": {
                "DeleteOnTermination": true,
                "Encrypted": true,
                "Iops": config.baseNodeConfig.dataVolume.iops,
                "Throughput": config.baseNodeConfig.dataVolume.throughput,
                "VolumeSize": config.baseNodeConfig.dataVolume.sizeGiB,
                "VolumeType": config.baseNodeConfig.dataVolume.type.toString()
              }
            }
          ],
          EbsOptimized: true,
          IamInstanceProfile: Match.anyValue(),
          ImageId: Match.anyValue(),
          InstanceType: config.baseNodeConfig.instanceType.toString(),
          SecurityGroupIds: [Match.anyValue()],
          UserData: Match.anyValue(),
          TagSpecifications: Match.anyValue(),
        }
      })
    }

    // Has Auto Scaling Group.
    template.hasResourceProperties("AWS::AutoScaling::AutoScalingGroup", {
      AutoScalingGroupName: `vet-ha-nodes`,
      HealthCheckGracePeriod: config.haNodeConfig.albHealthCheckGracePeriodMin * 60,
      HealthCheckType: "ELB",
      DefaultInstanceWarmup: 60,
      MinSize: "0",
      MaxSize: "4",
      DesiredCapacity: config.haNodeConfig.numberOfNodes.toString(),
      VPCZoneIdentifier: Match.anyValue(),
      TargetGroupARNs: Match.anyValue(),
    });

    // Has Auto Scaling Lifecycle Hook.
    template.hasResourceProperties("AWS::AutoScaling::LifecycleHook", {
      DefaultResult: "ABANDON",
      HeartbeatTimeout: config.haNodeConfig.heartBeatDelayMin * 60,
      LifecycleHookName: `vet-ha-nodes`,
      LifecycleTransition: "autoscaling:EC2_INSTANCE_LAUNCHING",
    });

    // Has Auto Scaling Security Group.
    template.hasResourceProperties("AWS::EC2::SecurityGroup", {
      GroupDescription: "Security Group for Load Balancer",
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
          "Description": "Blockchain Node RPC",
          "FromPort": 80,
          "IpProtocol": "tcp",
          "ToPort": 80
        }
      ],
      VpcId: Match.anyValue(),
    });

    // Has ALB.
    template.hasResourceProperties("AWS::ElasticLoadBalancingV2::LoadBalancer", {
      LoadBalancerAttributes: [
        {
          Key: "deletion_protection.enabled",
          Value: "false"
        },
        {
          Key: "access_logs.s3.enabled",
          Value: "true"
        },
        {
          Key: "access_logs.s3.bucket",
          Value: Match.anyValue(),
        },
        {
          Key: "access_logs.s3.prefix",
          Value: `vet-ha-nodes`
        }
      ],
      Scheme: "internal",
      SecurityGroups: [
        Match.anyValue()
      ],
      "Subnets": [
        Match.anyValue(),
        Match.anyValue()
      ],
      Type: "application",
    });

    // Has ALB listener.
    template.hasResourceProperties("AWS::ElasticLoadBalancingV2::Listener", {
      "DefaultActions": [
        {
          "TargetGroupArn": Match.anyValue(),
          Type: "forward"
        }
      ],
      LoadBalancerArn: Match.anyValue(),
      Port: 80,
      Protocol: "HTTP"
    })

    // Has ALB target group.
    template.hasResourceProperties("AWS::ElasticLoadBalancingV2::TargetGroup", {
      HealthCheckEnabled: true,
      HealthCheckIntervalSeconds: 30,
      HealthCheckPath: "/admin/health",
      HealthCheckPort: "2113",
      HealthyThresholdCount: 3,
      Matcher: {
        HttpCode: "200-299"
      },
      Port: 80,
      Protocol: "HTTP",
      TargetGroupAttributes: [
        {
          Key: "deregistration_delay.timeout_seconds",
          Value: "30"
        },
        {
          Key: "stickiness.enabled",
          Value: "false"
        }
      ],
      TargetType: "instance",
      UnhealthyThresholdCount: 2,
      VpcId: Match.anyValue(),
    })
  });
});
