import * as cdk from "aws-cdk-lib";
import * as cdkContructs from 'constructs';
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as configTypes from "../config/polygonConfig.interface"
import * as nag from "cdk-nag";

export interface PolygonRPCNodeSecurityGroupConstructProps {
    vpc: cdk.aws_ec2.IVpc;
    clientCombination: configTypes.PolygonClientCombination
  }

  export class PolygonNodeSecurityGroupConstruct extends cdkContructs.Construct {
    public securityGroup: cdk.aws_ec2.ISecurityGroup;

    constructor(scope: cdkContructs.Construct, id: string, props: PolygonRPCNodeSecurityGroupConstructProps) {
      super(scope, id);

      const { 
        vpc,
        clientCombination,
      } = props;
  
      const sg = new ec2.SecurityGroup(this, `rpc-node-security-group`, {
        vpc,
        description: "Security Group for Blockchain nodes",
        allowAllOutbound: true,
      });

      // Public ports
      sg.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(30303), "P2P");
      sg.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.udp(30303), "P2P");
      sg.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.udp(30301), "P2P Discovery");

      // Private ports restricted only to the VPC IP range
      sg.addIngressRule(ec2.Peer.ipv4(vpc.vpcCidrBlock), ec2.Port.tcp(26656), "HEIMDDALL Client API");
      sg.addIngressRule(ec2.Peer.ipv4(vpc.vpcCidrBlock), ec2.Port.tcp(26657), "HEIMDDALL Client API");

      sg.addIngressRule(ec2.Peer.ipv4(vpc.vpcCidrBlock), ec2.Port.tcp(8545), "Bor Client RPC");
      sg.addIngressRule(ec2.Peer.ipv4(vpc.vpcCidrBlock), ec2.Port.tcp(8546), "Bor Client RPC (WebSocket)");

      this.securityGroup = sg

      /**
         * cdk-nag suppressions
         */

      nag.NagSuppressions.addResourceSuppressions(
        this,
        [
            {
                id: "AwsSolutions-EC23",
                reason: "Polygon RPC Node requires wildcard inbound for specific ports",
            },
        ],
        true
    );
    }
  }