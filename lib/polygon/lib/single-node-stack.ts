import * as cdk from "aws-cdk-lib";
import * as cdkConstructs from "constructs";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as iam from "aws-cdk-lib/aws-iam";
import * as s3Assets from "aws-cdk-lib/aws-s3-assets";
import * as path from "path";
import * as fs from "fs";
import * as nodeCwDashboard from "./assets/node-cw-dashboard"
import * as cw from 'aws-cdk-lib/aws-cloudwatch';
import { SingleNodeConstruct } from "../../constructs/single-node"
import * as configTypes from "./config/polygonConfig.interface";
import { PolygonNodeSecurityGroupConstruct } from "./constructs/polygon-rpc-node-security-group"
import * as constants from "../../constructs/constants";
import * as nag from "cdk-nag";

export interface PolygonSingleNodeStackProps extends cdk.StackProps {
    polygonClientCombination: configTypes.PolygonClientCombination;
    network: configTypes.PolygonNetwork;
    instanceType: ec2.InstanceType;
    instanceCpuType: ec2.AmazonLinuxCpuType;
    dataVolumes: configTypes.PolygonDataVolumeConfig[];
}

export class PolygonSingleNodeStack extends cdk.Stack {
    constructor(scope: cdkConstructs.Construct, id: string, props: PolygonSingleNodeStackProps) {
        super(scope, id, props);

        // Setting up necessary environment variables
        const REGION = cdk.Stack.of(this).region;
        const STACK_NAME = cdk.Stack.of(this).stackName;
        const availabilityZones = cdk.Stack.of(this).availabilityZones;
        const chosenAvailabilityZone = availabilityZones.slice(0, 1)[0];

        // Getting our config from initialization properties
        const { 
            instanceType,
            polygonClientCombination,
            network,
            instanceCpuType, 
            dataVolumes,
        } = props;

        // Using default VPC
        const vpc = ec2.Vpc.fromLookup(this, "vpc", { isDefault: true });

        // Setting up the security group for the node from Polygon-specific construct
        const instanceSG = new PolygonNodeSecurityGroupConstruct (this, "security-group", {
            vpc: vpc,
            clientCombination: polygonClientCombination,
        })

        // Making our scripts and configis from the local "assets" directory available for instance to download
        const asset = new s3Assets.Asset(this, "assets", {
            path: path.join(__dirname, "assets"),
        });

        // Getting the snapshot bucket name and IAM role ARN from the common stack
        const importedInstanceRoleArn = cdk.Fn.importValue("PolygonNodeInstanceRoleArn");
        const snapshotBucketName = cdk.Fn.importValue("PolygonNodeSnapshotBucketName");

        const instanceRole = iam.Role.fromRoleArn(this, "iam-role", importedInstanceRoleArn);

        // Making sure our instance will be able to read the assets
        asset.bucket.grantRead(instanceRole);

        // Setting up the node using generic Single Node constract
        const syncNode = new SingleNodeConstruct(this, "sync-node", {
            instanceName: STACK_NAME,
            instanceType,
            dataVolumes,
            machineImage: new ec2.AmazonLinuxImage({
                generation: ec2.AmazonLinuxGeneration.AMAZON_LINUX_2,
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
        const syncNodeStartScript = fs.readFileSync(path.join(__dirname, "assets", "user-data", "rpc-node-start.sh")).toString();

        const modifiedInitNodeScript = cdk.Fn.sub(syncNodeStartScript, {
            _LIFECYCLE_HOOK_NAME_: constants.NoneValue,
            _AUTOSCALING_GROUP_NAME_: constants.NoneValue,
            _ASSETS_S3_PATH_: `s3://${asset.s3BucketName}/${asset.s3ObjectKey}`,
            _REGION_: REGION,
            _SNAPSHOT_S3_PATH_: `s3://${snapshotBucketName}/${polygonClientCombination}-${network}`,
            _CLIENT_COMBINATION_: polygonClientCombination,
            _STACK_NAME_: STACK_NAME,
            _FORMAT_DISK_: "true",
            _DATA_VOLUME_TYPE_: dataVolumes[0].type,
            _NETWORK_: network
        });
        syncNode.instance.addUserData(modifiedInitNodeScript);

        // Adding CloudWatch dashboard to the node
        const dashboardString = cdk.Fn.sub(JSON.stringify(nodeCwDashboard.SyncNodeCWDashboardJSON), {
            INSTANCE_ID:syncNode.instanceId,
            INSTANCE_NAME: STACK_NAME,
            REGION: REGION,
        })
                
        new cw.CfnDashboard(this, 'sync-cw-dashboard', {
            dashboardName: STACK_NAME,
            dashboardBody: dashboardString,
        });

        new cdk.CfnOutput(this, "sync-instance-id", {
            value: syncNode.instanceId,
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
