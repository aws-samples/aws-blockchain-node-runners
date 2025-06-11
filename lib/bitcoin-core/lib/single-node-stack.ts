import * as cdk from "aws-cdk-lib";
import * as cdkConstructs from "constructs";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as iam from "aws-cdk-lib/aws-iam";
import * as cloudwatch from "aws-cdk-lib/aws-cloudwatch";
import * as fs from "fs";
import * as path from "path";
import { NagSuppressions } from "cdk-nag";
import { BitcoinSecurityGroup } from "./constructs/bitcoin-mainnet-security-group";
import { SingleNodeConstruct } from "../../constructs/single-node";
import * as configTypes from "./config/bitcoinConfig.interface";

export interface BitcoinSingleNodeStackProps extends cdk.StackProps, configTypes.BitcoinBaseNodeConfig {
    instanceRole: iam.IRole;
}

export class SingleNodeBitcoinCoreStack extends cdk.Stack {
    constructor(scope: cdkConstructs.Construct, id: string, props: BitcoinSingleNodeStackProps) {
        super(scope, id, props);

        const REGION = cdk.Stack.of(this).region;
        const STACK_NAME = cdk.Stack.of(this).stackName;
        const availabilityZones = cdk.Stack.of(this).availabilityZones;
        const chosenAvailabilityZone = availabilityZones.slice(0, 1)[0];

        const { instanceType, instanceCpuType, dataVolume, instanceRole } = props as BitcoinSingleNodeStackProps & { instanceRole: iam.IRole };

        const vpc = ec2.Vpc.fromLookup(this, "vpc", { isDefault: true });

        const sgConstruct = new BitcoinSecurityGroup(this, "bitcoin-sg", vpc);
        const sg = sgConstruct.securityGroup;

        const node = new SingleNodeConstruct(this, "bitcoin-node", {
            instanceName: STACK_NAME,
            instanceType,
            dataVolumes: [dataVolume],
            machineImage: ec2.MachineImage.latestAmazonLinux2({ cpuType: instanceCpuType }),
            vpc,
            availabilityZone: chosenAvailabilityZone,
            role: instanceRole,
            securityGroup: sg,
            vpcSubnets: {
                subnetType: ec2.SubnetType.PUBLIC,
            },
        });

        const bitcoinSetup = fs.readFileSync(path.join(__dirname, "assets", "bitcoin-setup.sh"), "utf8");
        const storageSetup = fs.readFileSync(path.join(__dirname, "assets", "storage-setup.sh"), "utf8");
        const cloudwatchSetup = fs.readFileSync(path.join(__dirname, "assets", "cloudwatch-setup.sh"), "utf8");
        const blockheightCron = fs.readFileSync(path.join(__dirname, "assets", "blockheight-cron.sh"), "utf8");
        const bitcoinConfPath = path.join(__dirname, "bitcoin.conf");
        const bitcoinConfContent = fs.readFileSync(bitcoinConfPath, "utf8");

        // Calculate the volume size in bytes for the storage setup script
        const dataVolumeSizeBytes = dataVolume.sizeGiB * 1073741824; // GiB to bytes conversion

        const userData = [
            "#!/bin/bash",
            "set -euo pipefail",
            `export AWS_REGION='${REGION}'`,
            `export STACK_NAME='${STACK_NAME}'`,
            `export RESOURCE_ID='${node.nodeCFLogicalId}'`,
            `export BITCOIN_CONF='${bitcoinConfContent}'`,
            "cat <<'EOF' > /opt/storage-setup.sh",
            storageSetup,
            "EOF",
            "chmod +x /opt/storage-setup.sh",
            // Create the bitcoin home directory first
            "mkdir -p /home/bitcoin",
            // Run the storage setup script with the volume size in bytes
            `/opt/storage-setup.sh /home/bitcoin ext4 ${dataVolumeSizeBytes}`,
            bitcoinSetup,
            cloudwatchSetup,
            blockheightCron,
        ].join("\n");

        node.instance.addUserData(userData);

        new cdk.CfnOutput(this, "BitcoinNodePrivateIP", {
            value: node.instance.instancePrivateIp,
            description: "Private IP of the Bitcoin Node",
        });

        new cdk.CfnOutput(this, "BitcoinNodeInstanceId", {
            value: node.instance.instanceId,
            description: "Instance ID of the Bitcoin Node (used for SSM)",
        });

        const dashboard = new cloudwatch.Dashboard(this, "BitcoinNodeDashboard", {
            dashboardName: "BitcoinNodeMetrics",
        });
        const cpuWidget = new cloudwatch.GraphWidget({
            title: "CPU Usage",
            left: [
                new cloudwatch.Metric({
                    namespace: "AWS/EC2",
                    metricName: "CPUUtilization",
                    dimensionsMap: { InstanceId: node.instance.instanceId },
                    statistic: "Average",
                    period: cdk.Duration.minutes(5),
                }),
            ],
        });
        const diskUsageWidget = new cloudwatch.GraphWidget({
            title: "Disk Usage (%)",
            left: [
                new cloudwatch.Metric({
                    namespace: "CWAgent",
                    metricName: "disk_used_percent",
                    dimensionsMap: {
                        host: node.instance.instancePrivateDnsName,
                        device: "nvme0n1p1",
                        path: "/",
                        fstype: "xfs",
                    },
                    statistic: "Average",
                    period: cdk.Duration.minutes(5),
                }),
            ],
        });
        const memoryWidget = new cloudwatch.GraphWidget({
            title: "Memory Usage",
            left: [
                new cloudwatch.Metric({
                    namespace: "CWAgent",
                    metricName: "mem_used_percent",
                    dimensionsMap: { host: node.instance.instancePrivateDnsName },
                    statistic: "Average",
                    period: cdk.Duration.minutes(5),
                }),
            ],
        });
        const networkWidget = new cloudwatch.GraphWidget({
            title: "Network Bytes In/Out",
            left: [
                new cloudwatch.Metric({
                    namespace: "CWAgent",
                    metricName: "net_bytes_sent",
                    dimensionsMap: { host: node.instance.instancePrivateDnsName, interface: "eth0" },
                    statistic: "Sum",
                    period: cdk.Duration.minutes(5),
                }),
                new cloudwatch.Metric({
                    namespace: "CWAgent",
                    metricName: "net_bytes_recv",
                    dimensionsMap: { host: node.instance.instancePrivateDnsName, interface: "eth0" },
                    statistic: "Sum",
                    period: cdk.Duration.minutes(5),
                }),
            ],
        });
        const blockHeightWidget = new cloudwatch.GraphWidget({
            title: "Bitcoin Block Height",
            left: [
                new cloudwatch.Metric({
                    namespace: "Bitcoin",
                    metricName: "BlockHeight",
                    statistic: "Average",
                    period: cdk.Duration.minutes(5),
                }),
            ],
        });
        dashboard.addWidgets(cpuWidget, diskUsageWidget, memoryWidget, networkWidget, blockHeightWidget);

        NagSuppressions.addResourceSuppressions(vpc, [
            {
                id: "AwsSolutions-VPC7",
                reason: "Flow logs are not required for this specific setup.",
            },
        ]);

        NagSuppressions.addResourceSuppressions(sg, [
            {
                id: "AwsSolutions-EC23",
                reason: "Inbound access is needed for Bitcoin P2P communication.",
            },
        ]);

        NagSuppressions.addResourceSuppressions(node, [
            {
                id: "AwsSolutions-EC28",
                reason: "Detailed monitoring is not required for this application.",
            },
            {
                id: "AwsSolutions-EC29",
                reason: "The EC2 instance is standalone and not part of an ASG.",
            },
        ]);
    }
}
