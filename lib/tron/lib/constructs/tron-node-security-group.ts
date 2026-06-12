import * as cdk from "aws-cdk-lib";
import * as cdkConstructs from "constructs";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as nag from "cdk-nag";

export interface TronNodeSecurityGroupConstructsProps {
    vpc: cdk.aws_ec2.IVpc;
}

export class TronNodeSecurityGroupConstructs extends cdkConstructs.Construct {
    public securityGroup: cdk.aws_ec2.SecurityGroup;

    constructor(scope: cdkConstructs.Construct, id: string, props: TronNodeSecurityGroupConstructsProps) {
        super(scope, id);

        const {
            vpc
        } = props;

        const sg = new ec2.SecurityGroup(this, `rpc-node-security-group`, {
            vpc,
            description: "Security Group for TRON (java-tron) nodes",
            allowAllOutbound: true
        });

        // Public ports - required for P2P participation in the TRON network.
        // java-tron node.listen.port = 18888 (uses both TCP for peer connections and UDP for node discovery).
        sg.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(18888), "TRON P2P (TCP)");
        sg.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.udp(18888), "TRON P2P node discovery (UDP)");

        // Private ports - RPC APIs are only reachable from within the VPC, never the Internet.
        sg.addIngressRule(ec2.Peer.ipv4(vpc.vpcCidrBlock), ec2.Port.tcp(8090), "TRON HTTP FullNode API");
        sg.addIngressRule(ec2.Peer.ipv4(vpc.vpcCidrBlock), ec2.Port.tcp(50051), "TRON gRPC API");

        this.securityGroup = sg;

        // cdk-nag suppressions
        nag.NagSuppressions.addResourceSuppressions(
            this,
            [
                {
                    id: "AwsSolutions-EC23",
                    reason: "TRON P2P port 18888 (TCP/UDP) must be open to the public Internet for the node to discover peers and sync with the network"
                }
            ],
            true
        );
    }
}
