const { Match, Template } = require('aws-cdk-lib/assertions');
const cdk = require('aws-cdk-lib');
const { HABitcoinCoreNodeStack } = require('../lib/ha-node-stack');

describe('HABitcoinCoreNodeStack', () => {
    test('synthesizes the way we expect', () => {
        const app = new cdk.App();

        // Create the HABitcoinCoreNodeStack
        const bitcoinHaNodeStack = new HABitcoinCoreNodeStack(app, 'bitcoin-ha-node');

        // Prepare the stack for assertions
        const template = Template.fromStack(bitcoinHaNodeStack);

        // Check VPC with multiple availability zones
        template.hasResourceProperties('AWS::EC2::VPC', {
            CidrBlock: '10.0.0.0/16',
            EnableDnsSupport: true,
            EnableDnsHostnames: true,
        });

        // Check Security Group for Load Balancer
        template.hasResourceProperties('AWS::EC2::SecurityGroup', {
            SecurityGroupIngress: [
                {
                    FromPort: 80,
                    IpProtocol: 'tcp',
                    ToPort: 80,
                },
            ],
        });

        // Check IAM Role
        template.hasResourceProperties('AWS::IAM::Role', {
            AssumeRolePolicyDocument: {
                Statement: [{
                    Action: 'sts:AssumeRole',
                    Effect: 'Allow',
                    Principal: { Service: 'ec2.amazonaws.com' },
                }],
            },
        });


        // Check Auto Scaling Group
        template.hasResourceProperties('AWS::AutoScaling::AutoScalingGroup', {
            MinSize: '2',
            MaxSize: '4',
            DesiredCapacity: '2',
            VPCZoneIdentifier: Match.anyValue(),
        });

        // Check Launch Template
        template.hasResourceProperties('AWS::EC2::LaunchTemplate', {
            LaunchTemplateData: {
                InstanceType: 't3a.large',
                ImageId: Match.anyValue(),
                UserData: Match.anyValue(),
                IamInstanceProfile: Match.anyValue(),
                SecurityGroupIds: Match.anyValue(),
            },
        });

        // Check Target Group
        template.hasResourceProperties('AWS::ElasticLoadBalancingV2::TargetGroup', {
            Port: 8332,
            Protocol: 'HTTP',
            TargetType: 'instance',
            HealthCheckPort: '8332',
        });

        // Check Listener
        template.hasResourceProperties('AWS::ElasticLoadBalancingV2::Listener', {
            Port: 80,
            Protocol: 'HTTP',
            DefaultActions: Match.anyValue(),
        });
    });
});
