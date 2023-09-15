import * as cdk from "aws-cdk-lib";
import * as cdkContructs from 'constructs';
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as configTypes from "../config/polygonConfig.interface"
import * as nag from "cdk-nag";

export interface PolygonSycnNodeSecurityGroupConstructProps {
    vpc: cdk.aws_ec2.IVpc;
    clientCombination: configTypes.PolygonClientCombination
  }

  export class PolygonSyncNodeSecurityGroupConstruct extends cdkContructs.Construct {
    public securityGroup: cdk.aws_ec2.ISecurityGroup;

    constructor(scope: cdkContructs.Construct, id: string, props: PolygonSycnNodeSecurityGroupConstructProps) {
      super(scope, id);

      const { 
        vpc,
        clientCombination,
      } = props;
  
      const sg = new ec2.SecurityGroup(this, `sync-node-security-group`, {
        vpc,
        description: "Security Group for Blockchain nodes",
        allowAllOutbound: true,
      });

      this.securityGroup = sg
    }
  }