import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as ec2 from "aws-cdk-lib/aws-ec2";

import { IndyNodeInstance } from './constructs/indy-node-instance';

import { readFileSync } from "fs";

export class IndyNodeStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const vpc = new ec2.Vpc(this, "IndyVpc", {
      ipAddresses: ec2.IpAddresses.cidr('10.0.0.0/16'),
    });

    // SecurityGroup of Nodes for Clients
    const clientSG = new ec2.SecurityGroup(this, 'ClientSG', {vpc});
    clientSG.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(9702), 'Allow 9702 from anywhere');
    
    // SecurityGroup of Nodes for Other Nodes
    const nodeSG = new ec2.SecurityGroup(this, 'NodeSG', {vpc});
    nodeSG.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(9701), 'Allow 9701 from anywhere');

    const node1 = new IndyNodeInstance(this, "Node1",{vpc, clientSG, nodeSG});
    const node2 = new IndyNodeInstance(this, "Node2",{vpc, clientSG, nodeSG});
    const node3 = new IndyNodeInstance(this, "Node3",{vpc, clientSG, nodeSG});
    const node4 = new IndyNodeInstance(this, "Node4",{vpc, clientSG, nodeSG});
    
    const trustee = new ec2.Instance(this, 'TrusteeInstance', {
      vpc: vpc,
      instanceType: ec2.InstanceType.of(ec2.InstanceClass.T3, ec2.InstanceSize.MEDIUM),
      machineImage: ec2.MachineImage.fromSsmParameter(
        '/aws/service/canonical/ubuntu/server/focal/stable/current/amd64/hvm/ebs-gp2/ami-id'
      ),
      ssmSessionPermissions: true,
      userData: ec2.UserData.custom(readFileSync("./lib/assets/user-data/trustee.sh", "base64")),
    });
    trustee.applyRemovalPolicy(cdk.RemovalPolicy.RETAIN);

    new cdk.CfnOutput(this, 'Node1InstanceId', {
      value: node1.instance.instanceId,
      exportName: 'Node1InstanceId',
    })

    new cdk.CfnOutput(this, 'Node2InstanceId', {
      value: node2.instance.instanceId,
      exportName: 'Node2InstanceId',
    })

    new cdk.CfnOutput(this, 'Node3InstanceId', {
      value: node3.instance.instanceId,
      exportName: 'Node3InstanceId',
    })

    new cdk.CfnOutput(this, 'Node4InstanceId', {
      value: node4.instance.instanceId,
      exportName: 'Node4InstanceId',
    })

    new cdk.CfnOutput(this, 'TrusteeInstanceId', {
      value: trustee.instanceId,
      exportName: 'TrusteeInstanceId',
    })
  }
}
