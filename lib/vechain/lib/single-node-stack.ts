import * as cdk from "aws-cdk-lib";
import * as cw from "aws-cdk-lib/aws-cloudwatch";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as iam from "aws-cdk-lib/aws-iam";
import * as s3Assets from "aws-cdk-lib/aws-s3-assets";
import * as nag from "cdk-nag";
import * as cdkConstructs from "constructs";
import * as fs from "fs";
import * as path from "path";
import { DataVolumeConfig } from "../../constructs/config.interface";
import * as constants from "../../constructs/constants";
import { SingleNodeConstruct } from "../../constructs/single-node";
import { VetNetwork, VetNodeType } from "./config/node-config.interface";
import { SingleNodeCWDashboardJSON } from "./constructs/node-cw-dashboard";
import { VETNodeSecurityGroupConstruct } from "./constructs/vet-node-security-group";

export interface VetSingleNodeStackProps extends cdk.StackProps {
    vetNodeType: VetNodeType;
    syncFromPublicSnapshot: boolean;
    instanceType: ec2.InstanceType;
    instanceCpuType: ec2.AmazonLinuxCpuType;
    dataVolume: DataVolumeConfig;
    network: VetNetwork;
    vetContainerImage: string;
    instanceRole: iam.Role;
}

export class VETSingleNodeStack extends cdk.Stack {
    constructor(scope: cdkConstructs.Construct, id: string, props: VetSingleNodeStackProps) {
        super(scope, id, props);

        // Setting up necessary environment variables
        const REGION = cdk.Stack.of(this).region;
        const STACK_NAME = cdk.Stack.of(this).stackName;
        const STACK_ID = cdk.Stack.of(this).stackId;
        const availabilityZones = cdk.Stack.of(this).availabilityZones;
        const chosenAvailabilityZone = availabilityZones.slice(0, 1)[0];

        // Getting our config from initialization properties
        const {
            instanceType,
            instanceCpuType,
            syncFromPublicSnapshot,
            vetNodeType,
            dataVolume,
            network,
            vetContainerImage,
            instanceRole
        } = props;

        // Using default VPC
        const vpc = ec2.Vpc.fromLookup(this, "vpc", { isDefault: true });

        // Setting up the security group for the node from VET-specific construct
        const instanceSG = new VETNodeSecurityGroupConstruct(this, "security-group", {
            vpc: vpc,
            vetNodeType
        });

        // Making our scripts and configs from the local "assets" directory available for instance to download
        const asset = new s3Assets.Asset(this, "assets", {
            path: path.join(__dirname, "assets")
        });

        // Making sure our instance will be able to read the assets
        asset.bucket.grantRead(instanceRole);

        const node = new SingleNodeConstruct(this, "single-node", {
            instanceName: STACK_NAME,
            instanceType,
            dataVolumes: [dataVolume],
            rootDataVolumeDeviceName: "/dev/xvda",
            machineImage: new ec2.AmazonLinuxImage({
                generation: ec2.AmazonLinuxGeneration.AMAZON_LINUX_2,
                cpuType: instanceCpuType
            }),
            vpc,
            availabilityZone: chosenAvailabilityZone,
            role: instanceRole,
            securityGroup: instanceSG.securityGroup,
            vpcSubnets: {
                subnetType: ec2.SubnetType.PUBLIC
            }
        });

        // Parsing user data script and injecting necessary variables
        const userData = fs.readFileSync(path.join(__dirname, "assets", "instance", "node", "userdata.sh")).toString();
        const dataVolumeSizeBytes = dataVolume.sizeGiB * constants.GibibytesToBytesConversionCoefficient;

        const modifiedUserData = cdk.Token.asString(
            cdk.Lazy.string({
                produce: () => {
                    return userData
                        .replaceAll("_AWS_REGION_", REGION)
                        .replaceAll("_ASSETS_S3_PATH_", `s3://${asset.s3BucketName}/${asset.s3ObjectKey}`)
                        .replaceAll("_STACK_NAME_", STACK_NAME)
                        .replaceAll("_NODE_CF_LOGICAL_ID_", node.nodeCFLogicalId)
                        .replaceAll("_DATA_VOLUME_TYPE_", dataVolume.type)
                        .replaceAll("_DATA_VOLUME_SIZE_", dataVolumeSizeBytes.toString())
                        .replaceAll("_NETWORK_", network)
                        .replaceAll("_SYNC_FROM_PUBLIC_SNAPSHOT_", syncFromPublicSnapshot.toString())
                        .replaceAll("_VET_NODE_TYPE_", vetNodeType)
                        .replaceAll("_VET_CONTAINER_IMAGE_", vetContainerImage)
                        .replaceAll("_LIFECYCLE_HOOK_NAME_", constants.NoneValue);
                }
            })
        );

        node.instance.addUserData(modifiedUserData);

        // Adding CloudWatch dashboard to the node
        const dashboardString = cdk.Fn.sub(JSON.stringify(SingleNodeCWDashboardJSON), {
            INSTANCE_ID: node.instanceId,
            INSTANCE_NAME: STACK_NAME,
            REGION: REGION
        });

        new cw.CfnDashboard(this, "vet-cw-dashboard", {
            dashboardName: `${STACK_NAME}-${node.instanceId}`,
            dashboardBody: dashboardString
        });

        new cdk.CfnOutput(this, "node-instance-id", {
            value: node.instanceId
        });

        // Adding suppressions to the stack
        nag.NagSuppressions.addResourceSuppressions(
            this,
            [
                {
                    id: "AwsSolutions-IAM5",
                    reason: "Need read access to the S3 bucket with assets"
                }
            ],
            true
        );
    }
}
