import * as cdk from "aws-cdk-lib";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as nag from "cdk-nag";
import * as cdkContructs from "constructs";
import { VetNodeType } from "../config/node-config.interface";

export interface VETNodeSecurityGroupConstructProps {
    vpc: cdk.aws_ec2.IVpc;
    vetNodeType: VetNodeType;
}

export class VETNodeSecurityGroupConstruct extends cdkContructs.Construct {
    public securityGroup: cdk.aws_ec2.ISecurityGroup;

    constructor(scope: cdkContructs.Construct, id: string, props: VETNodeSecurityGroupConstructProps) {
        super(scope, id);

        const {
            vpc,
            vetNodeType
        } = props;

        const sg = new ec2.SecurityGroup(this, `node-security-group`, {
            vpc,
            description: "Security Group for Blockchain nodes",
            allowAllOutbound: true
        });

        sg.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(11235), "TCP P2P protocols");
        sg.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.udp(11235), "UDP P2P protocols");
        sg.addIngressRule(ec2.Peer.ipv4(vpc.vpcCidrBlock), ec2.Port.tcp(2113), "Admin API (Internal access only)");

        // Public nodes need to expose the HTTP Rest API
        if (vetNodeType === "public") {
            sg.addIngressRule(ec2.Peer.ipv4(vpc.vpcCidrBlock), ec2.Port.tcp(80), "HTTP Rest API (Internal access only");
        }

        this.securityGroup = sg;

        nag.NagSuppressions.addResourceSuppressions(
            this,
            [
                {
                    id: "AwsSolutions-EC23",
                    reason: "Need to use wildcard for P2P ports"
                }
            ],
            true
        );
    }
}
