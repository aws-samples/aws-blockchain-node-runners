import * as cdk from "aws-cdk-lib";
import * as cdkConstructs from "constructs";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as iam from "aws-cdk-lib/aws-iam";
import * as s3Assets from "aws-cdk-lib/aws-s3-assets";
import * as path from "path";
import * as fs from "fs";
import * as nodeCwDashboard from "./constructs/node-cw-dashboard"
import * as cw from 'aws-cdk-lib/aws-cloudwatch';
import { SingleNodeConstruct } from "../../constructs/single-node"
import * as configTypes from "./config/node-config.interface";
import * as constants from "../../constructs/constants";
import { EthNodeSecurityGroupConstruct } from "./constructs/eth-node-security-group"
import * as nag from "cdk-nag";

export interface EthSingleNodeStackProps extends cdk.StackProps {
    ethClientCombination: configTypes.EthClientCombination;
    network: configTypes.EthNetwork;
    snapshotType: configTypes.SnapshotType;
    consensusSnapshotURL: string;
    executionSnapshotURL: string;
    consensusCheckpointSyncURL: string;
    nodeRole: configTypes.EthNodeRole;
    instanceType: ec2.InstanceType;
    instanceCpuType: ec2.AmazonLinuxCpuType;
    dataVolume: configTypes.EthDataVolumeConfig;
}

export class EthSingleNodeStack extends cdk.Stack {
    constructor(scope: cdkConstructs.Construct, id: string, props: EthSingleNodeStackProps) {
        super(scope, id, props);

        // Setting up necessary environment variables
        const REGION = cdk.Stack.of(this).region;
        const STACK_NAME = cdk.Stack.of(this).stackName;
        const availabilityZones = cdk.Stack.of(this).availabilityZones;
        const chosenAvailabilityZone = availabilityZones.slice(0, 1)[0];

        // Getting our config from initialization properties
        const {
            instanceType,
            ethClientCombination,
            network,
            snapshotType,
            consensusSnapshotURL,
            executionSnapshotURL,
            consensusCheckpointSyncURL,
            nodeRole,
            instanceCpuType,
            dataVolume,
        } = props;

        // Using default VPC
        const vpc = ec2.Vpc.fromLookup(this, "vpc", { isDefault: true });

        // Setting up the security group for the node from Ethereum-specific construct
        const instanceSG = new EthNodeSecurityGroupConstruct (this, "security-group", {
            vpc: vpc,
            clientCombination: ethClientCombination,
        })

        // Making our scripts and configis from the local "assets" directory available for instance to download
        const asset = new s3Assets.Asset(this, "assets", {
            path: path.join(__dirname, "assets"),
        });

        // Getting the snapshot bucket name and IAM role ARN from the common stack
        const importedInstanceRoleArn = cdk.Fn.importValue("NodeInstanceRoleArn");
        let snapshotBucketName;

        if (snapshotType === "s3") {
            snapshotBucketName = cdk.Fn.importValue("NodeSnapshotBucketName");
        }

        const instanceRole = iam.Role.fromRoleArn(this, "iam-role", importedInstanceRoleArn);

        // Making sure our instance will be able to read the assets
        asset.bucket.grantRead(instanceRole);

        // Setting up the node using generic Single Node constract
        const node = new SingleNodeConstruct(this, "single-node", {
            instanceName: STACK_NAME,
            instanceType,
            dataVolumes: [dataVolume],
            machineImage:  new ec2.AmazonLinuxImage({
                generation: ec2.AmazonLinuxGeneration.AMAZON_LINUX_2023,
                kernel:ec2.AmazonLinuxKernel.KERNEL6_1,
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

        // Parsing user data script and injecting necessary variables
        const userData = fs.readFileSync(path.join(__dirname, "assets", "user-data-alinux.sh")).toString();

        const modifiedUserData = cdk.Fn.sub(userData, {
            _REGION_: REGION,
            _ASSETS_S3_PATH_: `s3://${asset.s3BucketName}/${asset.s3ObjectKey}`,
            _SNAPSHOT_S3_PATH_: snapshotBucketName ? `s3://${snapshotBucketName}/${ethClientCombination}` : constants.NoneValue,
            _ETH_CLIENT_COMBINATION_: ethClientCombination,
            _ETH_NETWORK_: network,
            _ETH_SNAPSHOT_TYPE_: snapshotType,
            _ETH_CONSENSUS_SNAPSHOT_URL_: consensusSnapshotURL,
            _ETH_EXECUTION_SNAPSHOT_URL_: executionSnapshotURL,
            _ETH_CONSENSUS_CHECKPOINT_SYNC_URL_: consensusCheckpointSyncURL,
            _STACK_NAME_: STACK_NAME,
            _AUTOSTART_CONTAINER_: "true",
            _FORMAT_DISK_: "true",
            _DATA_VOLUME_TYPE_: dataVolume.type,
            _DATA_VOLUME_SIZE_: dataVolume.sizeGiB.toString(),
            _NODE_ROLE_:nodeRole,
            _NODE_CF_LOGICAL_ID_: node.nodeCFLogicalId,
            _LIFECYCLE_HOOK_NAME_: constants.NoneValue,
            _AUTOSCALING_GROUP_NAME_: constants.NoneValue,
        });

        // Adding modified userdata script to the instance prepared fro us by Single Node constract
        node.instance.addUserData(modifiedUserData);

        // Adding CloudWatch dashboard to the node
        const dashboardString = cdk.Fn.sub(JSON.stringify(nodeCwDashboard.SingleNodeCWDashboardJSON), {
            INSTANCE_ID:node.instanceId,
            INSTANCE_NAME: STACK_NAME,
            REGION: REGION,
        })

        new cw.CfnDashboard(this, 'single-cw-dashboard', {
            dashboardName: `${STACK_NAME}-${node.instanceId}`,
            dashboardBody: dashboardString,
        });

        new cdk.CfnOutput(this, "single-instance-id", {
            value: node.instanceId,
        });

        // Adding suppressions to the stack
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
