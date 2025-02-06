import * as cdk from "aws-cdk-lib";
import * as cdkContructs from "constructs";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as nag from "cdk-nag";

export interface XRPNodeSecurityGroupConstructProps {
    vpc: cdk.aws_ec2.IVpc;
}

export class XRPNodeSecurityGroupConstruct extends cdkContructs.Construct {
    public securityGroup: cdk.aws_ec2.ISecurityGroup;

    constructor(scope: cdkContructs.Construct, id: string, props: XRPNodeSecurityGroupConstructProps) {
        super(scope, id);

        const {
            vpc
        } = props;

        const sg = new ec2.SecurityGroup(this, `rpc-node-security-group`, {
            vpc,
            description: "Security Group for Blockchain nodes",
            allowAllOutbound: true
        });

        // Public ports
        sg.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.tcpRange(51235, 51235), "P2P protocols");
        sg.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.tcpRange(2459, 2459), "P2P protocols");


        // Private ports restricted only to the VPC IP range
        sg.addIngressRule(ec2.Peer.ipv4(vpc.vpcCidrBlock), ec2.Port.tcp(6005), "RPC port HTTP (user access needs to be restricted. Allowed access only from internal IPs)");

        this.securityGroup = sg;

        /**
         * cdk-nag suppressions
         */

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