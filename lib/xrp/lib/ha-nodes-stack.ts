import * as cdk from "aws-cdk-lib";
import * as cdkConstructs from "constructs";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as s3Assets from "aws-cdk-lib/aws-s3-assets";
import * as nag from "cdk-nag";
import * as path from "path";
import * as fs from "fs";
import { HANodesConstruct } from "../../constructs/ha-rpc-nodes-with-alb";
import * as constants from "../../constructs/constants";
import { XRPSingleNodeStackProps } from "./single-node-stack";
import { XRPNodeSecurityGroupConstruct } from "./constructs/xrp-node-security-group";

export interface XRPHANodesStackProps extends XRPSingleNodeStackProps {
    albHealthCheckGracePeriodMin: number;
    heartBeatDelayMin: number;
    numberOfNodes: number;
}

export class XRPHANodesStack extends cdk.Stack {
    constructor(scope: cdkConstructs.Construct, id: string, props: XRPHANodesStackProps) {
        super(scope, id, props);

        // Setting up necessary environment variables
        const REGION = cdk.Stack.of(this).region;
        const STACK_NAME = cdk.Stack.of(this).stackName;
        const STACK_ID = cdk.Stack.of(this).stackId;
        const lifecycleHookName = STACK_NAME;
        const autoScalingGroupName = STACK_NAME;

        // Getting our config from initialization properties
        const {
            instanceType,
            instanceCpuType,
            dataVolume: dataVolume,
            stackName,
            hubNetworkID,
            albHealthCheckGracePeriodMin,
            heartBeatDelayMin,
            numberOfNodes
        } = props;

        // Using default VPC
        const vpc = ec2.Vpc.fromLookup(this, "vpc", { isDefault: true });

        // Setting up the security group for the node from Solana-specific construct
        const instanceSG = new XRPNodeSecurityGroupConstruct(this, "security-group", {
            vpc: vpc
        });

        // Making our scripts and configis from the local "assets" directory available for instance to download
        const asset = new s3Assets.Asset(this, "assets", {
            path: path.join(__dirname, "assets")
        });

        const instanceRole = props.instanceRole;

        // Making sure our instance will be able to read the assets
        asset.bucket.grantRead(instanceRole);

        // Setting up the node using generic Single Node constract
        if (instanceCpuType === ec2.AmazonLinuxCpuType.ARM_64) {
            throw new Error("ARM_64 is not yet supported");
        }

        // Parsing user data script and injecting necessary variables
        const nodeStartScript = fs.readFileSync(path.join(__dirname, "assets", "user-data", "node.sh")).toString();
        const dataVolumeSizeBytes = dataVolume.sizeGiB * constants.GibibytesToBytesConversionCoefficient;

        const modifiedInitNodeScript = cdk.Token.asString(
            cdk.Lazy.string({
                produce: () => {
                    return nodeStartScript
                        .replace("_AWS_REGION_", REGION)
                        .replace("_ASSETS_S3_PATH_", `s3://${asset.s3BucketName}/${asset.s3ObjectKey}`)
                        .replace("_STACK_NAME_", STACK_NAME)
                        .replace("_STACK_ID_", STACK_ID)
                        .replace("_NODE_CF_LOGICAL_ID_", constants.NoneValue)
                        .replace("_DATA_VOLUME_TYPE_", dataVolume.type)
                        .replace("_DATA_VOLUME_SIZE_", dataVolumeSizeBytes.toString())
                        .replace("_HUB_NETWORK_ID_", hubNetworkID)
                        .replace("_LIFECYCLE_HOOK_NAME_", lifecycleHookName)
                        .replace("_ASG_NAME_", autoScalingGroupName);
                }
            })
        );

        const healthCheckPath = "/";
        const nodeASG = new HANodesConstruct(this, "stock-server-node", {
            instanceType,
            dataVolumes: [dataVolume],
            rootDataVolumeDeviceName: "/dev/xvda",
            machineImage: new ec2.AmazonLinuxImage({
                generation: ec2.AmazonLinuxGeneration.AMAZON_LINUX_2,
                cpuType: ec2.AmazonLinuxCpuType.X86_64
            }),
            vpc,
            role: instanceRole,
            securityGroup: instanceSG.securityGroup,
            userData: modifiedInitNodeScript,
            numberOfNodes,
            albHealthCheckGracePeriodMin,
            healthCheckPath,
            heartBeatDelayMin,
            lifecycleHookName: lifecycleHookName,
            autoScalingGroupName: autoScalingGroupName,
            rpcPortForALB: 6005
        });


        // Making sure we output the URL of our Applicaiton Load Balancer
        new cdk.CfnOutput(this, "alb-url", {
            value: nodeASG.loadBalancerDnsName
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
                }
            ],
            true
        );
    }
}
