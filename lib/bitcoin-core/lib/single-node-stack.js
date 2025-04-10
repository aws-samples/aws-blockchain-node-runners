const cdk = require('aws-cdk-lib');
const ec2 = require('aws-cdk-lib/aws-ec2');
const iam = require('aws-cdk-lib/aws-iam');
const cloudwatch = require('aws-cdk-lib/aws-cloudwatch');
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
    GP3_THROUGHPUT,
    GP3_IOPS,
    CPU_ARCHITECTURE,
    USE_INSTANCE_STORE
} = process.env;

class SingleNodeBitcoinCoreStack extends cdk.Stack {
    constructor(scope, id, props) {
        super(scope, id, props);

        // Retrieve region
        const region = cdk.Stack.of(this).region;

        // Create VPC
        const vpc = ec2.Vpc.fromLookup(this, 'DefaultVPC', {
            isDefault: true,
        });

        const sgConstruct = new BitcoinSecurityGroup(this, 'BitcoinSecurityGroup', vpc);
        const sg = sgConstruct.securityGroup;

        // IAM Role for EC2
        const role = props.instanceRole;

        // Load scripts from /assets/
        const bitcoinSetup = fs.readFileSync(path.join(__dirname, 'assets', 'bitcoin-setup.sh'), 'utf8');
        const cloudwatchSetup = fs.readFileSync(path.join(__dirname, 'assets', 'cloudwatch-setup.sh'), 'utf8');
        const blockheightCron = fs.readFileSync(path.join(__dirname, 'assets', 'blockheight-cron.sh'), 'utf8');

        // Load bitcoin.conf file
        const bitcoinConfPath = path.join(__dirname, 'bitcoin.conf');
        const bitcoinConfContent = fs.readFileSync(bitcoinConfPath, 'utf8');

        // User data for EC2 instance
        const userData = ec2.UserData.forLinux();
        userData.addCommands(
            `export AWS_REGION='${region}'`,
            `export BITCOIN_CONF='${bitcoinConfContent}'`,
            bitcoinSetup,
            cloudwatchSetup,
            blockheightCron
        );

        // Determine CPU architecture
        const arch = CPU_ARCHITECTURE === 'ARM64' ? ec2.AmazonLinuxCpuType.ARM_64 : ec2.AmazonLinuxCpuType.X86_64;
        const machineImage = ec2.MachineImage.latestAmazonLinux2({ cpuType: arch });


        // configure EBS block devices
        const blockDevices = [
            {
                deviceName: '/dev/xvda',
                volume: ec2.BlockDeviceVolume.ebs(
                    Number(EBS_VOLUME_SIZE),
                    {
                        volumeType: ec2.EbsDeviceVolumeType[EBS_VOLUME_TYPE],
                        encrypted: true,
                        iops: Number(GP3_IOPS),
                        throughput: Number(GP3_THROUGHPUT),
                    }
                ),
            },
        ];


        // EC2 Instance
        const instance = new ec2.Instance(this, 'BitcoinSingleNode', {
            vpc,
            instanceType: ec2.InstanceType.of(
                ec2.InstanceClass[INSTANCE_CLASS],
                ec2.InstanceSize[INSTANCE_SIZE]
            ),
            machineImage,
            role,
            securityGroup: sg,
            blockDevices,
            userData,
        });

        new cdk.CfnOutput(this, 'BitcoinNodePrivateIP', {
            value: instance.instancePrivateIp,
            description: 'Private IP of the Bitcoin Node',
        });

        new cdk.CfnOutput(this, 'BitcoinNodeInstanceId', {
            value: instance.instanceId,
            description: 'Instance ID of the Bitcoin Node (used for SSM)',
        });

        // CloudWatch Dashboard
        const dashboard = new cloudwatch.Dashboard(this, 'BitcoinNodeDashboard', { dashboardName: 'BitcoinNodeMetrics' });
        const cpuWidget = new cloudwatch.GraphWidget({ title: 'CPU Usage', left: [new cloudwatch.Metric({ namespace: 'AWS/EC2', metricName: 'CPUUtilization', dimensionsMap: { InstanceId: instance.instanceId }, statistic: 'Average', period: cdk.Duration.minutes(5) })] });
        const diskUsageWidget = new cloudwatch.GraphWidget({ title: 'Disk Usage (%)', left: [new cloudwatch.Metric({ namespace: 'CWAgent', metricName: 'disk_used_percent', dimensionsMap: { host: instance.instancePrivateDnsName, device: 'nvme0n1p1', path: '/', fstype: 'xfs' }, statistic: 'Average', period: cdk.Duration.minutes(5) })] });
        const memoryWidget = new cloudwatch.GraphWidget({ title: 'Memory Usage', left: [new cloudwatch.Metric({ namespace: 'CWAgent', metricName: 'mem_used_percent', dimensionsMap: { host: instance.instancePrivateDnsName }, statistic: 'Average', period: cdk.Duration.minutes(5) })] });
        const networkWidget = new cloudwatch.GraphWidget({ title: 'Network Bytes In/Out', left: [new cloudwatch.Metric({ namespace: 'CWAgent', metricName: 'net_bytes_sent', dimensionsMap: { host: instance.instancePrivateDnsName, interface: 'eth0' }, statistic: 'Sum', period: cdk.Duration.minutes(5) }), new cloudwatch.Metric({ namespace: 'CWAgent', metricName: 'net_bytes_recv', dimensionsMap: { host: instance.instancePrivateDnsName, interface: 'eth0' }, statistic: 'Sum', period: cdk.Duration.minutes(5) })] });
        const blockHeightWidget = new cloudwatch.GraphWidget({ title: 'Bitcoin Block Height', left: [new cloudwatch.Metric({ namespace: 'Bitcoin', metricName: 'BlockHeight', statistic: 'Average', period: cdk.Duration.minutes(5) })] });
        dashboard.addWidgets(cpuWidget, diskUsageWidget, memoryWidget, networkWidget, blockHeightWidget);

        // Suppress VPC Flow Log warning
        NagSuppressions.addResourceSuppressions(
            vpc,
            [
                {
                    id: 'AwsSolutions-VPC7',
                    reason: 'Flow logs are not required for this specific setup.',
                },
            ],
        );

        // Suppress Security Group warning about open ingress
        NagSuppressions.addResourceSuppressions(
            sg,
            [
                {
                    id: 'AwsSolutions-EC23',
                    reason: 'Inbound access is needed for Bitcoin P2P communication.',
                },
            ],
        );

        // Suppress EC2 instance monitoring and ASG warnings
        NagSuppressions.addResourceSuppressions(
            instance,
            [
                {
                    id: 'AwsSolutions-EC28',
                    reason: 'Detailed monitoring is not required for this application.',
                },
                {
                    id: 'AwsSolutions-EC29',
                    reason: 'The EC2 instance is standalone and not part of an ASG, as this is a single-node Bitcoin core setup.',
                },
            ],
        );

        NagSuppressions.addResourceSuppressions(
            instance,
            [
                {
                    id: 'AwsSolutions-EC26',
                    reason: 'EBS encryption is not required for this specific application.',
                },
            ],
        );


    }
}

module.exports = { SingleNodeBitcoinCoreStack };
