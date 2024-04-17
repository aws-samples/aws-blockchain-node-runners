import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as s3 from "aws-cdk-lib/aws-s3";

import { IndyStewardNodeInstance } from "./constructs/indy-steward-node-instance";
import { IndyTrusteeNodeInstance } from "./constructs/indy-trustee-node-instance";

export class IndyNodeStack extends cdk.Stack {
    constructor(scope: Construct, id: string, props?: cdk.StackProps) {
        super(scope, id, props);

        const vpc = new ec2.Vpc(this, "IndyVpc", {
            ipAddresses: ec2.IpAddresses.cidr("10.0.0.0/16"),
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
        });

        const steward1 = new IndyStewardNodeInstance(this, "steward1", { vpc, clientSG, nodeSG, ansibleBucket });
        const steward2 = new IndyStewardNodeInstance(this, "steward2", { vpc, clientSG, nodeSG, ansibleBucket });
        const steward3 = new IndyStewardNodeInstance(this, "steward3", { vpc, clientSG, nodeSG, ansibleBucket });
        const steward4 = new IndyStewardNodeInstance(this, "steward4", { vpc, clientSG, nodeSG, ansibleBucket });

        const trustee1 = new IndyTrusteeNodeInstance(this, "trustee1", { vpc, nodeSG });
        const trustee2 = new IndyTrusteeNodeInstance(this, "trustee2", { vpc, nodeSG });
        const trustee3 = new IndyTrusteeNodeInstance(this, "trustee3", { vpc, nodeSG });

        new cdk.CfnOutput(this, "AnsibleFileTransferBucketName", {
            value: ansibleBucket.bucketName,
            exportName: "AnsibleFileTransferBucketName",
        });

        new cdk.CfnOutput(this, "DeploymentRegion", {
            value: cdk.Stack.of(this).region,
            exportName: "DeploymentRegion",
        });

        new cdk.CfnOutput(this, "steward1", {
            value: steward1.constructId,
            exportName: "steward1",
        });

        new cdk.CfnOutput(this, "steward2", {
            value: steward2.constructId,
            exportName: "steward2",
        });

        new cdk.CfnOutput(this, "steward3", {
            value: steward3.constructId,
            exportName: "steward3",
        });

        new cdk.CfnOutput(this, "steward4", {
            value: steward4.constructId,
            exportName: "steward4",
        });

        new cdk.CfnOutput(this, "trustee1", {
            value: trustee1.constructId,
            exportName: "trustee1",
        });

        new cdk.CfnOutput(this, "trustee2", {
            value: trustee2.constructId,
            exportName: "trustee2",
        });

        new cdk.CfnOutput(this, "trustee3", {
            value: trustee3.constructId,
            exportName: "trustee3",
        });
    }
}
