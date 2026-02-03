import * as cdk from "aws-cdk-lib";
import * as cdkContructs from 'constructs';
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as nag from "cdk-nag";

export interface BitcoinNodeSecurityGroupConstructProps {
    vpc: cdk.aws_ec2.IVpc;
}

export class BitcoinNodeSecurityGroupConstruct extends cdkContructs.Construct {
    public securityGroup: cdk.aws_ec2.ISecurityGroup;

    constructor(scope: cdkContructs.Construct, id: string, props: BitcoinNodeSecurityGroupConstructProps) {
        super(scope, id);

        const { vpc } = props;

        const sg = new ec2.SecurityGroup(this, `bitcoin-node-security-group`, {
            vpc,
            description: "Security Group for Bitcoin nodes",
            allowAllOutbound: true,
        });

        // P2P port - public for network participation
        sg.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(8333), "Bitcoin mainnet P2P");
        sg.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(18333), "Bitcoin testnet P2P");
        sg.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(38333), "Bitcoin signet P2P");
        sg.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(18444), "Bitcoin regtest P2P");

        // RPC port - restricted to VPC only for security
        sg.addIngressRule(ec2.Peer.ipv4(vpc.vpcCidrBlock), ec2.Port.tcp(8332), "Bitcoin mainnet RPC (VPC only)");
        sg.addIngressRule(ec2.Peer.ipv4(vpc.vpcCidrBlock), ec2.Port.tcp(18332), "Bitcoin testnet RPC (VPC only)");
        sg.addIngressRule(ec2.Peer.ipv4(vpc.vpcCidrBlock), ec2.Port.tcp(38332), "Bitcoin signet RPC (VPC only)");
        sg.addIngressRule(ec2.Peer.ipv4(vpc.vpcCidrBlock), ec2.Port.tcp(18443), "Bitcoin regtest RPC (VPC only)");

        // ZMQ ports - restricted to VPC only
        sg.addIngressRule(ec2.Peer.ipv4(vpc.vpcCidrBlock), ec2.Port.tcp(28332), "Bitcoin ZMQ block (VPC only)");
        sg.addIngressRule(ec2.Peer.ipv4(vpc.vpcCidrBlock), ec2.Port.tcp(28333), "Bitcoin ZMQ tx (VPC only)");

        this.securityGroup = sg;

        nag.NagSuppressions.addResourceSuppressions(
            this,
            [
                {
                    id: "AwsSolutions-EC23",
                    reason: "Need to use wildcard for P2P ports to participate in Bitcoin network",
                },
            ],
            true
        );
    }
}
