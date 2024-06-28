import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as iam from 'aws-cdk-lib/aws-iam';
// import * as sqs from 'aws-cdk-lib/aws-sqs';

export class AlloraStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // Parameters
    // const resourceNamePrefixParam = new cdk.CfnParameter(this, 'ResourceNamePrefix', {
    //   type: 'String',
    //   description: 'Prefix for resource names to override AWS auto-generated naming convention',
    // });

    const instanceSizeParam = new cdk.CfnParameter(this, 'InstanceSize', {
      type: 'String',
      default: 't2.medium',
      description: 'EC2 Instance Size',
    });

    // Create VPC
    const vpc = new ec2.Vpc(this, 'AlloraWorkerxVpc', {
      maxAzs: 1,
      natGateways: 0,
      subnetConfiguration: [{
        cidrMask: 24,
        name: `AlloraWorkerxPublicSubnet`,
        subnetType: ec2.SubnetType.PUBLIC,
      }]
    });

    // Security Group with inbound TCP port 9010 open
    const securityGroup = new ec2.SecurityGroup(this, 'AlloraWorkerxSecurityGroup', {
      vpc,
      allowAllOutbound: true,
      description: 'Allow inbound TCP 9010',
    });
    securityGroup.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(9010), 'Allow inbound TCP 9010');

    // EC2 Instance
    const instance = new ec2.Instance(this, 'AlloraWorkerxInstance', {
      vpc,
      instanceType: new ec2.InstanceType(instanceSizeParam.valueAsString),
      machineImage: ec2.MachineImage.genericLinux({
        'us-east-1': 'ami-04b70fa74e45c3917',
      }),
      vpcSubnets: {
        subnetType: ec2.SubnetType.PUBLIC,
      },
      securityGroup: securityGroup,
      blockDevices: [{
        deviceName: '/dev/sda1',
        volume: ec2.BlockDeviceVolume.ebs(30, {
          volumeType: ec2.EbsDeviceVolumeType.GP3,
        }),
      }],
    });

    // Elastic IP
    const eip = new ec2.CfnEIP(this, 'AlloraWorkerxEIP');
    new ec2.CfnEIPAssociation(this, 'AlloraWorkerxEIPAssociation', {
      eip: eip.ref,
      instanceId: instance.instanceId,
    });
  }
}
