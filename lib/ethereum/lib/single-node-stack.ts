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
import * as configTypes from "./config/ethConfig.interface";
import { EthNodeSecurityGroupConstruct } from "./constructs/eth-node-security-group"
import * as nag from "cdk-nag";

export interface EthSingleNodeStackProps extends cdk.StackProps {
    ethClientCombination: configTypes.EthClientCombination;
    nodeRole: configTypes.EthNodeRole;
    instanceType: ec2.InstanceType;
    instanceCpuType: ec2.AmazonLinuxCpuType;
    dataVolumes: configTypes.EthDataVolumeConfig[];
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
            nodeRole,
            instanceCpuType,
            dataVolumes,
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
        const snapshotBucketName = cdk.Fn.importValue("NodeSnapshotBucketName");

        const instanceRole = iam.Role.fromRoleArn(this, "iam-role", importedInstanceRoleArn);

        // Making sure our instance will be able to read the assets
        asset.bucket.grantRead(instanceRole);

        // Setting up the node using generic Single Node constract
        const syncNode = new SingleNodeConstruct(this, "single-node", {
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
        const userData = fs.readFileSync(path.join(__dirname, "assets", "user-data", "node.sh")).toString();

        const modifiedUserData = cdk.Fn.sub(userData, {
            _REGION_: REGION,
            _ASSETS_S3_PATH_: `s3://${asset.s3BucketName}/${asset.s3ObjectKey}`,
            _SNAPSHOT_S3_PATH_: `s3://${snapshotBucketName}/${ethClientCombination}`,
            _ETH_CLIENT_COMBINATION_: ethClientCombination,
            _STACK_NAME_: STACK_NAME,
            _AUTOSTART_CONTAINER_: "true",
            _FORMAT_DISK_: "true",
            _NODE_ROLE_:nodeRole,
            _NODE_CF_LOGICAL_ID_: syncNode.nodeCFLogicalId,
            _LIFECYCLE_HOOK_NAME_: "",
            _AUTOSCALING_GROUP_NAME_: "",
        });

        // Adding modified userdata script to the instance prepared fro us by Single Node constract
        syncNode.instance.addUserData(modifiedUserData);

        // Adding CloudWatch dashboard to the node
        const dashboardString = cdk.Fn.sub(JSON.stringify(nodeCwDashboard.SyncNodeCWDashboardJSON), {
            INSTANCE_ID:syncNode.instanceId,
            INSTANCE_NAME: STACK_NAME,
            REGION: REGION,
        })

        new cw.CfnDashboard(this, 'single-cw-dashboard', {
            dashboardName: STACK_NAME,
            dashboardBody: dashboardString,
        });

        new cdk.CfnOutput(this, "single-instance-id", {
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
