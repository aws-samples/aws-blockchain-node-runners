const cdk = require('aws-cdk-lib');
const ec2 = require('aws-cdk-lib/aws-ec2');
const iam = require('aws-cdk-lib/aws-iam');
const autoscaling = require('aws-cdk-lib/aws-autoscaling');
const elbv2 = require('aws-cdk-lib/aws-elasticloadbalancingv2');
const path = require('path');
const fs = require('fs');
const { AwsSolutionsChecks, NagSuppressions } = require('cdk-nag');
const { Aspects } = require('aws-cdk-lib');

class HABitcoinCoreNodeStack extends cdk.Stack {
    constructor(scope, id, props) {
        super(scope, id, props);

        // Create VPC with multiple AZs
        const vpc = new ec2.Vpc(this, 'BitcoinHAVPC', { maxAzs: 2 });

        // Security Group for the Load Balancer
        const lbSg = new ec2.SecurityGroup(this, 'BitcoinLBSG', {
            vpc,
            allowAllOutbound: true,
        });
        lbSg.addIngressRule(ec2.Peer.ipv4(vpc.vpcCidrBlock), ec2.Port.tcp(80), 'Bitcoin RPC');

        // Security Group for EC2 instances
        const ec2Sg = new ec2.SecurityGroup(this, 'BitcoinEC2SG', {
            vpc,
            allowAllOutbound: true,
        });
        ec2Sg.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(8333), 'Bitcoin P2P');
        ec2Sg.addIngressRule(lbSg, ec2.Port.tcp(8332), 'Bitcoin RPC from Load Balancer');

        // IAM Role for EC2
        const role = new iam.Role(this, 'BitcoinHARole', {
            assumedBy: new iam.ServicePrincipal('ec2.amazonaws.com'),
            managedPolicies: [
                iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonSSMManagedInstanceCore'),
            ],
        });

        // Load bitcoin.conf file
        const bitcoinConfPath = path.join(__dirname, 'bitcoin.conf');
        const bitcoinConfContent = fs.readFileSync(bitcoinConfPath, 'utf8');

        // User data for EC2 instances
        const userData = ec2.UserData.forLinux();
        userData.addCommands(
            'yum update -y',
            'amazon-linux-extras install docker -y',
            'service docker start',
            'mkdir -p /home/bitcoin/.bitcoin',
            `echo '${bitcoinConfContent}' > /home/bitcoin/.bitcoin/bitcoin.conf`,
            'docker run -d --name bitcoind -v /home/bitcoin/.bitcoin:/root/.bitcoin -p 8333:8333 -p 8332:8332 bitcoin/bitcoin:latest bash -c "chown -R bitcoin:bitcoin /root/.bitcoin && bitcoind"'
        );

        // Application Load Balancer
        const lb = new elbv2.ApplicationLoadBalancer(this, 'BitcoinLB', {
            vpc,
            internetFacing: false,
            securityGroup: lbSg,
        });

        // Create target group with health check configuration
        const targetGroup = new elbv2.ApplicationTargetGroup(this, 'BitcoinTG', {
            vpc,
            port: 8332,
            protocol: elbv2.ApplicationProtocol.HTTP,
            targetType: elbv2.TargetType.INSTANCE,
            healthCheck: {
                protocol: elbv2.Protocol.HTTP,
                port: '8332',
                path: '/',
                healthyHttpCodes: '200-499',
                interval: cdk.Duration.seconds(30),
                timeout: cdk.Duration.seconds(5),
                healthyThresholdCount: 2,
                unhealthyThresholdCount: 2,
            },
            stickinessCookieDuration: cdk.Duration.hours(1.5),
            stickinessCookieName: 'BitcoinStickySession',
            stickinessEnabled: true,
        });

        // Add listener to the load balancer with forwarding rule
        lb.addListener('RPCListener', {
            port: 80,
            open: false,
            protocol: elbv2.ApplicationProtocol.HTTP,
            defaultAction: elbv2.ListenerAction.forward([targetGroup]),
        });



        // Create Launch Template
        const launchTemplate = new ec2.LaunchTemplate(this, 'BitcoinLaunchTemplate', {
            instanceType: ec2.InstanceType.of(ec2.InstanceClass.T3A, ec2.InstanceSize.LARGE),
            machineImage: ec2.MachineImage.latestAmazonLinux2(),
            userData,
            role,
            securityGroup: ec2Sg,
            blockDevices: [{
                deviceName: '/dev/xvda',
                volume: ec2.BlockDeviceVolume.ebs(1000, {
                    volumeType: ec2.EbsDeviceVolumeType.GP3,
                    encrypted: true,
                }),
            }],
        });

        // Auto Scaling Group with Launch Template
        const asg = new autoscaling.AutoScalingGroup(this, 'BitcoinASG', {
            vpc,
            launchTemplate: launchTemplate,
            minCapacity: 2,
            maxCapacity: 4,
            desiredCapacity: 2,
        });

        // Attach the ASG to the Target Group
        targetGroup.addTarget(asg);

        // CDK Nag Checks and Suppressions
        Aspects.of(this).add(new AwsSolutionsChecks());

        // Suppress VPC Flow Log warning
        NagSuppressions.addResourceSuppressions(
            vpc,
            [
                {
                    id: 'AwsSolutions-VPC7',
                    reason: 'Flow logs are not required for this specific setup as it is a high-availability Bitcoin node stack where logging may add unnecessary costs and complexity.',
                },
            ],
        );

        // Suppress Load Balancer Security Group warning
        NagSuppressions.addResourceSuppressions(
            lbSg,
            [
                {
                    id: 'AwsSolutions-EC23',
                    reason: 'CDK Nag validation failure due to intrinsic function reference, which is expected behavior.',
                },
            ],
        );

        // Suppress EC2 Security Group warning
        NagSuppressions.addResourceSuppressions(
            ec2Sg,
            [
                {
                    id: 'AwsSolutions-EC23',
                    reason: 'Inbound access is required for Bitcoin P2P communication, which relies on open access for peer connections.',
                },
            ],
        );

        // Suppress IAM Role warnings
        NagSuppressions.addResourceSuppressions(
            role,
            [
                {
                    id: 'AwsSolutions-IAM4',
                    reason: 'Using AWS managed policies for simplicity and maintenance.',
                },
            ],
        );

        // Suppress Load Balancer logging warning
        NagSuppressions.addResourceSuppressions(
            lb,
            [
                {
                    id: 'AwsSolutions-ELB2',
                    reason: 'Access logging is not required for this application to minimize operational costs.',
                },
            ],
        );

        // Suppress Auto Scaling Group warnings
        NagSuppressions.addResourceSuppressions(
            asg,
            [
                {
                    id: 'AwsSolutions-AS3',
                    reason: 'Auto Scaling Group does not require notifications for scaling events in this non-critical application.',
                },
                {
                    id: 'AwsSolutions-AS3',
                    reason: 'Setting the desired capacity is intentional and necessary for the stability and reliability of the application.',
                },
            ],
        );

    }
}


module.exports = { HABitcoinCoreNodeStack };
