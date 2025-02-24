import * as cdk from "aws-cdk-lib";
import * as cdkContructs from 'constructs';
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as nag from "cdk-nag";

export interface NodeSecurityGroupConstructProps {
    vpc: cdk.aws_ec2.IVpc;
  }

  export class NodeSecurityGroupConstruct extends cdkContructs.Construct {
    public securityGroup: cdk.aws_ec2.ISecurityGroup;

    constructor(scope: cdkContructs.Construct, id: string, props: NodeSecurityGroupConstructProps) {
      super(scope, id);

      const {
        vpc,
      } = props;

      const sg = new ec2.SecurityGroup(this, `node-security-group`, {
        vpc,
        description: "Security Group for Allora Blockchain nodes",
        allowAllOutbound: true,
      });

      // Public ports
      // sg.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(9010), "Allow inbound TCP 9010");

      // Private ports restricted only to the VPC IP range
      sg.addIngressRule(ec2.Peer.ipv4(vpc.vpcCidrBlock), ec2.Port.tcp(8000), "ALLORA Offchain Source");

      this.securityGroup = sg

      /**
         * cdk-nag suppressions
         */

      nag.NagSuppressions.addResourceSuppressions(
        this,
        [
            {
                id: "AwsSolutions-EC23",
                reason: "Allora requires wildcard inbound for specific ports",
            },
        ],
        true
    );
    }
  }
