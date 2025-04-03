const cdk = require('aws-cdk-lib');
const ec2 = require('aws-cdk-lib/aws-ec2');
const iam = require('aws-cdk-lib/aws-iam');
const cloudwatch = require('aws-cdk-lib/aws-cloudwatch');
const path = require('path');
const fs = require('fs');
const { AwsSolutionsChecks, NagSuppressions } = require('cdk-nag');
const { Aspects } = require('aws-cdk-lib');
require('dotenv').config();

//Parse env variables
const {
    INSTANCE_CLASS,
    INSTANCE_SIZE,
    EBS_VOLUME_SIZE,
    EBS_VOLUME_TYPE,
} = process.env;

class SingleNodeBitcoinCoreStack extends cdk.Stack {
    constructor(scope, id, props) {
        super(scope, id, props);

        // Retrieve region
        const region = cdk.Stack.of(this).region;

        // Create VPC
        const vpc = new ec2.Vpc(this, 'BitcoinSingleNodeVPC', { maxAzs: 1 });

        // Security Group
        const sg = new ec2.SecurityGroup(this, 'BitcoinSingleNodeSG', {
            vpc,
            allowAllOutbound: true,
        });
        sg.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(8333), 'Bitcoin P2P');
        sg.addIngressRule(ec2.Peer.ipv4(vpc.vpcCidrBlock), ec2.Port.tcp(8332), 'Bitcoin RPC from VPC');

        // IAM Role for EC2 with CloudWatch permissions
        const role = new iam.Role(this, 'BitcoinSingleNodeRole', {
            assumedBy: new iam.ServicePrincipal('ec2.amazonaws.com'),
            managedPolicies: [
                iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonSSMManagedInstanceCore'),
                iam.ManagedPolicy.fromAwsManagedPolicyName('CloudWatchAgentServerPolicy'),
            ],
        });

        // Load bitcoin.conf file
        const bitcoinConfPath = path.join(__dirname, 'bitcoin.conf');
        const bitcoinConfContent = fs.readFileSync(bitcoinConfPath, 'utf8');

        // User data for EC2 instance
        const userData = ec2.UserData.forLinux();
        userData.addCommands(
            'yum update -y',
            'amazon-linux-extras install docker -y',
            'service docker start',
            'mkdir -p /home/bitcoin/.bitcoin',
            `echo '${bitcoinConfContent}' > /home/bitcoin/.bitcoin/bitcoin.conf`,
            'docker run -d --name bitcoind -v /home/bitcoin/.bitcoin:/root/.bitcoin -p 8333:8333 -p 8332:8332 bitcoin/bitcoin:latest bash -c "chown -R bitcoin:bitcoin /root/.bitcoin && bitcoind"',
            'yum install -y amazon-cloudwatch-agent',
            'mkdir -p /opt/aws/amazon-cloudwatch-agent/etc',
            'cat <<EOF > /opt/aws/amazon-cloudwatch-agent/etc/amazon-cloudwatch-agent.json',
            '{ "metrics": { "metrics_collected": { "disk": { "measurement": ["used_percent", "inodes_free"], "resources": ["*"], "ignore_file_system_types": ["sysfs", "devtmpfs"] }, "mem": { "measurement": ["mem_used_percent"] }, "cpu": { "measurement": ["cpu_usage_idle", "cpu_usage_user", "cpu_usage_system"] }, "net": { "measurement": ["net_bytes_sent", "net_bytes_recv"], "resources": ["eth0"] } } } }',
            'EOF',
            '/opt/aws/amazon-cloudwatch-agent/bin/amazon-cloudwatch-agent-ctl -a fetch-config -m ec2 -c file:/opt/aws/amazon-cloudwatch-agent/etc/amazon-cloudwatch-agent.json -s',
            `(sudo crontab -l ; echo "*/5 * * * * sudo /usr/bin/docker exec bitcoind bitcoin-cli getblockcount | xargs -I {} sudo /usr/bin/aws cloudwatch put-metric-data --metric-name BlockHeight --namespace Bitcoin --unit Count --value {} --region ${region}") | crontab -`
        );

