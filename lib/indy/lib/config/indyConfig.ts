import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as configTypes from "./indyConfig.interface";
import * as constants from "../../../constructs/constants";

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
}

export const vpcAddresses: string = process.env.INDY_VPC_ADDRESSES || "10.0.0.0/16"

export const baseConfig: configTypes.IndyBaseConfig = {
  accountId: process.env.AWS_ACCOUNT_ID || "xxxxxxxxxxx",          // Set your target AWS Account ID
  region: process.env.AWS_REGION || "us-east-2",               // Set your target AWS Region
};

export const studentNodeConfig: configTypes.IndyNodeConfig = {
  instanceType: new ec2.InstanceType(process.env.INDY_STUDENT_INSTANCE_TYPE ? process.env.INDY_STUDENT_INSTANCE_TYPE : "m6g.2xlarge"), //InstanceType.of(InstanceClass.M6G, InstanceSize.XLARGE2),
  instanceCpuType: process.env.INDY_STUDENT__CPU_TYPE?.toLowerCase() == "x86_64" ? ec2.AmazonLinuxCpuType.X86_64 : ec2.AmazonLinuxCpuType.ARM_64 ,
  dataVolumes: [
      {
          sizeGiB: process.env.INDY_STUDENT_DATA_VOL_SIZE ? parseInt(process.env.INDY_STUDENT_DATA_VOL_SIZE): 50, // Minimum values in Gibibytes:
          type: parseDataVolumeType(process.env.INDY_STUDENT_DATA_VOL_TYPE?.toLowerCase() ? process.env.INDY_STUDENT_DATA_VOL_TYPE?.toLowerCase() : "gp3"),
          iops: process.env.INDY_STUDENT_DATA_VOL_IOPS ? parseInt(process.env.INDY_STUDENT_DATA_VOL_IOPS): 7000,
          throughput: process.env.INDY_STUDENT_DATA_VOL_THROUGHPUT ? parseInt(process.env.INDY_STUDENT_DATA_VOL_THROUGHPUT): 250,
      }
  ]
};

export const trusteeNodeConfig: configTypes.IndyNodeConfig = {
  instanceType: new ec2.InstanceType(process.env.INDY_STUDENT_INSTANCE_TYPE ? process.env.INDY_STUDENT_INSTANCE_TYPE : "m6g.2xlarge"), //InstanceType.of(InstanceClass.M6G, InstanceSize.XLARGE2),
  instanceCpuType: process.env.INDY_STUDENT__CPU_TYPE?.toLowerCase() == "x86_64" ? ec2.AmazonLinuxCpuType.X86_64 : ec2.AmazonLinuxCpuType.ARM_64 ,
  dataVolumes: [
      {
          sizeGiB: process.env.INDY_STUDENT_DATA_VOL_SIZE ? parseInt(process.env.INDY_STUDENT_DATA_VOL_SIZE): 50, // Minimum values in Gibibytes:
          type: parseDataVolumeType(process.env.INDY_STUDENT_DATA_VOL_TYPE?.toLowerCase() ? process.env.INDY_STUDENT_DATA_VOL_TYPE?.toLowerCase() : "gp3"),
          iops: process.env.INDY_STUDENT_DATA_VOL_IOPS ? parseInt(process.env.INDY_STUDENT_DATA_VOL_IOPS): 7000,
          throughput: process.env.INDY_STUDENT_DATA_VOL_THROUGHPUT ? parseInt(process.env.INDY_STUDENT_DATA_VOL_THROUGHPUT): 250,
      }
  ]
};