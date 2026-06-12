import * as cdk from "aws-cdk-lib";
import * as cdkConstructs from "constructs";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as iam from "aws-cdk-lib/aws-iam";
import * as s3Assets from "aws-cdk-lib/aws-s3-assets";
import * as path from "path";
import * as fs from "fs";
import * as nodeCwDashboard from "./assets/node-cw-dashboard";
import * as cw from "aws-cdk-lib/aws-cloudwatch";
import * as constants from "../../constructs/constants";
import { SingleNodeConstruct } from "../../constructs/single-node";
import * as configTypes from "./config/tronConfig.interface";
import { TronNodeSecurityGroupConstructs } from "./constructs/tron-node-security-group";
import * as nag from "cdk-nag";

export interface TronSnapshotNodeStackProps extends cdk.StackProps, configTypes.TronBaseNodeConfig {
}

// Snapshot node: syncs from the public source, then uploads its DB to the private S3
// staging bucket on a daily cron so RPC/single nodes can restore quickly (TRON_SNAPSHOT_TYPE=s3).
export class TronSnapshotNodeStack extends cdk.Stack {
    constructor(scope: cdkConstructs.Construct, id: string, props: TronSnapshotNodeStackProps) {
        super(scope, id, props);

        const REGION = cdk.Stack.of(this).region;
        const STACK_NAME = cdk.Stack.of(this).stackName;
        const STACK_ID = cdk.Stack.of(this).stackId;
        const availabilityZones = cdk.Stack.of(this).availabilityZones;
        const chosenAvailabilityZone = availabilityZones.slice(0, 1)[0];

        const {
            instanceType,
            instanceCpuType,
            tronNetwork,
            nodeConfiguration,
            dbEngine,
            snapshotsUrl,
            dataVolume,
        } = props;

        const vpc = ec2.Vpc.fromLookup(this, "vpc", { isDefault: true });

        const instanceSG = new TronNodeSecurityGroupConstructs(this, "security-group", { vpc: vpc });

        const asset = new s3Assets.Asset(this, "assets", {
            path: path.join(__dirname, "assets"),
        });

        const importedInstanceRoleArn = cdk.Fn.importValue("TronNodeInstanceRoleArn");
        const importedSnapshotBucketName = cdk.Fn.importValue("TronNodeSnapshotBucketName");
        const instanceRole = iam.Role.fromRoleArn(this, "iam-role", importedInstanceRoleArn);
        asset.bucket.grantRead(instanceRole);

        const node = new SingleNodeConstruct(this, "snapshot-node", {
            instanceName: STACK_NAME,
            instanceType,
            dataVolumes: [dataVolume],
            machineImage: new ec2.AmazonLinuxImage({
                generation: ec2.AmazonLinuxGeneration.AMAZON_LINUX_2,
                kernel: ec2.AmazonLinuxKernel.KERNEL5_X,
                cpuType: instanceCpuType,
            }),
            vpc,
            availabilityZone: chosenAvailabilityZone,
            role: instanceRole,
            securityGroup: instanceSG.securityGroup,
            vpcSubnets: {
                subnetType: ec2.SubnetType.PUBLIC,
            },
        });

        const userData = fs.readFileSync(path.join(__dirname, "assets", "user-data", "node.sh")).toString();
        const dataVolumeSizeBytes = dataVolume.sizeGiB * constants.GibibytesToBytesConversionCoefficient;

        const modifiedUserData = cdk.Fn.sub(userData, {
            _AWS_REGION_: REGION,
            _ASSETS_S3_PATH_: `s3://${asset.s3BucketName}/${asset.s3ObjectKey}`,
            _STACK_NAME_: STACK_NAME,
            _TRON_SNAPSHOTS_URL_: snapshotsUrl,
            _STACK_ID_: STACK_ID,
            _NODE_CF_LOGICAL_ID_: node.nodeCFLogicalId,
            _TRON_NODE_TYPE_: nodeConfiguration,
            _TRON_DB_ENGINE_: dbEngine,
            // Snapshot node always bootstraps from the public source, then maintains the S3 copy.
            _TRON_SNAPSHOT_TYPE_: "public",
            _TRON_SNAPSHOT_S3_BUCKET_: importedSnapshotBucketName,
            _TRON_SNAPSHOT_NODE_: "true",
            _DATA_VOLUME_TYPE_: dataVolume.type,
            _DATA_VOLUME_SIZE_: dataVolumeSizeBytes.toString(),
            _TRON_DOWNLOAD_SNAPSHOT_: "true",
            _TRON_NETWORK_: tronNetwork,
            _LIFECYCLE_HOOK_NAME_: constants.NoneValue,
            _AUTOSCALING_GROUP_NAME_: constants.NoneValue,
        });

        node.instance.addUserData(modifiedUserData);

        const dashboardString = cdk.Fn.sub(JSON.stringify(nodeCwDashboard.SyncNodeCWDashboardJSON), {
            INSTANCE_ID: node.instanceId,
            INSTANCE_NAME: STACK_NAME,
            REGION: REGION,
        });

        new cw.CfnDashboard(this, "snapshot-cw-dashboard", {
            dashboardName: `${STACK_NAME}-${node.instanceId}`,
            dashboardBody: dashboardString,
        });

        new cdk.CfnOutput(this, "snapshot-instance-id", {
            value: node.instanceId,
        });

        nag.NagSuppressions.addResourceSuppressions(
            this,
            [
                {
                    id: "AwsSolutions-IAM5",
                    reason: "Need read and write access to the S3 bucket",
                },
            ],
            true
        );
    }
}
