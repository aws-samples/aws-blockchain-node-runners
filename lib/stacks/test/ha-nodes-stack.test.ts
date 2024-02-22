import { Match, Template } from "aws-cdk-lib/assertions";
import * as cdk from "aws-cdk-lib";
import * as dotenv from 'dotenv';
dotenv.config({ path: './test/.env-test' });
import * as config from "../lib/config/stacksConfig";
import { StacksHANodesStack } from "../lib/ha-nodes-stack";
import { TEST_STACKS_DATA_VOL_IOPS, TEST_STACKS_DATA_VOL_SIZE, TEST_STACKS_DATA_VOL_THROUGHPUT, TEST_STACKS_DATA_VOL_TYPE, TEST_STACKS_INSTANCE_TYPE, TEST_STACKS_P2P_PORT, TEST_STACKS_RPC_PORT } from "./test-constants";

describe("StacksHANodesStack", () => {
  test("synthesizes the way we expect", () => {
    const app = new cdk.App();

    // Create the StacksHANodesStack.
    const stacksHANodesStack = new StacksHANodesStack(app, "stacks-sync-node", {
      stackName: `stacks-ha-nodes-${config.haNodeConfig.stacksNodeConfiguration}`,
      env: { account: config.baseConfig.accountId, region: config.baseConfig.region },
      ...config.haNodeConfig
    });

    // Prepare the stack for assertions.
    const template = Template.fromStack(stacksHANodesStack);

    // Has EC2 instance security group.
    template.hasResourceProperties("AWS::EC2::SecurityGroup", {
      GroupDescription: Match.anyValue(),
      VpcId: Match.anyValue(),
      SecurityGroupEgress: [
        {
         "CidrIp": "0.0.0.0/0",
         "Description": Match.anyValue(),
         "IpProtocol": "-1"
        }
       ],
       SecurityGroupIngress: [
        {
          "CidrIp": "0.0.0.0/0",
          "Description": Match.anyValue(),
          "FromPort": TEST_STACKS_P2P_PORT,
          "IpProtocol": "tcp",
          "ToPort": TEST_STACKS_P2P_PORT
        },
        {
          "CidrIp": "0.0.0.0/0",
          "Description": Match.anyValue(),
          "FromPort": TEST_STACKS_P2P_PORT,
          "IpProtocol": "udp",
          "ToPort": TEST_STACKS_P2P_PORT
        },
        {
          "CidrIp": "1.2.3.4/5",
          "Description": Match.anyValue(),
          "FromPort": TEST_STACKS_RPC_PORT,
          "IpProtocol": "tcp",
          "ToPort": TEST_STACKS_RPC_PORT
        },
        {
          "Description": Match.anyValue(),
          "FromPort": 0,
          "IpProtocol": "tcp",
          "ToPort": 65535
        },
      ]
    })

    // Has security group from ALB to EC2.
    template.hasResourceProperties("AWS::EC2::SecurityGroupIngress", {
      Description: Match.anyValue(),
      FromPort: TEST_STACKS_RPC_PORT,
      GroupId: Match.anyValue(),
      IpProtocol: "tcp",
      SourceSecurityGroupId: Match.anyValue(),
      ToPort: TEST_STACKS_RPC_PORT,
    })

    // Has launch template profile for EC2 instances.
    template.hasResourceProperties("AWS::IAM::InstanceProfile", {
      Roles: [Match.anyValue()]
    });

    // Has EC2 launch template.
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
            "Iops": TEST_STACKS_DATA_VOL_IOPS,
            "Throughput": TEST_STACKS_DATA_VOL_THROUGHPUT,
            "VolumeSize": TEST_STACKS_DATA_VOL_SIZE,
            "VolumeType": TEST_STACKS_DATA_VOL_TYPE
           }
          }
         ],
         EbsOptimized: true,
         IamInstanceProfile: Match.anyValue(),
         ImageId: Match.anyValue(),
         InstanceType: TEST_STACKS_INSTANCE_TYPE,
         SecurityGroupIds: [Match.anyValue()],
         UserData: Match.anyValue(),
         TagSpecifications: Match.anyValue(),
      }
    })

    // Has Auto Scaling Group.
    template.hasResourceProperties("AWS::AutoScaling::AutoScalingGroup", {
      AutoScalingGroupName: `stacks-ha-nodes-${config.haNodeConfig.stacksNodeConfiguration}`,
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
      LifecycleHookName: `stacks-ha-nodes-${config.haNodeConfig.stacksNodeConfiguration}`,
      LifecycleTransition: "autoscaling:EC2_INSTANCE_LAUNCHING",
    });

    // Has Auto Scaling Security Group.
    template.hasResourceProperties("AWS::EC2::SecurityGroup", {
      GroupDescription: Match.anyValue(),
      SecurityGroupEgress: [
      {
        "CidrIp": "0.0.0.0/0",
        "Description": Match.anyValue(),
        "IpProtocol": "-1"
      }
      ],
      SecurityGroupIngress: [
      {
        "CidrIp": "1.2.3.4/5",
        "Description": Match.anyValue(),
        "FromPort": TEST_STACKS_RPC_PORT,
        "IpProtocol": "tcp",
        "ToPort": TEST_STACKS_RPC_PORT
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
          Value: `stacks-ha-nodes-${config.haNodeConfig.stacksNodeConfiguration}`
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
        Port: TEST_STACKS_RPC_PORT,
        Protocol: "HTTP"
    })

    // Has ALB target group.
    template.hasResourceProperties("AWS::ElasticLoadBalancingV2::TargetGroup", {
      HealthCheckEnabled: true,
      HealthCheckIntervalSeconds: 30,
      HealthCheckPath: "/v2/info",
      HealthCheckPort: TEST_STACKS_RPC_PORT.toString(),
      HealthyThresholdCount: 3,
      Matcher: {
      HttpCode: "200-299"
      },
      Port: TEST_STACKS_RPC_PORT,
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
