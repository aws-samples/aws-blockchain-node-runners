import * as cdk from "aws-cdk-lib";
import * as cdkContructs from 'constructs';
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as configTypes from "./config.interface";
import * as constants from "./constants";
import * as nag from "cdk-nag";

export interface SingleNodeConstructCustomProps {
  instanceName: string,
  instanceType: ec2.InstanceType,
  dataVolumes: configTypes.DataVolumeConfig[],
  rootDataVolumeDeviceName?: string,
  machineImage: cdk.aws_ec2.IMachineImage,
  role: cdk.aws_iam.IRole,
  vpc: cdk.aws_ec2.IVpc,
  securityGroup: cdk.aws_ec2.ISecurityGroup,
  availabilityZone: string,
  vpcSubnets: cdk.aws_ec2.SubnetSelection,
  // Ssh access for debugging. TODO: delete before merge to upstream repo.
  debugKeyName?: string,
}
export class SingleNodeConstruct extends cdkContructs.Construct {
    public instanceId: string;
    public nodeCFLogicalId: string;
    public instance: cdk.aws_ec2.Instance;

  constructor(scope: cdkContructs.Construct, id: string, props: SingleNodeConstructCustomProps) {
    super(scope, id);

    const {
      instanceName,
      instanceType,
      dataVolumes,
      rootDataVolumeDeviceName,
      machineImage,
      role,
      vpc,
      securityGroup,
      availabilityZone,
      vpcSubnets,
      // Ssh access for debugging. TODO: delete before merge to upstream repo.
      debugKeyName,
    } = props;

    const singleNode = new ec2.Instance(this, "single-node", {
      instanceName: instanceName,
      instanceType: instanceType,
      machineImage: machineImage,
      vpc: vpc,
      availabilityZone: availabilityZone,
      blockDevices: [
          {
            // ROOT VOLUME
            deviceName: rootDataVolumeDeviceName ? rootDataVolumeDeviceName :"/dev/xvda",
            volume: ec2.BlockDeviceVolume.ebs(46, {
                deleteOnTermination: true,
                encrypted: true,
                iops: 3000,
                volumeType: ec2.EbsDeviceVolumeType.GP3,
              }),
          },
        ],
      detailedMonitoring: true,
      propagateTagsToVolumeOnCreation: true,
      role: role,
      securityGroup: securityGroup,
      vpcSubnets: vpcSubnets,
      // Ssh access for debugging. Delete before merge.
      keyName: debugKeyName
    });

    this.instance = singleNode;

    // Processing data volumes
    let dataVolumeIDs: string[] = [constants.NoneValue];

    dataVolumes.forEach((dataVolume, arrayIndex) => {
      const dataVolumeIndex = arrayIndex +1;
      if (dataVolumeIndex > 6){
        throw new Error(`Number of data volumes can't be more than 6, current number: ${dataVolumeIndex}`);
        }
      if (dataVolume.type !== constants.InstanceStoreageDeviceVolumeType) {
        let newDataVolume: ec2.Volume;

        if (dataVolume.type === ec2.EbsDeviceVolumeType.GP3) {
          newDataVolume = new ec2.Volume(this, `data-volume-${dataVolumeIndex}`, {
            availabilityZone: availabilityZone,
            size: cdk.Size.gibibytes(dataVolume.sizeGiB),
            volumeType: ec2.EbsDeviceVolumeType[dataVolume.type.toUpperCase() as keyof typeof ec2.EbsDeviceVolumeType],
            encrypted: true,
            iops: dataVolume.iops,
            throughput: dataVolume.throughput,
            removalPolicy: cdk.RemovalPolicy.DESTROY,
          });
        } else {
          newDataVolume = new ec2.Volume(this, `data-volume-${dataVolumeIndex}`, {
            availabilityZone: availabilityZone,
            size: cdk.Size.gibibytes(dataVolume.sizeGiB),
            volumeType: ec2.EbsDeviceVolumeType[dataVolume.type.toUpperCase() as keyof typeof ec2.EbsDeviceVolumeType],
            encrypted: true,
            iops: dataVolume.iops,
            removalPolicy: cdk.RemovalPolicy.DESTROY,
          });
        }


      new ec2.CfnVolumeAttachment(this, `data-volume${dataVolumeIndex}-attachment`, {
          // Device naming according to https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/device_naming.html
          device: constants.VolumeDeviceNames[arrayIndex],
          instanceId: singleNode.instanceId,
          volumeId: newDataVolume.volumeId,
        });

        dataVolumeIDs[arrayIndex] = newDataVolume.volumeId;
      }
    })

    // Getting logical ID of the instance to send ready signal later once the instance is initialized
     const singleNodeCfn = singleNode.node.defaultChild as ec2.CfnInstance;
     this.nodeCFLogicalId = singleNodeCfn.logicalId;

    // CloudFormation Config: wait for 15 min for the node to start
    const creationPolicy: cdk.CfnCreationPolicy = {
      resourceSignal: {
        count: 1,
        timeout: "PT15M",
      },
    };

    singleNodeCfn.cfnOptions.creationPolicy = creationPolicy;

    this.instanceId = singleNode.instanceId;

    nag.NagSuppressions.addResourceSuppressions(
      this,
      [
          {
              id: "AwsSolutions-EC29",
              reason: "Its Ok to terminate this instance as long as we have the data in the snapshot",

          },
      ],
      true
  );
  }
}
