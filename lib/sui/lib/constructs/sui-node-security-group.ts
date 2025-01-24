import * as cdk from "aws-cdk-lib";
import * as cdkConstructs from 'constructs';
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as nag from "cdk-nag";

export interface SuiNodeSecurityGroupConstructProps {
    vpc: cdk.aws_ec2.IVpc;
  }

export class SuiNodeSecurityGroupConstruct extends cdkConstructs.Construct {
  public securityGroup: cdk.aws_ec2.ISecurityGroup;

  constructor(scope: cdkConstructs.Construct, id: string, props: SuiNodeSecurityGroupConstructProps) {
    super(scope, id);

    const {
      vpc,
    } = props;

    const sg = new ec2.SecurityGroup(this, `rpc-node-security-group`, {
      vpc,
      description: "Security Group for Blockchain nodes",
      allowAllOutbound: true,
    });

    // Private port
    sg.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.udp(8084), "Sui P2P");
    sg.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(9184), "Sui Metrics");
    sg.addIngressRule(ec2.Peer.ipv4(vpc.vpcCidrBlock), ec2.Port.tcp(9000), "JSON-RPC");

    this.securityGroup = sg

    /**
     * cdk-nag suppressions
     */
    nag.NagSuppressions.addResourceSuppressions(
      this,
      [
        {
          id: "AwsSolutions-EC23",
          reason: "Sui requires wildcard inbound for specific ports",
        },
      ],
      true
    );

  }
}
