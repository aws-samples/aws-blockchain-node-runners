import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as iam from 'aws-cdk-lib/aws-iam';
// import * as sqs from 'aws-cdk-lib/aws-sqs';

export class AlloraStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // Parameters
    const resourceNamePrefixParam = new cdk.CfnParameter(this, 'ResourceNamePrefix', {
      type: 'String',
      description: 'Prefix for resource names to override AWS auto-generated naming convention',
    });

    const instanceSizeParam = new cdk.CfnParameter(this, 'InstanceSize', {
      type: 'String',
      default: 't2.medium',
      description: 'EC2 Instance Size',
    });

    // Create VPC
    const vpc = new ec2.Vpc(this, 'Vec4AlloraWorker1Vpc', {
      maxAzs: 1,
      natGateways: 0,
      subnetConfiguration: [{
        cidrMask: 24,
        name: `Vec4AlloraWorker1PublicSubnet`,
        subnetType: ec2.SubnetType.PUBLIC,
      }]
    });

    // Create and attach Internet Gateway
    // const igw = new ec2.CfnInternetGateway(this, 'Vec4AlloraWorker1IGW');
    // new ec2.CfnVPCGatewayAttachment(this, 'Vec4AlloraWorker1VpcIgwAttachment', {
    //   vpcId: vpc.vpcId,
    //   internetGatewayId: igw.ref,
    // });

    // Security Group with inbound TCP port 9010 open
    const securityGroup = new ec2.SecurityGroup(this, 'Vec4AlloraWorker1SecurityGroup', {
      vpc,
      allowAllOutbound: true,
      description: 'Allow inbound TCP 9010',
    });
    securityGroup.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(9010), 'Allow inbound TCP 9010');

    // EC2 Instance
    const instance = new ec2.Instance(this, 'Vec4AlloraWorker1Instance', {
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
    const eip = new ec2.CfnEIP(this, 'Vec4AlloraWorker1EIP');
    new ec2.CfnEIPAssociation(this, 'Vec4AlloraWorker1EIPAssociation', {
      eip: eip.ref,
      instanceId: instance.instanceId,
    });

    // Add Tags for resource naming convention
    // cdk.Tags.of(vpc).add('Name', `${resourceNamePrefixParam.valueAsString}-Vpc`);
    // cdk.Tags.of(securityGroup).add('Name', `${resourceNamePrefixParam.valueAsString}-SecurityGroup`);
    // cdk.Tags.of(instance).add('Name', `${resourceNamePrefixParam.valueAsString}-Instance`);
    // cdk.Tags.of(eip).add('Name', `${resourceNamePrefixParam.valueAsString}-EIP`);
  }
}
