import * as cdk from "aws-cdk-lib";
import * as cdkConstructs from 'constructs';
import * as ec2 from "aws-cdk-lib/aws-ec2";

export interface ScrollNodeSecurityGroupConstructProps {
    vpc: cdk.aws_ec2.IVpc;
  }

  export class ScrollNodeSecurityGroupConstruct extends cdkConstructs.Construct {
    public securityGroup: cdk.aws_ec2.ISecurityGroup;

    constructor(scope: cdkConstructs.Construct, id: string, props: ScrollNodeSecurityGroupConstructProps) {
      super(scope, id);

      const {
        vpc,
      } = props;

      const sg = new ec2.SecurityGroup(this, `rpc-node-security-group`, {
        vpc,
        description: "Security Group for Blockchain nodes",
        allowAllOutbound: true,
      });

      // Public ports
      sg.addIngressRule(ec2.Peer.ipv4(vpc.vpcCidrBlock), ec2.Port.tcp(30303), "RPC API");
      sg.addIngressRule(ec2.Peer.ipv4(vpc.vpcCidrBlock), ec2.Port.udp(30303), "RPC API");

      this.securityGroup = sg
    }
  }