        // EC2 Instance
        const instance = new ec2.Instance(this, 'BitcoinSingleNode', {
            vpc,
            instanceType: ec2.InstanceType.of(
                ec2.InstanceClass[INSTANCE_CLASS],
                ec2.InstanceSize[INSTANCE_SIZE]
            ),
            machineImage: ec2.MachineImage.latestAmazonLinux2(),
            role,
            securityGroup: sg,
            blockDevices: [{
                deviceName: '/dev/xvda',
                volume: ec2.BlockDeviceVolume.ebs(Number(EBS_VOLUME_SIZE), {
                    volumeType: ec2.EbsDeviceVolumeType[EBS_VOLUME_TYPE],
                    encrypted: true,
                }),
            }],
            userData,
        });

        // CloudWatch Dashboard
        const dashboard = new cloudwatch.Dashboard(this, 'BitcoinNodeDashboard', { dashboardName: 'BitcoinNodeMetrics' });
        const cpuWidget = new cloudwatch.GraphWidget({ title: 'CPU Usage', left: [new cloudwatch.Metric({ namespace: 'AWS/EC2', metricName: 'CPUUtilization', dimensionsMap: { InstanceId: instance.instanceId }, statistic: 'Average', period: cdk.Duration.minutes(5) })] });
        const diskUsageWidget = new cloudwatch.GraphWidget({ title: 'Disk Usage (%)', left: [new cloudwatch.Metric({ namespace: 'CWAgent', metricName: 'disk_used_percent', dimensionsMap: { host: instance.instancePrivateDnsName, device: 'nvme0n1p1', path: '/', fstype: 'xfs' }, statistic: 'Average', period: cdk.Duration.minutes(5) })] });
        const memoryWidget = new cloudwatch.GraphWidget({ title: 'Memory Usage', left: [new cloudwatch.Metric({ namespace: 'CWAgent', metricName: 'mem_used_percent', dimensionsMap: { host: instance.instancePrivateDnsName }, statistic: 'Average', period: cdk.Duration.minutes(5) })] });
        const networkWidget = new cloudwatch.GraphWidget({ title: 'Network Bytes In/Out', left: [new cloudwatch.Metric({ namespace: 'CWAgent', metricName: 'net_bytes_sent', dimensionsMap: { host: instance.instancePrivateDnsName, interface: 'eth0' }, statistic: 'Sum', period: cdk.Duration.minutes(5) }), new cloudwatch.Metric({ namespace: 'CWAgent', metricName: 'net_bytes_recv', dimensionsMap: { host: instance.instancePrivateDnsName, interface: 'eth0' }, statistic: 'Sum', period: cdk.Duration.minutes(5) })] });
        const blockHeightWidget = new cloudwatch.GraphWidget({ title: 'Bitcoin Block Height', left: [new cloudwatch.Metric({ namespace: 'Bitcoin', metricName: 'BlockHeight', statistic: 'Average', period: cdk.Duration.minutes(5) })] });
        dashboard.addWidgets(cpuWidget, diskUsageWidget, memoryWidget, networkWidget, blockHeightWidget);

        // CDK Nag Checks and Suppressions
        Aspects.of(this).add(new AwsSolutionsChecks());

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

        // Suppress IAM policy warnings about managed policies
        NagSuppressions.addResourceSuppressions(
            role,
            [
                {
                    id: 'AwsSolutions-IAM4',
                    reason: 'Using AWS managed policies for simplicity and maintenance.',
                },
                {
                    id: 'AwsSolutions-IAM5',
                    reason: 'Policies have been scoped down to the necessary permissions.',
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

    }
}

module.exports = { SingleNodeBitcoinCoreStack };
