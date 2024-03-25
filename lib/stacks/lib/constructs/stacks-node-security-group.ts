import * as cdk from "aws-cdk-lib";
import * as cdkContructs from 'constructs';
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as nag from "cdk-nag";

export interface StacksNodeSecurityGroupConstructProps {
  vpc: cdk.aws_ec2.IVpc;
  stacksRpcPort: number;
  stacksP2pPort: number;
}

export class StacksNodeSecurityGroupConstruct extends cdkContructs.Construct {
  public securityGroup: cdk.aws_ec2.ISecurityGroup;

  constructor(scope: cdkContructs.Construct, id: string, props: StacksNodeSecurityGroupConstructProps) {
    super(scope, id);

    const {
      vpc,
      stacksRpcPort,
      stacksP2pPort,
    } = props;

    const sg = new ec2.SecurityGroup(this, `rpc-node-security-group`, {
      vpc,
      description: "Security Group for Blockchain nodes",
      allowAllOutbound: true,
    });

    // Public ports
    sg.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(stacksP2pPort), "P2P");
    sg.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.udp(stacksP2pPort), "P2P");

    // Private ports restricted only to the VPC IP range
    sg.addIngressRule(ec2.Peer.ipv4(vpc.vpcCidrBlock), ec2.Port.tcp(stacksRpcPort), "RPC port HTTP (user access needs to be restricted. Allowed access only from internal IPs)");
    this.securityGroup = sg

    /**
     * cdk-nag suppressions
     */
    nag.NagSuppressions.addResourceSuppressions(
      this,
      [
          {
              id: "AwsSolutions-EC23",
              reason: "Need to use wildcard for P2P ports",
          },
      ],
      true
    );
  }
}
