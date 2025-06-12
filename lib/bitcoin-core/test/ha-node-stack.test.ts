import { Match, Template } from "aws-cdk-lib/assertions";
import * as cdk from "aws-cdk-lib";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as iam from "aws-cdk-lib/aws-iam";
import { HABitcoinCoreNodeStack } from "../lib/ha-node-stack";

describe("HABitcoinCoreNodeStack", () => {
    test("synthesizes the way we expect", () => {
        const app = new cdk.App();

        // Create a mock stack for context and shared resources like IAM role
        const mockStack = new cdk.Stack(app, "MockStack", {
            env: {
                account: "123456789012",
                region: "us-east-1",
            },
        });

        // Create a mock IAM role to pass into the HA stack
        const testRole = new iam.Role(mockStack, "TestInstanceRole", {
            assumedBy: new iam.ServicePrincipal("ec2.amazonaws.com"),
        });

        // Instantiate the HA stack using the default VPC and injected role
        const haStack = new HABitcoinCoreNodeStack(app, "ha-bitcoin-node", {
            env: {
                account: "123456789012",
                region: "us-east-1",
            },
            instanceRole: testRole,
            instanceType: new ec2.InstanceType("t3a.large"),
            instanceCpuType: ec2.AmazonLinuxCpuType.X86_64,
            dataVolume: {
                sizeGiB: 1000,
                type: ec2.EbsDeviceVolumeType.GP3,
                iops: 3000,
                throughput: 125,
            },
            numberOfNodes: 2,
            albHealthCheckGracePeriodMin: 10,
            heartBeatDelayMin: 40,
        });

        const template = Template.fromStack(haStack);

        // Launch Template should exist
        template.resourceCountIs("AWS::EC2::LaunchTemplate", 1);

        // Auto Scaling Group
        template.resourceCountIs("AWS::AutoScaling::AutoScalingGroup", 1);

        // Application Load Balancer
        template.resourceCountIs("AWS::ElasticLoadBalancingV2::LoadBalancer", 1);

        // Target Group
        template.resourceCountIs("AWS::ElasticLoadBalancingV2::TargetGroup", 1);

        // Listener
        template.resourceCountIs("AWS::ElasticLoadBalancingV2::Listener", 1);

        // Confirm the ASG has correct capacity
        template.hasResourceProperties("AWS::AutoScaling::AutoScalingGroup", {
            MinSize: Match.anyValue(),
            MaxSize: Match.anyValue(),
            DesiredCapacity: Match.anyValue(),
        });

        // Confirm LaunchTemplate references role ARN
        template.hasResourceProperties("AWS::EC2::LaunchTemplate", {
            LaunchTemplateData: {
                IamInstanceProfile: Match.anyValue(),
                ImageId: Match.anyValue(),
                InstanceType: Match.anyValue(),
                SecurityGroupIds: Match.anyValue(),
            },
        });

        // Load Balancer Listener config
        template.hasResourceProperties("AWS::ElasticLoadBalancingV2::Listener", {
            Port: 8332,
            Protocol: "HTTP",
        });

        // Target Group config
        template.hasResourceProperties("AWS::ElasticLoadBalancingV2::TargetGroup", {
            Port: 8332,
            Protocol: "HTTP",
        });
    });
});
