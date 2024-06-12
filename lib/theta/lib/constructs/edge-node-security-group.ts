import * as cdk from "aws-cdk-lib";
import * as cdkConstructs from "constructs";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as nag from "cdk-nag";

export interface EdgeNodeSecurityGroupConstructsProps {
    vpc: cdk.aws_ec2.IVpc;
}

export class EdgeNodeSecurityGroupConstructs extends cdkConstructs.Construct {
    public securityGroup: cdk.aws_ec2.SecurityGroup;

    constructor(scope: cdkConstructs.Construct, id: string, props: EdgeNodeSecurityGroupConstructsProps) {
        super(scope, id);

        const {
            vpc
        } = props;

        const sg = new ec2.SecurityGroup(this, `rpc-node-security-group`, {
            vpc,
            description: "Security Group for Blockchain nodes",
            allowAllOutbound: true
        });


        // private ports
        sg.addIngressRule(ec2.Peer.ipv4(vpc.vpcCidrBlock), ec2.Port.tcp(15888), "Theta Edge Node RPC Port");
        sg.addIngressRule(ec2.Peer.ipv4(vpc.vpcCidrBlock), ec2.Port.tcp(17888), "Theta Edge Core RPC Port");
        sg.addIngressRule(ec2.Peer.ipv4(vpc.vpcCidrBlock), ec2.Port.tcp(17935), "Theta Edge Encoder RPC Port");


        this.securityGroup = sg;

    }
}
