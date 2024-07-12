#!/usr/bin/env node
import 'dotenv/config';
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as constants from "../constructs/constants";
import { EdgeCommonStack } from "./lib/common-stack";
import { AlloraStack } from './lib/allora-stack';

const parseDataVolumeType = (dataVolumeType: string) => {
  switch (dataVolumeType) {
      case "gp3":
          return ec2.EbsDeviceVolumeType.GP3;
      case "io2":
          return ec2.EbsDeviceVolumeType.IO2;
      case "io1":
          return ec2.EbsDeviceVolumeType.IO1;
      case "instance-store":
          return constants.InstanceStoreageDeviceVolumeType;
      default:
          return ec2.EbsDeviceVolumeType.GP3;
  }
};

const app = new cdk.App();

new EdgeCommonStack(app, "allora-edge-common", {
  stackName: `allora-edge-nodes-common`,
  env: { account: process.env.AWS_ACCOUNT_ID || "xxxxxxxxxxx", region: process.env.AWS_REGION || 'us-east-1' }
});

new AlloraStack(app, 'allora-single-node', {
  stackName: 'allora-single-node',
  env: { 
    account: process.env.AWS_ACCOUNT_ID || "xxxxxxxxxxx",
    region: process.env.AWS_REGION || 'us-east-1',
  },
  amiId: process.env.AWS_AMI_ID || 'ami-04b70fa74e45c3917',
  instanceType: process.env.AWS_INSTANCE_TYPE || 'ami-04b70fa74e45c3917',
  vpcMaxAzs: Number(process.env.AWS_VPC_MAX_AZS || 1),
  vpcNatGateways:  Number(process.env.AWS_VPC_NAT_GATEWAYS || 0),
  vpcSubnetCidrMask: Number(process.env.AWS_VPC_CIDR_MASK),
  resourceNamePrefix: process.env.AWS_RESOURCE_NAME_PREFIX || 'AlloraWorkerx',
  dataVolume: {
    sizeGiB: process.env.EDGE_DATA_VOL_SIZE ? parseInt(process.env.EDGE_DATA_VOL_SIZE) : 256,
    type: parseDataVolumeType(process.env.EDGE_DATA_VOL_TYPE?.toLowerCase() ? process.env.EDGE_DATA_VOL_TYPE?.toLowerCase() : "gp3"),
    iops: process.env.EDGE_DATA_VOL_IOPS ? parseInt(process.env.EDGE_DATA_VOL_IOPS) : 10000,
    throughput: process.env.EDGE_DATA_VOL_THROUGHPUT ? parseInt(process.env.EDGE_DATA_VOL_THROUGHPUT) : 700
  }
});
