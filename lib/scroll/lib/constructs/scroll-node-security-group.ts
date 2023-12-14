import * as cdk from "aws-cdk-lib";
import * as cdkConstructs from 'constructs';
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as nag from "cdk-nag";
import {SecurityGroupProps} from "aws-cdk-lib/aws-ec2/lib/security-group";

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
      sg.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(8545), "P2P protocols");
      sg.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.udp(8545), "P2P protocols");

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
