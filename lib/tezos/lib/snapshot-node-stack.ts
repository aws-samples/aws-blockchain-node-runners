import * as cdk from "aws-cdk-lib";
import * as cdkConstructs from "constructs";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as iam from "aws-cdk-lib/aws-iam";
import * as s3Assets from "aws-cdk-lib/aws-s3-assets";
import * as configTypes from "./config/tzConfig.interface";
import { TzNodeSecurityGroupConstructs } from "./constructs/tz-node-security-group";
import * as fs from "fs";
import * as path from "path";
import * as constants from "../../constructs/constants";
import * as nodeCwDashboard from "./assets/node-cw-dashboard"
import * as cw from 'aws-cdk-lib/aws-cloudwatch';
import { SingleNodeConstruct } from "../../constructs/single-node"
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
    octezDownloadUri: string;
    dataVolume: configTypes.TzDataVolumeConfig;
}

export class TzSnapshotNodeStack extends cdk.Stack {
    constructor(scope: cdkConstructs.Construct, id: string, props: TzSnapshotNodeStackProps) {
        super(scope, id, props);

        const REGION = cdk.Stack.of(this).region;
        const STACK_NAME = cdk.Stack.of(this).stackName;
        const STACK_ID = cdk.Stack.of(this).stackId;
        const AWS_ACCOUNT_ID = cdk.Stack.of(this).account;
        const availabilityZones = cdk.Stack.of(this).availabilityZones;
        const chosenAvailabilityZone = availabilityZones.slice(0, 1)[0];

        const {
            instanceType,
            nodeRole,
            instanceCpuType,
            tzNetwork,
            historyMode,
            downloadSnapshot,
            snapshotsUrl,
            octezDownloadUri,
            dataVolume,
        } = props;

        // using default vpc
        const vpc = ec2.Vpc.fromLookup(this, "vpc", { isDefault: true });

        // setting up the security group for the node from TZ-specific construct
        const instanceSG = new TzNodeSecurityGroupConstructs(this, "security-group", { vpc: vpc });

        // getting the IAM Role ARM from the common stack
        const importedInstanceRoleArn = cdk.Fn.importValue("TzNodeInstanceRoleArn");

        const snapshotInstanceRole = iam.Role.fromRoleArn(this, "iam-role", importedInstanceRoleArn);

        // making our scripts and configs from the local "assets" directory available for instance to download
        const asset = new s3Assets.Asset(this, "assets", {
            path: path.join(__dirname, "assets")
        });

        asset.bucket.grantRead(snapshotInstanceRole);


        const snapshotsBucket = new SnapshotsS3BucketConstruct(this, "snapshots-s3-bucket", {
            bucketName: `${STACK_NAME}-${AWS_ACCOUNT_ID}-${REGION}`,
        });

        const s3VPCEndpoint = vpc.addGatewayEndpoint("s3-vpc-endpoint", {
            service: ec2.GatewayVpcEndpointAwsService.S3,
        });

        snapshotInstanceRole.addToPrincipalPolicy(
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

        // Setting up the node using generic Sync Node constract
        const node = new SingleNodeConstruct(this, "sync-node", {
            instanceName: STACK_NAME,
            instanceType,
            dataVolumes: [dataVolume],
            machineImage: new ec2.AmazonLinux2023ImageSsmParameter({
                kernel: ec2.AmazonLinux2023Kernel.KERNEL_6_1,
                cpuType: instanceCpuType,
            }),
            vpc,
            availabilityZone: chosenAvailabilityZone,
            role: snapshotInstanceRole,
            securityGroup: instanceSG.securityGroup,
            vpcSubnets: {
                subnetType: ec2.SubnetType.PUBLIC,
            },
        });
        
        // Parsing user data script and injecting necessary variables
        const userData = fs.readFileSync(path.join(__dirname, "assets", "user-data", "node.sh")).toString();
        const modifiedUserData = cdk.Fn.sub(userData, {
            _AWS_REGION_: REGION,
            _ASSETS_S3_PATH_: `s3://${asset.s3BucketName}/${asset.s3ObjectKey}`,
            _STACK_NAME_: STACK_NAME,
            _TZ_SNAPSHOTS_URI_: snapshotsUrl,
            _STACK_ID_: STACK_ID,
            _NODE_CF_LOGICAL_ID_: node.nodeCFLogicalId,
            _TZ_HISTORY_MODE_: historyMode,
            _TZ_DOWNLOAD_SNAPSHOT_ : String(downloadSnapshot),
            _TZ_OCTEZ_DOWNLOAD_URI_ : octezDownloadUri,
            _TZ_NETWORK_: tzNetwork,
            _LIFECYCLE_HOOK_NAME_: constants.NoneValue,
            _AUTOSCALING_GROUP_NAME_: constants.NoneValue,
            _INSTANCE_TYPE_: "SNAPSHOT",
            _S3_SYNC_BUCKET_: snapshotsBucket.bucketName,
        });
        
        // Adding modified userdata script to the instance prepared fro us by Single Node constract
        node.instance.addUserData(modifiedUserData);
        
        // Adding CloudWatch dashboard to the node
        const dashboardString = cdk.Fn.sub(JSON.stringify(nodeCwDashboard.SyncNodeCWDashboardJSON), {
            INSTANCE_ID:node.instanceId,
            INSTANCE_NAME: STACK_NAME,
            REGION: REGION,
        })
        
        new cw.CfnDashboard(this, 'sync-cw-dashboard', {
            dashboardName: `${STACK_NAME}-${node.instanceId}`,
            dashboardBody: dashboardString,
        });
        
        new cdk.CfnOutput(this, "sync-instance-id", {
            value: node.instanceId,
        });

        new cdk.CfnOutput(this, "TezosSnapshotBucket", {
            value: snapshotsBucket.bucketName,
            exportName: "TezosSnapshotBucket",
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
