import * as cdk from "aws-cdk-lib";
import * as cdkContructs from 'constructs';
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as nag from "cdk-nag";

export interface ScrollNodeSecurityGroupConstructProps {
    vpc: cdk.aws_ec2.IVpc;
  }

  export class ScrollNodeSecurityGroupConstruct extends cdkContructs.Construct {
    public securityGroup: cdk.aws_ec2.ISecurityGroup;

    constructor(scope: cdkContructs.Construct, id: string, props: ScrollNodeSecurityGroupConstructProps) {
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
      sg.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(30303), "P2P protocols (gossip, turbine, repair, etc)");
      sg.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(30303), "P2P protocols (gossip, turbine, repair, etc)");

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
