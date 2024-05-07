import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as config from "../lib/config/indyConfig";
import * as nag from "cdk-nag";

import { IndyStewardNodeInstance } from "./constructs/indy-steward-node-instance";
import { IndyTrusteeNodeInstance } from "./constructs/indy-trustee-node-instance";

export class IndyNodeStack extends cdk.Stack {
    constructor(scope: Construct, id: string, props?: cdk.StackProps) {
        super(scope, id, props);

        const serverAccessLogBucket = new s3.Bucket(this, "serverAccessLogBucket", {
            encryption: s3.BucketEncryption.S3_MANAGED,
            blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
            removalPolicy: cdk.RemovalPolicy.RETAIN,
            versioned: true,
            enforceSSL: true,
            autoDeleteObjects: false,
        })

        const vpc = new ec2.Vpc(this, "IndyVpc", {
            ipAddresses: ec2.IpAddresses.cidr(config.vpcAddresses),
            flowLogs: {
                s3: {
                    destination: ec2.FlowLogDestination.toS3(
                        new s3.Bucket(this, "VpcFlowLogBucket", {
                            encryption: s3.BucketEncryption.S3_MANAGED,
                            blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
                            removalPolicy: cdk.RemovalPolicy.RETAIN,
                            versioned: true,
                            enforceSSL: true,
                            autoDeleteObjects: false,
                            serverAccessLogsBucket: serverAccessLogBucket,
                            serverAccessLogsPrefix: "vpcFlowLogs",
                        }),
                        "vpcFlowLogs"
                    ),
                    trafficType: ec2.FlowLogTrafficType.ALL,
                }
            }
        });

        // SecurityGroup of Nodes for Clients
        const clientSG = new ec2.SecurityGroup(this, 'ClientSG', {
            vpc,
            allowAllOutbound: true,
            disableInlineRules: true,
        });
        clientSG.addIngressRule(
            ec2.Peer.securityGroupId(clientSG.securityGroupId),
            ec2.Port.tcp(9702),
            'Allow 9702 from internal for client'
        )

        // SecurityGroup of Nodes for Other Nodes
        const nodeSG = new ec2.SecurityGroup(this, 'NodeSG', {
            vpc,
            allowAllOutbound: true,
            disableInlineRules: true,
        });
        nodeSG.addIngressRule(
            ec2.Peer.securityGroupId(nodeSG.securityGroupId),
            ec2.Port.tcp(9701),
            'Allow 9701 from internal for indy node'
        );

        const ansibleBucket = new s3.Bucket(this, "AnsibleFileTransferBucket", {
            bucketName: `${cdk.Stack.of(this).account}-ansible-file-transfer-bucket`,
            encryption: s3.BucketEncryption.S3_MANAGED,
            blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
            versioned: false,
            enforceSSL: true,
            autoDeleteObjects: true,
            removalPolicy: cdk.RemovalPolicy.DESTROY,
            serverAccessLogsBucket: serverAccessLogBucket,
            serverAccessLogsPrefix: "AnsibleFileTransferBucket",
        });

        const steward1 = new IndyStewardNodeInstance(this, "steward1", { 
            vpc, 
            clientSG, 
            nodeSG, 
            ansibleBucket,
            instanceType: config.stewardNodeConfig.instanceType,
            instanceCpuType: config.stewardNodeConfig.instanceCpuType,
            dataVolumes: config.stewardNodeConfig.dataVolumes,
        });
        const steward2 = new IndyStewardNodeInstance(this, "steward2", { 
            vpc, 
            clientSG, 
            nodeSG, 
            ansibleBucket,
            instanceType: config.stewardNodeConfig.instanceType,
            instanceCpuType: config.stewardNodeConfig.instanceCpuType,
            dataVolumes: config.stewardNodeConfig.dataVolumes
        });
        const steward3 = new IndyStewardNodeInstance(this, "steward3", { 
            vpc, 
            clientSG, 
            nodeSG, 
            ansibleBucket,
            instanceType: config.stewardNodeConfig.instanceType,
            instanceCpuType: config.stewardNodeConfig.instanceCpuType,
            dataVolumes: config.stewardNodeConfig.dataVolumes
        });
        const steward4 = new IndyStewardNodeInstance(this, "steward4", { 
            vpc, 
            clientSG, 
            nodeSG, 
            ansibleBucket,
            instanceType: config.stewardNodeConfig.instanceType,
            instanceCpuType: config.stewardNodeConfig.instanceCpuType,
            dataVolumes: config.stewardNodeConfig.dataVolumes
        });

        const trustee1 = new IndyTrusteeNodeInstance(this, "trustee1", { 
            vpc, 
            nodeSG,
            instanceType: config.trusteeNodeConfig.instanceType,
            instanceCpuType: config.trusteeNodeConfig.instanceCpuType,
            dataVolumes: config.trusteeNodeConfig.dataVolumes
        });
        const trustee2 = new IndyTrusteeNodeInstance(this, "trustee2", { 
            vpc, 
            nodeSG,
            instanceType: config.trusteeNodeConfig.instanceType,
            instanceCpuType: config.trusteeNodeConfig.instanceCpuType,
            dataVolumes: config.trusteeNodeConfig.dataVolumes
        });
        const trustee3 = new IndyTrusteeNodeInstance(this, "trustee3", { 
            vpc,
            nodeSG,
            instanceType: config.trusteeNodeConfig.instanceType,
            instanceCpuType: config.trusteeNodeConfig.instanceCpuType,
            dataVolumes: config.trusteeNodeConfig.dataVolumes
        });

        new cdk.CfnOutput(this, "AnsibleFileTransferBucketName", {
            value: ansibleBucket.bucketName,
            exportName: "AnsibleFileTransferBucketName",
        });

        new cdk.CfnOutput(this, "DeploymentRegion", {
            value: cdk.Stack.of(this).region,
            exportName: "DeploymentRegion",
        });

        new cdk.CfnOutput(this, "steward1Output", {
            value: steward1.instance.instanceId,
            exportName: "steward1",
        });

        new cdk.CfnOutput(this, "steward2Output", {
            value: steward2.instance.instanceId,
            exportName: "steward2",
        });

        new cdk.CfnOutput(this, "steward3Output", {
            value: steward3.instance.instanceId,
            exportName: "steward3",
        });

        new cdk.CfnOutput(this, "steward4Output", {
            value: steward4.instance.instanceId,
            exportName: "steward4",
        });

        new cdk.CfnOutput(this, "trustee1Output", {
            value: trustee1.instance.instanceId,
            exportName: "trustee1",
        });

        new cdk.CfnOutput(this, "trustee2Output", {
            value: trustee2.instance.instanceId,
            exportName: "trustee2",
        });

        new cdk.CfnOutput(this, "trustee3Output", {
            value: trustee3.instance.instanceId,
            exportName: "trustee3",
        });

        nag.NagSuppressions.addResourceSuppressions(
            this,
            [
                {
                    id: "AwsSolutions-S1",
                    reason: "An access log bucket does not require an access log bucket."
                }
            ],
            true
        );
    }
}
