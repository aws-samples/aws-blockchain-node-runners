import { Match, Template } from "aws-cdk-lib/assertions";
import * as cdk from "aws-cdk-lib";
import * as dotenv from 'dotenv';
dotenv.config({ path: './test/.env-test' });
import * as config from "../lib/config/XRPConfig";
import { XRPCommonStack } from "../lib/common-stack";
import { XRPHANodesStack } from "../lib/ha-nodes-stack";

describe("XRPHANodesStackProps", () => {
  test("synthesizes the way we expect", () => {
    const app = new cdk.App();

     const xrpCommonStack = new XRPCommonStack(app, "xrp-common", {
                env: { account: config.baseConfig.accountId, region: config.baseConfig.region },
                stackName: `xrp-nodes-common`,
            });

    // Create the XRPHANodesStackProps.
    const xRPHANodesStack = new XRPHANodesStack(app, "XRP-ha-nodes", {
        stackName: "xrp-ha-nodes",
        env: { account: config.baseConfig.accountId, region: config.baseConfig.region },
        instanceType: config.baseNodeConfig.instanceType,
        instanceCpuType: config.baseNodeConfig.instanceCpuType,
        dataVolume: config.baseNodeConfig.dataVolume,
        hubNetworkID: config.baseNodeConfig.hubNetworkID,
        instanceRole: xrpCommonStack.instanceRole,
        albHealthCheckGracePeriodMin: config.haNodeConfig.albHealthCheckGracePeriodMin,
        heartBeatDelayMin: config.haNodeConfig.heartBeatDelayMin,
        numberOfNodes: config.haNodeConfig.numberOfNodes,
    });

    // Prepare the stack for assertions.
    const template = Template.fromStack(xRPHANodesStack);

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
          "Description": "P2P protocols",
          "FromPort": 51235,
          "IpProtocol": "tcp",
          "ToPort": 51235
         },
         {
          "CidrIp": "0.0.0.0/0",
          "Description": "P2P protocols",
          "FromPort": 2459,
          "IpProtocol": "tcp",
          "ToPort": 2459
         },
         {
          "CidrIp": "1.2.3.4/5",
          "Description": "RPC port HTTP (user access needs to be restricted. Allowed access only from internal IPs)",
          "FromPort": 6005,
          "IpProtocol": "tcp",
          "ToPort": 6005
         },
         {
          "Description": "Allow access from ALB to Blockchain Node",
          "FromPort": 0,
          "IpProtocol": "tcp",
          "SourceSecurityGroupId": Match.anyValue(),
          "ToPort": 65535
         },
       ]
    })

    // Has security group from ALB to EC2.
    template.hasResourceProperties("AWS::EC2::SecurityGroupIngress", {
      Description: Match.anyValue(),
      FromPort: 6005,
      GroupId: Match.anyValue(),
      IpProtocol: "tcp",
      SourceSecurityGroupId: Match.anyValue(),
      ToPort: 6005,
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
             "Iops": 12000,
             "Throughput": 700,
             "VolumeSize": 2000,
             "VolumeType": "gp3"
            }
           }
         ],
         EbsOptimized: true,
         IamInstanceProfile: Match.anyValue(),
         ImageId: Match.anyValue(),
         InstanceType:"r7a.2xlarge",
         SecurityGroupIds: [Match.anyValue()],
         UserData: Match.anyValue(),
         TagSpecifications: Match.anyValue(),
      }
    })

    // Has Auto Scaling Group.
    template.hasResourceProperties("AWS::AutoScaling::AutoScalingGroup", {
      AutoScalingGroupName: `xrp-ha-nodes`,
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
      LifecycleHookName: `xrp-ha-nodes`,
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
        "FromPort": 6005,
        "IpProtocol": "tcp",
        "ToPort": 6005
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
         Value: `xrp-ha-nodes`
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
       Port: 6005,
       Protocol: "HTTP"
    })

    // Has ALB target group.
    template.hasResourceProperties("AWS::ElasticLoadBalancingV2::TargetGroup", {
      HealthCheckEnabled: true,
      HealthCheckIntervalSeconds: 30,
      HealthCheckPath: "/",
      HealthCheckPort: "6005",
      HealthyThresholdCount: 3,
      Matcher: {
      HttpCode: "200-299"
      },
      Port: 6005,
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
