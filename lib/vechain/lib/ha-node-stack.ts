import * as cdk from "aws-cdk-lib";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as s3Assets from "aws-cdk-lib/aws-s3-assets";
import * as nag from "cdk-nag";
import * as cdkConstructs from "constructs";
import * as fs from "fs";
import * as path from "path";
import * as constants from "../../constructs/constants";
import { HANodesConstruct } from "../../constructs/ha-rpc-nodes-with-alb";
import { VETNodeSecurityGroupConstruct } from "./constructs/vet-node-security-group";
import { VetSingleNodeStackProps } from "./single-node-stack";

export interface VetHaNodeStackProps extends VetSingleNodeStackProps {
    albHealthCheckGracePeriodMin: number;
    heartBeatDelayMin: number;
    numberOfNodes: number;
}

export class VETHaNodeStack extends cdk.Stack {
    constructor(scope: cdkConstructs.Construct, id: string, props: VetHaNodeStackProps) {
        super(scope, id, props);

        // Setting up necessary environment variables
        const REGION = cdk.Stack.of(this).region;
        const STACK_NAME = cdk.Stack.of(this).stackName;
        const lifecycleHookName = STACK_NAME;
        const autoScalingGroupName = STACK_NAME;

        // Getting our config from initialization properties
        const {
            instanceType,
            instanceCpuType,
            syncFromPublicSnapshot,
            vetNodeType,
            dataVolume,
            network,
            vetContainerImage,
            instanceRole,
            albHealthCheckGracePeriodMin,
            heartBeatDelayMin,
            numberOfNodes
        } = props;

        if (vetNodeType !== "public") {
            cdk.Annotations.of(this).addError("HA nodes are only supported for public nodes. Set VET_NODE_TYPE='public' in the .env file.");
        }

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

        // Parsing user data script and injecting necessary variables
        const userData = fs.readFileSync(path.join(__dirname, "assets", "instance", "node", "userdata.sh")).toString();

        const modifiedUserData = cdk.Token.asString(
            cdk.Lazy.string({
                produce: () => {
                    return userData
                        .replaceAll("_AWS_REGION_", REGION)
                        .replaceAll("_ASSETS_S3_PATH_", `s3://${asset.s3BucketName}/${asset.s3ObjectKey}`)
                        .replaceAll("_STACK_NAME_", STACK_NAME)
                        .replaceAll("_NODE_CF_LOGICAL_ID_", constants.NoneValue)
                        .replaceAll("_DATA_VOLUME_TYPE_", dataVolume.type)
                        .replaceAll("_NETWORK_", network)
                        .replaceAll("_VET_NODE_TYPE_", vetNodeType)
                        .replaceAll("_VET_CONTAINER_IMAGE_", vetContainerImage)
                        .replaceAll("_LIFECYCLE_HOOK_NAME_", lifecycleHookName)
                        .replaceAll("_ASG_NAME_", autoScalingGroupName)
                        .replaceAll("_SYNC_FROM_PUBLIC_SNAPSHOT_", syncFromPublicSnapshot.toString())
                }
            })
        );

        const nodeASG = new HANodesConstruct(this, "ha-node", {
            instanceType,
            dataVolumes: [dataVolume],
            rootDataVolumeDeviceName: "/dev/xvda",
            machineImage: new ec2.AmazonLinuxImage({
                generation: ec2.AmazonLinuxGeneration.AMAZON_LINUX_2,
                cpuType: instanceCpuType
            }),
            vpc,
            role: instanceRole,
            securityGroup: instanceSG.securityGroup,
            userData: modifiedUserData,
            numberOfNodes,
            albHealthCheckGracePeriodMin,
            healthCheckPath: "/admin/health", // Only accessible from internal IPs
            heartBeatDelayMin,
            lifecycleHookName: lifecycleHookName,
            autoScalingGroupName: autoScalingGroupName,
            rpcPortForALB: 80,
            healthCheckPort: 2113
        });

        // Making sure we output the URL of our Application Load Balancer
        new cdk.CfnOutput(this, "alb-url", {
            value: nodeASG.loadBalancerDnsName
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
