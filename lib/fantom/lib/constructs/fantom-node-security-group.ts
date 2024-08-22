import * as cdk from "aws-cdk-lib";
import * as cdkConstructs from "constructs";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as nag from "cdk-nag";

export interface FantomNodeSecurityGroupConstructsProps {
    vpc: cdk.aws_ec2.IVpc;
}

export class FantomNodeSecurityGroupConstructs extends cdkConstructs.Construct {
    public securityGroup: cdk.aws_ec2.SecurityGroup;

    constructor(scope: cdkConstructs.Construct, id: string, props: FantomNodeSecurityGroupConstructsProps) {
        super(scope, id);

        const {
            vpc
        } = props;

        const sg = new ec2.SecurityGroup(this, `rpc-node-security-group`, {
            vpc,
            description: "Security Group for Blockchain nodes",
            allowAllOutbound: true
        });

        // public ports
        sg.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(5050), "P2P");
        sg.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.udp(5050), "P2P");

        // private ports
        sg.addIngressRule(ec2.Peer.ipv4(vpc.vpcCidrBlock), ec2.Port.tcp(18545), "FANTOM RPC Port");
        sg.addIngressRule(ec2.Peer.ipv4(vpc.vpcCidrBlock), ec2.Port.tcp(18546), "FANTOM WebSocket Port");

        this.securityGroup = sg;

        // cdk-nag suppressions
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
