import * as cdk from "aws-cdk-lib";
import * as cdkConstructs from "constructs";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as iam from "aws-cdk-lib/aws-iam";
import * as s3 from "aws-cdk-lib/aws-s3";
import { AmazonLinuxGeneration, AmazonLinuxImage } from "aws-cdk-lib/aws-ec2";
import * as s3Assets from "aws-cdk-lib/aws-s3-assets";
import * as configTypes from "./config/tzConfig.interface";
import { TzNodeSecurityGroupConstructs } from "./constructs/tz-node-security-group";
import * as fs from "fs";
import * as path from "path";
import * as constants from "../../constructs/constants";
import { HANodesConstruct } from "../../constructs/ha-rpc-nodes-with-alb";
import * as nag from "cdk-nag";
import { SnapshotsS3BucketConstruct } from "../../constructs/snapshots-bucket";

export interface TzSnapshotNodeStackProps extends cdk.StackProps {
    nodeRole: configTypes.TzNodeRole;
    instanceType: ec2.InstanceType;
    instanceCpuType: ec2.AmazonLinuxCpuType;
    tzNetwork: configTypes.TzNetwork;
    historyMode: configTypes.TzNodeHistoryMode;
    downloadSnapshot: boolean;
    snapshotsUrl: string;
}

export class TzSnapshotNodeStack extends cdk.Stack {
    constructor(scope: cdkConstructs.Construct, id: string, props: TzSnapshotNodeStackProps) {
        super(scope, id, props);

        const REGION = cdk.Stack.of(this).region;
        const STACK_NAME = cdk.Stack.of(this).stackName;
        const STACK_ID = cdk.Stack.of(this).stackId;
        const AWS_ACCOUNT_ID = cdk.Stack.of(this).account
        const lifecycleHookName = STACK_NAME;
        const autoScalingGroupName = STACK_NAME;

        const {
            instanceType,
            nodeRole,
            instanceCpuType,
            tzNetwork,
            historyMode,
            downloadSnapshot,
            snapshotsUrl,
        } = props;

        // using default vpc
        const vpc = ec2.Vpc.fromLookup(this, "vpc", { isDefault: true });

        // setting up the security group for the node from TZ-specific construct
        const instanceSG = new TzNodeSecurityGroupConstructs(this, "security-group", { vpc: vpc });

        // getting the IAM Role ARM from the common stack
        const importedInstanceRoleArn = cdk.Fn.importValue("TzNodeInstanceRoleArn");

        const instanceRole = iam.Role.fromRoleArn(this, "iam-role", importedInstanceRoleArn);

        // making our scripts and configs from the local "assets" directory available for instance to download
        const asset = new s3Assets.Asset(this, "assets", {
            path: path.join(__dirname, "assets")
        });

        asset.bucket.grantRead(instanceRole);


        const snapshotsBucket = new SnapshotsS3BucketConstruct(this, "snapshots-s3-bucket", {
            bucketName: `${STACK_NAME}-${AWS_ACCOUNT_ID}-${REGION}`,
        });

        const s3VPCEndpoint = vpc.addGatewayEndpoint("s3-vpc-endpoint", {
            service: ec2.GatewayVpcEndpointAwsService.S3,
        });

        const snapshotInstanceRole = new iam.Role(this, `snapshot-instance-role`, {
            assumedBy: new iam.ServicePrincipal("ec2.amazonaws.com"),
            managedPolicies: [
                iam.ManagedPolicy.fromAwsManagedPolicyName("CloudWatchAgentServerPolicy"),
            ],
        });

        asset.bucket.grantRead(snapshotInstanceRole);
        snapshotInstanceRole.addToPolicy(
            new iam.PolicyStatement({
                resources: [
                    snapshotsBucket.bucketArn, 
                    snapshotsBucket.arnForObjects("*"), 
                    "arn:aws:s3:::lambsonacid-octez-*"
            ],
                actions: ["s3:ListBucket", "s3:*Object"],
            })
        );


        // Limiting access through this VPC endpoint only to our sync bucket and Amazon linux repo bucket
        s3VPCEndpoint.addToPolicy(
            new iam.PolicyStatement({
                principals: [new iam.AnyPrincipal()],
                resources: [
                    snapshotsBucket.bucketArn,
                    snapshotsBucket.arnForObjects("*"),
                    `arn:aws:s3:::al2023-repos-${REGION}*`,
                    `arn:aws:s3:::al2023-repos-${REGION}/*`,
                    `arn:aws:s3:::${asset.s3BucketName}`,
                    `arn:aws:s3:::${asset.s3BucketName}/*`,
                    "arn:aws:s3:::amazoncloudwatch-agent",
                    "arn:aws:s3:::amazoncloudwatch-agent/*",
                    "arn:aws:s3:::lambsonacid-octez-*"
                ],
                actions: ["s3:ListBucket", "s3:*Object", "s3:GetBucket*"],
            })
        );
        const snapshotNodeScript = fs.readFileSync(path.join(__dirname, "assets", "user-data", "node.sh")).toString();
        

        const snapshotNode = new ec2.Instance(this, "snapshot-node", {
            instanceName: "snapshot-node",
            instanceType: instanceType,
            machineImage: new ec2.AmazonLinux2023ImageSsmParameter({
                kernel: ec2.AmazonLinux2023Kernel.KERNEL_6_1,
                cpuType: instanceCpuType,
            }),
            vpc: vpc,
            blockDevices: [
                {
                  // ROOT VOLUME
                  deviceName: "/dev/xvda",
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
            role: snapshotInstanceRole,
            securityGroup: instanceSG.securityGroup,
          });

          const modifiedSnapshotNodeScript = cdk.Fn.sub(snapshotNodeScript, {
              _AWS_REGION_: REGION,
              _STACK_NAME_: STACK_NAME,
              _TZ_SNAPSHOTS_URI_: snapshotsUrl,
              _STACK_ID_: STACK_ID,
              _TZ_HISTORY_MODE_: historyMode,
              _TZ_DOWNLOAD_SNAPSHOT_ : String(downloadSnapshot),
              _TZ_NETWORK_: tzNetwork,
              _S3_SYNC_BUCKET_: snapshotsBucket.bucketName,
              _NODE_CF_LOGICAL_ID_: snapshotNode.instance.logicalId,
              _LIFECYCLE_HOOK_NAME_: lifecycleHookName,
              _AUTOSCALING_GROUP_NAME_: autoScalingGroupName,
              _ASSETS_S3_PATH_: `s3://${asset.s3BucketName}/${asset.s3ObjectKey}`,
              _INSTANCE_TYPE_: "SNAPSHOT",
          });

          snapshotNode.addUserData(modifiedSnapshotNodeScript);


        // Getting logical ID of the instance to send ready signal later once the instance is initialized
        const snapshotNodeCfn = snapshotNode.node.defaultChild as ec2.CfnInstance;

        // CloudFormation Config: wait for 15 min for the node to start
        const creationPolicy: cdk.CfnCreationPolicy = {
            resourceSignal: {
            count: 1,
            timeout: "PT90M",
            },
        };
        

        snapshotNodeCfn.cfnOptions.creationPolicy = creationPolicy;

        new cdk.CfnOutput(this, "SnapshotBucketName", {
            value: snapshotsBucket.bucketName,
            exportName: "SnapshotBucketName",
          });

        // Adding suppressions to the stack
        nag.NagSuppressions.addResourceSuppressions(
            this,
            [
                {
                    id: "AwsSolutions-AS3",
                    reason: "No notifications needed"
                },
                {
                    id: "AwsSolutions-S1",
                    reason: "No access log needed for ALB logs bucket"
                },
                {
                    id: "AwsSolutions-EC28",
                    reason: "Using basic monitoring to save costs"
                },
                {
                    id: "AwsSolutions-IAM5",
                    reason: "Need read access to the S3 bucket with assets"
                },
                {
                    id: "AwsSolutions-IAM4",
                    reason: "AmazonSSMManagedInstanceCore and CloudWatchAgentServerPolicy are restrictive enough"
                },
                {
                    id: "AwsSolutions-EC29",
                    reason: "We do not need to have termination protection for snapshot nodes"
                } 
            ],
            true
        );
    }
}
