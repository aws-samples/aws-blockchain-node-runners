import * as cdk from "aws-cdk-lib";
import * as cdkConstructs from 'constructs';
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as nag from "cdk-nag";

export interface BaseNodeSecurityGroupConstructProps {
    vpc: cdk.aws_ec2.IVpc;
  }

  export class BaseNodeSecurityGroupConstruct extends cdkConstructs.Construct {
    public securityGroup: cdk.aws_ec2.ISecurityGroup;

    constructor(scope: cdkConstructs.Construct, id: string, props: BaseNodeSecurityGroupConstructProps) {
      super(scope, id);

      const {
        vpc,
      } = props;

      const sg = new ec2.SecurityGroup(this, `rpc-node-security-group`, {
        vpc,
        description: "Security Group for Blockchain nodes",
        allowAllOutbound: false,
      });

      // Public ports
      sg.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(9222), "P2P");
      sg.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.udp(9222), "P2P");

      // Private port
      sg.addIngressRule(ec2.Peer.ipv4(vpc.vpcCidrBlock), ec2.Port.tcp(8545), "Base Client RPC");

      sg.addEgressRule(ec2.Peer.anyIpv4(), ec2.Port.tcpRange(0, 12999), "All outbound connections except 13000");
      sg.addEgressRule(ec2.Peer.anyIpv4(), ec2.Port.tcpRange(13001, 65535), "All outbound connections except 13000");
      sg.addEgressRule(ec2.Peer.anyIpv4(), ec2.Port.udpRange(0, 12999), "All outbound connections except 13000");
      sg.addEgressRule(ec2.Peer.anyIpv4(), ec2.Port.udpRange(13001, 65535), "All outbound connections except 13000");

      this.securityGroup = sg

      /**
      * cdk-nag suppressions
      */

      nag.NagSuppressions.addResourceSuppressions(
        this,
        [
            {
                id: "AwsSolutions-EC23",
                reason: "Ethereum requires wildcard inbound for specific ports",
            },
        ],
        true
      );
    }
  }
