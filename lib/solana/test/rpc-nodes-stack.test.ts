import { Match, Template } from "aws-cdk-lib/assertions";
import * as cdk from "aws-cdk-lib";
import * as dotenv from 'dotenv';
dotenv.config({ path: './test/.env-test' });
import * as config from "../lib/config/solanaConfig";
import { EthRpcNodesStack } from "../lib/ha-nodes-stack";

describe("EthRpcNodesStack", () => {
  test("synthesizes the way we expect", () => {
    const app = new cdk.App();

    // Create the EthRpcNodesStack.
    const ethRpcNodesStack = new EthRpcNodesStack(app, "eth-sync-node", {
      stackName: `eth-rpc-nodes-${config.baseConfig.clientCombination}`,

      env: { account: config.baseConfig.accountId, region: config.baseConfig.region },
      PolygonClientCombination: config.baseConfig.clientCombination,
      instanceType: config.rpcNodeConfig.instanceType,
      instanceCpuType: config.rpcNodeConfig.instanceCpuType,
      numberOfNodes: config.rpcNodeConfig.numberOfNodes,
      albHealthCheckGracePeriodMin: config.rpcNodeConfig.albHealthCheckGracePeriodMin,
      heartBeatDelayMin: config.rpcNodeConfig.heartBeatDelayMin,
      dataVolumes: config.syncNodeConfig.dataVolumes,
  });

    // Prepare the stack for assertions.
    const template = Template.fromStack(ethRpcNodesStack);

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
         "FromPort": 30303,
         "IpProtocol": "tcp",
         "ToPort": 30303
        },
        {
         "CidrIp": "0.0.0.0/0",
         "Description": "P2P",
         "FromPort": 30303,
         "IpProtocol": "udp",
         "ToPort": 30303
        },
        {
         "CidrIp": "0.0.0.0/0",
         "Description": "P2P",
         "FromPort": 30304,
         "IpProtocol": "tcp",
         "ToPort": 30304
        },
        {
         "CidrIp": "0.0.0.0/0",
         "Description": "P2P",
         "FromPort": 30304,
         "IpProtocol": "udp",
         "ToPort": 30304
        },
        {
         "CidrIp": "0.0.0.0/0",
         "Description": "CL Client P2P",
         "FromPort": 9000,
         "IpProtocol": "tcp",
         "ToPort": 9000
        },
        {
         "CidrIp": "0.0.0.0/0",
         "Description": "CL Client P2P",
         "FromPort": 9000,
         "IpProtocol": "udp",
         "ToPort": 9000
        },
        {
         "CidrIp": "1.2.3.4/5",
         "Description": "CL Client API",
         "FromPort": 5051,
         "IpProtocol": "tcp",
         "ToPort": 5051
        },
        {
         "CidrIp": "1.2.3.4/5",
         "Description": "CL Client API",
         "FromPort": 5052,
         "IpProtocol": "tcp",
         "ToPort": 5052
        },
        {
         "CidrIp": "1.2.3.4/5",
         "Description": "EL Client RPC (Auth)",
         "FromPort": 8551,
         "IpProtocol": "tcp",
         "ToPort": 8551
        },
        {
         "CidrIp": "1.2.3.4/5",
         "Description": "EL Client RPC",
         "FromPort": 8545,
         "IpProtocol": "tcp",
         "ToPort": 8545
        },
        {
         "Description": Match.anyValue(),
         "FromPort": 0,
         "IpProtocol": "tcp",
         "SourceSecurityGroupId": Match.anyValue(),
         "ToPort": 65535
        }
       ]
    })

    // Has security group from ALB to EC2.
    template.hasResourceProperties("AWS::EC2::SecurityGroupIngress", {
      Description: Match.anyValue(),
      FromPort: 8545,
      GroupId: Match.anyValue(),
      IpProtocol: "tcp",
      SourceSecurityGroupId: Match.anyValue(),
      ToPort: 8545,
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
            "Iops": 6000,
            "Throughput": 400,
            "VolumeSize": 3072,
            "VolumeType": "gp3"
           }
          }
         ],
         EbsOptimized: true,
         IamInstanceProfile: Match.anyValue(),
         ImageId: Match.anyValue(),
         InstanceType:"m7g.2xlarge",
         SecurityGroupIds: [Match.anyValue()],
         UserData: Match.anyValue()
      }
    })

    // Has Auto Scaling Group.
    template.hasResourceProperties("AWS::AutoScaling::AutoScalingGroup", {
      AutoScalingGroupName: `eth-rpc-nodes-${config.baseConfig.clientCombination}`,
      HealthCheckGracePeriod: config.rpcNodeConfig.albHealthCheckGracePeriodMin * 60,
      HealthCheckType: "ELB",
      DefaultInstanceWarmup: 60,
      MinSize: "0",
      MaxSize: "4",
      DesiredCapacity: config.rpcNodeConfig.numberOfNodes.toString(),
      VPCZoneIdentifier: Match.anyValue(),
      TargetGroupARNs: Match.anyValue(),
    });

    // Has Auto Scaling Lifecycle Hook.
    template.hasResourceProperties("AWS::AutoScaling::LifecycleHook", {
      DefaultResult: "ABANDON",
      HeartbeatTimeout: config.rpcNodeConfig.heartBeatDelayMin * 60,
      LifecycleHookName: `eth-rpc-nodes-${config.baseConfig.clientCombination}`,
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
        "FromPort": 8545,
        "IpProtocol": "tcp",
        "ToPort": 8545
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
         Value: `eth-rpc-nodes-${config.baseConfig.clientCombination}`
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
       Port: 8545,
       Protocol: "HTTP"
    })

    // Has ALB target group.
    template.hasResourceProperties("AWS::ElasticLoadBalancingV2::TargetGroup", {
      HealthCheckEnabled: true,
      HealthCheckIntervalSeconds: 30,
      HealthCheckPath: "/",
      HealthCheckPort: "8545",
      HealthyThresholdCount: 3,
      Matcher: {
      HttpCode: "200-299"
      },
      Port: 8545,
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