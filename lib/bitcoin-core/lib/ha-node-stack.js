const cdk = require('aws-cdk-lib');
const ec2 = require('aws-cdk-lib/aws-ec2');
const iam = require('aws-cdk-lib/aws-iam');
const autoscaling = require('aws-cdk-lib/aws-autoscaling');
const elbv2 = require('aws-cdk-lib/aws-elasticloadbalancingv2');
const path = require('path');
const fs = require('fs');
const { NagSuppressions } = require('cdk-nag');
const { BitcoinSecurityGroup } = require('./constructs/bitcoin-mainnet-security-group.js');
require('dotenv').config();

//Parse env variables
const {
    INSTANCE_CLASS,
    INSTANCE_SIZE,
    EBS_VOLUME_SIZE,
    EBS_VOLUME_TYPE,
    ASG_MIN_CAPACITY,
    ASG_MAX_CAPACITY,
    ASG_DESIRED_CAPACITY,
    GP3_THROUGHPUT,
    GP3_IOPS,
    CPU_ARCHITECTURE,
    AWS_REGION
} = process.env;


class HABitcoinCoreNodeStack extends cdk.Stack {
    constructor(scope, id, props) {
        super(scope, id, props);

        // Create VPC
        const vpc = ec2.Vpc.fromLookup(this, 'DefaultVPC', {
            isDefault: true,
        });

        // Security Group for the Load Balancer
        const lbSg = new ec2.SecurityGroup(this, 'BitcoinLBSG', {
            vpc,
            allowAllOutbound: true,
        });
        lbSg.addIngressRule(ec2.Peer.ipv4(vpc.vpcCidrBlock), ec2.Port.tcp(80), 'Bitcoin RPC');

        // Security Group for EC2 instances
        const sgConstruct = new BitcoinSecurityGroup(this, 'BitcoinSecurityGroup', vpc);
        const ec2Sg = sgConstruct.securityGroup;

        // IAM Role for EC2
        const role = props.instanceRole;

        // Load user data script from /assets/
        const bitcoinSetup = fs.readFileSync(path.join(__dirname, 'assets', 'bitcoin-setup.sh'), 'utf8');

        // Load bitcoin.conf file
        const bitcoinConfPath = path.join(__dirname, 'bitcoin.conf');
        const bitcoinConfContent = fs.readFileSync(bitcoinConfPath, 'utf8');

        // User data for EC2 instance
        const userData = ec2.UserData.forLinux();
        userData.addCommands(
            `export AWS_REGION='${AWS_REGION}'`,
            `export BITCOIN_CONF='${bitcoinConfContent}'`,
            bitcoinSetup
        );

        // Determine CPU architecture
        const arch = CPU_ARCHITECTURE === 'ARM64' ? ec2.AmazonLinuxCpuType.ARM_64 : ec2.AmazonLinuxCpuType.X86_64;
        const machineImage = ec2.MachineImage.latestAmazonLinux2({ cpuType: arch });
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



        // Configure block devices 
        const blockDevices = [{
            deviceName: '/dev/xvda',
            volume: ec2.BlockDeviceVolume.ebs(
                Number(EBS_VOLUME_SIZE),
                {
                    volumeType: ec2.EbsDeviceVolumeType[EBS_VOLUME_TYPE],
                    encrypted: true,
                    iops: Number(GP3_IOPS),
                    throughput: Number(GP3_THROUGHPUT)
                }
            ),
        }];

        // Create Launch Template
        const launchTemplate = new ec2.LaunchTemplate(this, 'BitcoinLaunchTemplate', {
            instanceType: ec2.InstanceType.of(
                ec2.InstanceClass[INSTANCE_CLASS],
                ec2.InstanceSize[INSTANCE_SIZE]
            ),
            machineImage,
            userData,
            role,
            securityGroup: ec2Sg,
            blockDevices,
        });


        // Auto Scaling Group with Launch Template
        const asg = new autoscaling.AutoScalingGroup(this, 'BitcoinASG', {
            vpc,
            launchTemplate: launchTemplate,
            minCapacity: Number(ASG_MIN_CAPACITY),
            maxCapacity: Number(ASG_MAX_CAPACITY),
            desiredCapacity: Number(ASG_DESIRED_CAPACITY),
        });

        // Attach the ASG to the Target Group
        targetGroup.addTarget(asg);

        new cdk.CfnOutput(this, 'LoadBalancerDNS', {
            value: lb.loadBalancerDnsName,
            description: 'DNS name of the Load Balancer',
            exportName: 'BitcoinLoadBalancerDNS',
        });

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
