import { Match, Template } from "aws-cdk-lib/assertions";
import * as cdk from "aws-cdk-lib";
import * as dotenv from 'dotenv';
dotenv.config({ path: './test/.env-test' });
import * as config from "../lib/config/fantomConfig";
import * as configTypes from "../lib/config/fantomConfig.interface";
import { FantomHANodesStack } from "../lib/ha-nodes-stack";

describe("FantomHANodesStack", () => {
  test("synthesizes the way we expect", () => {
    const app = new cdk.App();

    // Create the FantomHANodesStack.
    const fantomHANodesStack = new FantomHANodesStack(app, "fantom-sync-node", {
    stackName: `fantom-ha-nodes-${config.baseNodeConfig.nodeConfiguration}`,
    env: { account: config.baseConfig.accountId, region: config.baseConfig.region },
    nodeRole: <configTypes.FantomNodeRole> "rpc-node",

    instanceType: config.baseNodeConfig.instanceType,
    instanceCpuType: config.baseNodeConfig.instanceCpuType,
    fantomNetwork: config.baseNodeConfig.fantomNetwork,
    nodeConfiguration: config.baseNodeConfig.nodeConfiguration,
    snapshotsUrl:config.baseNodeConfig.snapshotsUrl,
    dataVolume: config.baseNodeConfig.dataVolume,

    albHealthCheckGracePeriodMin: config.haNodeConfig.albHealthCheckGracePeriodMin,
    heartBeatDelayMin: config.haNodeConfig.heartBeatDelayMin,
    numberOfNodes: config.haNodeConfig.numberOfNodes,
  });

    // Prepare the stack for assertions.
    const template = Template.fromStack(fantomHANodesStack);

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
          "Description": "P2P",
          "FromPort": 5050,
          "IpProtocol": "tcp",
          "ToPort": 5050
         },
         {
          "CidrIp": "0.0.0.0/0",
          "Description": "P2P",
          "FromPort": 5050,
          "IpProtocol": "udp",
          "ToPort": 5050
         },
         {
          "CidrIp": "1.2.3.4/5",
          "Description": "FANTOM RPC Port",
          "FromPort": 18545,
          "IpProtocol": "tcp",
          "ToPort": 18545
         },
         {
          "CidrIp": "1.2.3.4/5",
          "Description": "FANTOM WebSocket Port",
          "FromPort": 18546,
          "IpProtocol": "tcp",
          "ToPort": 18546
         },
         {
          "Description": "Allow access from ALB to Blockchain Node",
          "FromPort": 0,
          "IpProtocol": "tcp",
          "SourceSecurityGroupId": {
           "Fn::GetAtt": [
            Match.anyValue(),
            "GroupId"
           ]
          },
          "ToPort": 65535
         },
       ]
    })

    // Has security group from ALB to EC2.
    template.hasResourceProperties("AWS::EC2::SecurityGroupIngress", {
      Description: "Load balancer to target",
      FromPort: 18545,
      GroupId: Match.anyValue(),
      IpProtocol: "tcp",
      SourceSecurityGroupId: Match.anyValue(),
      ToPort: 18545,
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
           "DeviceName": "/dev/sda1",
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
            "Iops": 7000,
            "Throughput": 400,
            "VolumeSize": 2000,
            "VolumeType": "gp3"
           }
          }
         ],
         EbsOptimized: true,
         IamInstanceProfile: Match.anyValue(),
         ImageId: Match.anyValue(),
         InstanceType:"m6a.2xlarge",
         SecurityGroupIds: [Match.anyValue()],
         UserData: Match.anyValue(),
         TagSpecifications: Match.anyValue(),
      }
    })

    // Has Auto Scaling Group.
    template.hasResourceProperties("AWS::AutoScaling::AutoScalingGroup", {
      AutoScalingGroupName: `fantom-ha-nodes-${config.baseNodeConfig.nodeConfiguration}`,
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
      LifecycleHookName: `fantom-ha-nodes-${config.baseNodeConfig.nodeConfiguration}`,
      LifecycleTransition: "autoscaling:EC2_INSTANCE_LAUNCHING",
    });

    // Has Auto Scaling Security Group.
    template.hasResourceProperties("AWS::EC2::SecurityGroup", {
      GroupDescription: Match.anyValue(),
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
        "FromPort": 18545,
        "IpProtocol": "tcp",
        "ToPort": 18545
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
         Value: `fantom-ha-nodes-${config.baseNodeConfig.nodeConfiguration}`
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
       Port: 18545,
       Protocol: "HTTP"
    })

    // Has ALB target group.
    template.hasResourceProperties("AWS::ElasticLoadBalancingV2::TargetGroup", {
      HealthCheckEnabled: true,
      HealthCheckIntervalSeconds: 30,
      HealthCheckPath: "/",
      HealthCheckPort: "18545",
      HealthyThresholdCount: 3,
      Matcher: {
      HttpCode: "200-299"
      },
      Port: 18545,
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
