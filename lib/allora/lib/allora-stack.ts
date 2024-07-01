import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as iam from 'aws-cdk-lib/aws-iam';
// import * as sqs from 'aws-cdk-lib/aws-sqs';


export interface AlloraStackProps extends cdk.StackProps {
  amiId: string;
  instanceType: string;
  vpcMaxAzs: number;
  vpcNatGateways: number
  vpcSubnetCidrMask: number;
  resourceNamePrefix: string;
}


export class AlloraStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: AlloraStackProps) {
    super(scope, id, props);

    // Parameters
    const region = props?.env?.region || 'us-east-1';
    const amiId = props?.amiId || 'ami-04b70fa74e45c3917';
    const instanceType = props?.instanceType || 't2.medium';
    const resourceNamePrefix = props?.resourceNamePrefix || 'AlloraWorkerx';

    // Create VPC
    const vpc = new ec2.Vpc(this, `${resourceNamePrefix}Vpc`, {
      maxAzs: props?.vpcMaxAzs || 1,
      natGateways: typeof props?.vpcNatGateways !== 'undefined' ? props?.vpcNatGateways : 0,
      subnetConfiguration: [{
        cidrMask: props?.vpcSubnetCidrMask || 24,
        name:`${resourceNamePrefix}PublicSubnet`,
        subnetType: ec2.SubnetType.PUBLIC,
      }]
    });

    // Security Group with inbound TCP port 9010 open
    const securityGroup = new ec2.SecurityGroup(this, `${resourceNamePrefix}SecurityGroup`, {
      vpc,
      allowAllOutbound: true,
      description: 'Allow inbound TCP 9010',
    });
    securityGroup.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(9010), 'Allow inbound TCP 9010');

    // EC2 Instance
    const instance = new ec2.Instance(this, `${resourceNamePrefix}Instance`, {
      vpc,
      instanceType: new ec2.InstanceType(instanceType),
      machineImage: ec2.MachineImage.genericLinux({
        [region]: amiId,
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
    const eip = new ec2.CfnEIP(this, `${resourceNamePrefix}EIP`);
    new ec2.CfnEIPAssociation(this, `${resourceNamePrefix}EIPAssociation`, {
      eip: eip.ref,
      instanceId: instance.instanceId,
    });
  }
}
