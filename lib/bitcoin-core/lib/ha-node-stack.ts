import * as cdk from "aws-cdk-lib";
import * as cdkConstructs from "constructs";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as iam from "aws-cdk-lib/aws-iam";
import * as fs from "fs";
import * as path from "path";
import { NagSuppressions } from "cdk-nag";
import { BitcoinSecurityGroup } from "./constructs/bitcoin-mainnet-security-group";
import { HANodesConstruct } from "../../constructs/ha-rpc-nodes-with-alb";
import * as configTypes from "./config/bitcoinConfig.interface";

export interface BitcoinHANodesStackProps extends cdk.StackProps, configTypes.BitcoinBaseNodeConfig, configTypes.BitcoinHAConfig {
    instanceRole: iam.IRole;
}

export class HABitcoinCoreNodeStack extends cdk.Stack {
    constructor(scope: cdkConstructs.Construct, id: string, props: BitcoinHANodesStackProps) {
        super(scope, id, props);

        const REGION = cdk.Stack.of(this).region;
        const STACK_NAME = cdk.Stack.of(this).stackName;
        const lifecycleHookName = STACK_NAME;
        const autoScalingGroupName = STACK_NAME;

        const { instanceType, instanceCpuType, dataVolume, numberOfNodes, albHealthCheckGracePeriodMin, heartBeatDelayMin, instanceRole } = props as BitcoinHANodesStackProps & { instanceRole: iam.IRole };

        const vpc = ec2.Vpc.fromLookup(this, "vpc", { isDefault: true });

        const instanceSG = new BitcoinSecurityGroup(this, "bitcoin-sg", vpc);

        const bitcoinSetup = fs.readFileSync(path.join(__dirname, "assets", "bitcoin-setup.sh"), "utf8");
        const storageSetup = fs.readFileSync(path.join(__dirname, "assets", "storage-setup.sh"), "utf8");
        const bitcoinConfPath = path.join(__dirname, "bitcoin.conf");
        const bitcoinConfContent = fs.readFileSync(bitcoinConfPath, "utf8");

        // Calculate the volume size in bytes for the storage setup script
        const dataVolumeSizeBytes = dataVolume.sizeGiB * 1073741824; // GiB to bytes conversion

        const userData = [
            "#!/bin/bash",
            "set -euo pipefail",
            `export AWS_REGION='${REGION}'`,
            `export STACK_NAME='${STACK_NAME}'`,
            `export RESOURCE_ID='none'`,
            `export LIFECYCLE_HOOK_NAME='${lifecycleHookName}'`,
            `export AUTOSCALING_GROUP_NAME='${autoScalingGroupName}'`,
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
        ].join("\n");

        const rpcNodes = new HANodesConstruct(this, "rpc-nodes", {
            instanceType,
            dataVolumes: [dataVolume],
            machineImage: ec2.MachineImage.latestAmazonLinux2({ cpuType: instanceCpuType }),
            role: instanceRole,
            vpc,
            securityGroup: instanceSG.securityGroup,
            userData,
            numberOfNodes,
            rpcPortForALB: 8332,
            albHealthCheckGracePeriodMin,
            heartBeatDelayMin,
            lifecycleHookName,
            autoScalingGroupName,
        });

        new cdk.CfnOutput(this, "LoadBalancerDNS", {
            value: rpcNodes.loadBalancerDnsName,
            description: "DNS name of the Load Balancer",
            exportName: "BitcoinLoadBalancerDNS",
        });

        NagSuppressions.addResourceSuppressions(vpc, [
            {
                id: "AwsSolutions-VPC7",
                reason: "Flow logs are not required for this specific setup.",
            },
        ]);

        NagSuppressions.addResourceSuppressions(instanceSG.securityGroup, [
            {
                id: "AwsSolutions-EC23",
                reason: "Inbound access is required for Bitcoin P2P communication.",
            },
        ]);

        NagSuppressions.addResourceSuppressions(rpcNodes, [
            {
                id: "AwsSolutions-AS3",
                reason: "No notifications needed",
            },
            {
                id: "AwsSolutions-ELB2",
                reason: "Access logging is not required for this application",
            },
            {
                id: "AwsSolutions-EC28",
                reason: "Using basic monitoring to save costs",
            },
        ]);
    }
}
