import * as cdk from "aws-cdk-lib";
import * as cdkConstructs from "constructs";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as nag from "cdk-nag";

export interface TzNodeSecurityGroupConstructsProps {
    vpc: cdk.aws_ec2.IVpc;
}

export class TzNodeSecurityGroupConstructs extends cdkConstructs.Construct {
    public securityGroup: cdk.aws_ec2.SecurityGroup;

    constructor(scope: cdkConstructs.Construct, id: string, props: TzNodeSecurityGroupConstructsProps) {
        super(scope, id);

        const {
            vpc
        } = props;

        const sg = new ec2.SecurityGroup(this, `rpc-node-security-group`, {
            vpc,
            description: "Security Group for Blockchain nodes",
            allowAllOutbound: true
        });


        // ports
        sg.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(9732), "Peer connection port");
        sg.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.udp(9732), "Peer connection port");
        sg.addIngressRule(ec2.Peer.ipv4(vpc.vpcCidrBlock), ec2.Port.tcp(8732), "RPC Port");
        sg.addIngressRule(ec2.Peer.ipv4(vpc.vpcCidrBlock), ec2.Port.udp(8732), "RPC Port");

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
