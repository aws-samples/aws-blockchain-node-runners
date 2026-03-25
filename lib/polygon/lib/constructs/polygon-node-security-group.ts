import * as cdk from "aws-cdk-lib";
import * as cdkContructs from 'constructs';
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as nag from "cdk-nag";

export interface PolygonNodeSecurityGroupConstructProps {
    vpc: cdk.aws_ec2.IVpc;
}

export class PolygonNodeSecurityGroupConstruct extends cdkContructs.Construct {
    public securityGroup: cdk.aws_ec2.ISecurityGroup;

    constructor(scope: cdkContructs.Construct, id: string, props: PolygonNodeSecurityGroupConstructProps) {
        super(scope, id);

        const { vpc } = props;

        const sg = new ec2.SecurityGroup(this, `node-security-group`, {
            vpc,
            description: "Security Group for Polygon PoS nodes (Erigon)",
            allowAllOutbound: true,
        });

        // Public P2P ports
        sg.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(30303), "Erigon P2P");
        sg.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.udp(30303), "Erigon P2P");
        sg.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(42069), "Erigon torrent sync");
        sg.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.udp(42069), "Erigon torrent sync");

        // Private RPC restricted to VPC
        sg.addIngressRule(ec2.Peer.ipv4(vpc.vpcCidrBlock), ec2.Port.tcp(8545), "Erigon HTTP RPC");

        this.securityGroup = sg;

        nag.NagSuppressions.addResourceSuppressions(
            this,
            [
                {
                    id: "AwsSolutions-EC23",
                    reason: "Polygon requires wildcard inbound for P2P ports to sync with the network",
                },
            ],
            true
        );
    }
}
