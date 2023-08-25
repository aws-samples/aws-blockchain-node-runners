import * as cdk from "aws-cdk-lib";
import * as cdkContructs from 'constructs';
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as configTypes from "../config/ethConfig.interface"
import * as nag from "cdk-nag";

export interface EthNodeSecurityGroupCondtructProps {
    vpc: cdk.aws_ec2.IVpc;
    clientCombination: configTypes.EthClientCombination
  }

  export class EthNodeSecurityGroupCondtruct extends cdkContructs.Construct {
    public securityGroup: cdk.aws_ec2.ISecurityGroup;

    constructor(scope: cdkContructs.Construct, id: string, props: EthNodeSecurityGroupCondtructProps) {
      super(scope, id);

      const { 
        vpc,
        clientCombination,
      } = props;
  
      const sg = new ec2.SecurityGroup(this, `node-security-group`, {
        vpc,
        description: "Security Group for Blockchain nodes",
        allowAllOutbound: true,
      });

      // Public ports
      sg.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(30303), "P2P");
      sg.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.udp(30303), "P2P");
      sg.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(30304), "P2P");
      sg.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.udp(30304), "P2P");
      sg.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(9000), "CL Client P2P");
      sg.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.udp(9000), "CL Client P2P");
      if (clientCombination.startsWith("erigon")){
        sg.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(42069), "Erigon Snap sync (Bittorrent)");
        sg.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.udp(42069), "Erigon Snap sync (Bittorrent)");
      }

      // Private ports restricted only to the VPC IP range
      sg.addIngressRule(ec2.Peer.ipv4(vpc.vpcCidrBlock), ec2.Port.tcp(5051), "CL Client API");
      sg.addIngressRule(ec2.Peer.ipv4(vpc.vpcCidrBlock), ec2.Port.tcp(5052), "CL Client API");
      sg.addIngressRule(ec2.Peer.ipv4(vpc.vpcCidrBlock), ec2.Port.tcp(8551), "EL Client RPC (Auth)");
      sg.addIngressRule(ec2.Peer.ipv4(vpc.vpcCidrBlock), ec2.Port.tcp(8545), "EL Client RPC");

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