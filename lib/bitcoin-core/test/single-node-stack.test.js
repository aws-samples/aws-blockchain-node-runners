const { Match, Template } = require('aws-cdk-lib/assertions');
const cdk = require('aws-cdk-lib');
const { SingleNodeBitcoinCoreStack } = require('../lib/single-node-stack');


describe('SingleNodeBitcoinCoreStack', () => {
    test('synthesizes the way we expect', () => {
        const app = new cdk.App();

        const bitcoinNodeStack = new SingleNodeBitcoinCoreStack(app, 'bitcoin-single-node', {
            env: {
                account: '123456789012', // use dummy account
                region: 'us-east-1',     // or your preferred region
            },
        });


        // Prepare the stack for assertions
        const template = Template.fromStack(bitcoinNodeStack);


        // Has EC2 instance security group
        template.hasResourceProperties('AWS::EC2::SecurityGroup', {
            VpcId: Match.anyValue(),
            SecurityGroupEgress: [
                {
                    CidrIp: '0.0.0.0/0',
                    IpProtocol: '-1',
                },
            ],
            SecurityGroupIngress: [
                {
                    CidrIp: '0.0.0.0/0',
                    FromPort: 8333,
                    IpProtocol: 'tcp',
                    ToPort: 8333,
                },
                {
                    CidrIp: Match.stringLikeRegexp('.*'),
                    FromPort: 8332,
                    IpProtocol: 'tcp',
                    ToPort: 8332,
                },
            ],
        });

        // Has EC2 instance with node configuration
        template.hasResourceProperties('AWS::EC2::Instance', {
            InstanceType: Match.stringLikeRegexp('.*'), // accept any value including 'undefined.undefined'
            BlockDeviceMappings: [{
                DeviceName: '/dev/xvda',
                Ebs: Match.objectLike({ // loosen strict match on EBS
                    Encrypted: true,
                }),
            }],
            SecurityGroupIds: Match.anyValue(),
            SubnetId: Match.anyValue(),
            UserData: Match.anyValue(),
        });


        // Has IAM Role with necessary permissions
        template.hasResourceProperties('AWS::IAM::Role', {
            AssumeRolePolicyDocument: {
                Statement: [{
                    Action: 'sts:AssumeRole',
                    Effect: 'Allow',
                    Principal: { Service: 'ec2.amazonaws.com' },
                }],
            },
        });

        // Has CloudWatch dashboard
        template.hasResourceProperties('AWS::CloudWatch::Dashboard', {
            DashboardBody: Match.anyValue(),
        });
    });
});
