import * as cdk from "aws-cdk-lib";
import * as cdkConstructs from "constructs";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as iam from "aws-cdk-lib/aws-iam";
import * as s3Assets from "aws-cdk-lib/aws-s3-assets";
import * as nag from "cdk-nag";
import * as path from "path";
import * as fs from "fs";
import * as config from "./config/polygonConfig.interface";
import * as configTypes from "./config/polygonConfig.interface";
import { PolygonNodeSecurityGroupConstruct } from "./constructs/polygon-rpc-node-security-group"
import { HANodesConstruct } from "../../constructs/ha-rpc-nodes-with-alb"

export interface PolygonRpcNodesStackProps extends cdk.StackProps {
    polygonClientCombination: config.PolygonClientCombination;
    network: configTypes.PolygonNetwork;
    instanceType: ec2.InstanceType;
    instanceCpuType: ec2.AmazonLinuxCpuType;
    dataVolumes: config.PolygonDataVolumeConfig[],
    numberOfNodes: number;
    albHealthCheckGracePeriodMin: number;
    heartBeatDelayMin: number;
}

export class PolygonRpcNodesStack extends cdk.Stack {
    constructor(scope: cdkConstructs.Construct, id: string, props: PolygonRpcNodesStackProps) {
        super(scope, id, props);

        // Setting up necessary environment variables
        const REGION = cdk.Stack.of(this).region;
        const STACK_NAME = cdk.Stack.of(this).stackName;
        const lifecycleHookName = STACK_NAME;
        const autoScalingGroupName = STACK_NAME;

        // Getting our config from initialization properties
        const {
            instanceType,
            polygonClientCombination,
            network,
            instanceCpuType,
            dataVolumes,
            albHealthCheckGracePeriodMin,
            heartBeatDelayMin,
            numberOfNodes,
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

        // Parsing user data script and injecting necessary variables
        const nodeScript = fs.readFileSync(path.join(__dirname, "assets", "user-data", "rpc-node-start.sh")).toString();

        const modifiedInitNodeScript = cdk.Fn.sub(nodeScript, {
            _LIFECYCLE_HOOK_NAME_: lifecycleHookName,
            _AUTOSCALING_GROUP_NAME_: autoScalingGroupName,
            _ASSETS_S3_PATH_: `s3://${asset.s3BucketName}/${asset.s3ObjectKey}`,
            _REGION_: REGION,
            _SNAPSHOT_S3_PATH_: `s3://${snapshotBucketName}/${polygonClientCombination}-${network}`,
            _CLIENT_COMBINATION_: polygonClientCombination,
            _STACK_NAME_: STACK_NAME,
            _FORMAT_DISK_: "true",
            _DATA_VOLUME_TYPE_: dataVolumes[0].type,
            _NETWORK_: network
        });

        // Setting up the nodse using generic High Availability (HA) Node constract
        const rpcNodes = new HANodesConstruct (this, "rpc-nodes", {
            instanceType,
            dataVolumes,
            machineImage: new ec2.AmazonLinuxImage({
                generation: ec2.AmazonLinuxGeneration.AMAZON_LINUX_2,
                cpuType: instanceCpuType,
            }),
            role: instanceRole,
            vpc,
            securityGroup: instanceSG.securityGroup,
            userData: modifiedInitNodeScript,
            numberOfNodes,
            rpcPortForALB: 8545,
            albHealthCheckGracePeriodMin,
            heartBeatDelayMin,
            lifecycleHookName: lifecycleHookName,
            autoScalingGroupName: autoScalingGroupName,
        });

        // Making sure we output the URL of our Applicaiton Load Balancer
        new cdk.CfnOutput(this, "alb-url", {
            value: rpcNodes.loadBalancerDnsName,
        });

        // Adding suppressions to the stack
        nag.NagSuppressions.addResourceSuppressions(
            this,
            [
                {
                    id: "AwsSolutions-AS3",
                    reason: "No notifications needed",
                },
                {
                    id: "AwsSolutions-S1",
                    reason: "No access log needed for ALB logs bucket",
                },
                {
                    id: "AwsSolutions-EC28",
                    reason: "Using basic monitoring to save costs",
                },
            ],
            true
        );
    }
}
