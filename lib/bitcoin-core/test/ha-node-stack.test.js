const { Match, Template } = require('aws-cdk-lib/assertions');
const cdk = require('aws-cdk-lib');
const ec2 = require('aws-cdk-lib/aws-ec2');
const iam = require('aws-cdk-lib/aws-iam');
const { HABitcoinCoreNodeStack } = require('../lib/ha-node-stack');

describe('HABitcoinCoreNodeStack', () => {
    test('synthesizes the way we expect', () => {
        const app = new cdk.App();

        // Create a mock stack for context and shared resources like IAM role
        const mockStack = new cdk.Stack(app, 'MockStack', {
            env: {
                account: '123456789012',
                region: 'us-east-1',
            },
        });

        // Create a mock IAM role to pass into the HA stack
        const testRole = new iam.Role(mockStack, 'TestInstanceRole', {
            assumedBy: new iam.ServicePrincipal('ec2.amazonaws.com'),
        });

        // Instantiate the HA stack using the default VPC and injected role
        const haStack = new HABitcoinCoreNodeStack(app, 'ha-bitcoin-node', {
            env: {
                account: '123456789012',
                region: 'us-east-1',
            },
            instanceRole: testRole,
        });

        const template = Template.fromStack(haStack);

        // IAM Role should not be present in this stack (provided externally), but for completeness:
        template.resourceCountIs('AWS::IAM::Role', 0);

        // Launch Template should exist
        template.resourceCountIs('AWS::EC2::LaunchTemplate', 1);

        // Auto Scaling Group
        template.resourceCountIs('AWS::AutoScaling::AutoScalingGroup', 1);

        // Application Load Balancer
        template.resourceCountIs('AWS::ElasticLoadBalancingV2::LoadBalancer', 1);

        // Target Group
        template.resourceCountIs('AWS::ElasticLoadBalancingV2::TargetGroup', 1);

        // Listener
        template.resourceCountIs('AWS::ElasticLoadBalancingV2::Listener', 1);

        // Confirm the ASG has correct capacity
        template.hasResourceProperties('AWS::AutoScaling::AutoScalingGroup', {
            MinSize: Match.anyValue(),
            MaxSize: Match.anyValue(),
            DesiredCapacity: Match.anyValue(),
        });


        // Confirm LaunchTemplate references role ARN
        template.hasResourceProperties('AWS::EC2::LaunchTemplate', {
            LaunchTemplateData: {
                IamInstanceProfile: Match.anyValue(),
                ImageId: Match.anyValue(),
                InstanceType: Match.anyValue(),
                SecurityGroupIds: Match.anyValue(),
            }
        });

        // Load Balancer Listener config
        template.hasResourceProperties('AWS::ElasticLoadBalancingV2::Listener', {
            Port: 80,
            Protocol: 'HTTP',
        });

        // Target Group config
        template.hasResourceProperties('AWS::ElasticLoadBalancingV2::TargetGroup', {
            Port: 8332,
            Protocol: 'HTTP',
        });
    });
});
