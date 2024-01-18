import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import { Construct } from 'constructs';

import { readFileSync } from "fs";

export interface IndyNodeInstanceProps {
  readonly vpc: ec2.IVpc
  readonly clientSG: ec2.ISecurityGroup
  readonly nodeSG: ec2.ISecurityGroup
}

export class IndyNodeInstance extends Construct {
  public readonly instance: ec2.Instance;

  constructor(scope: Construct, id: string, props: IndyNodeInstanceProps) {
    super(scope, id);

    const { vpc, clientSG, nodeSG } = props;

    const clientNic: ec2.CfnInstance.NetworkInterfaceProperty = {
      deviceIndex: "0",
      groupSet: [clientSG.securityGroupId],
      subnetId: vpc.privateSubnets[0].subnetId,
      description: 'Client NIC',
    };

    const nodeNic: ec2.CfnInstance.NetworkInterfaceProperty = {
      deviceIndex: "1",
      groupSet: [nodeSG.securityGroupId],
      subnetId: vpc.privateSubnets[0].subnetId,
      description: 'Node NIC',
    };

    const instance = new ec2.Instance(this, 'Instance', {
      vpc: vpc,
      instanceType: ec2.InstanceType.of(ec2.InstanceClass.T3, ec2.InstanceSize.LARGE),
      machineImage: ec2.MachineImage.fromSsmParameter(
        '/aws/service/canonical/ubuntu/server/focal/stable/current/amd64/hvm/ebs-gp2/ami-id'
      ),
      ssmSessionPermissions: true,
      userData: ec2.UserData.custom(readFileSync("./lib/assets/user-data/steward.sh", "base64")),
      blockDevices: [{
        deviceName: "/dev/sda1",
        volume: ec2.BlockDeviceVolume.ebs(250, {
          volumeType: ec2.EbsDeviceVolumeType.STANDARD,
          encrypted: true
        })
      }],
    });

    const cfnInstance = instance.node.defaultChild as ec2.CfnInstance;
    cfnInstance.addPropertyDeletionOverride('SubnetId');
    cfnInstance.addPropertyDeletionOverride('SecurityGroupIds');
    cfnInstance.networkInterfaces = [
      clientNic, nodeNic
    ]
    
    instance.applyRemovalPolicy(cdk.RemovalPolicy.RETAIN);

    this.instance = instance;
  }
}
