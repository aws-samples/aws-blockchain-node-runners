import * as cdk from "aws-cdk-lib";
import * as cdkConstructs from "constructs";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as iam from "aws-cdk-lib/aws-iam";
import * as s3Assets from "aws-cdk-lib/aws-s3-assets";
import * as nag from "cdk-nag";
import * as path from "path";
import * as fs from "fs";
import * as configTypes from "./config/stacksConfig.interface";
import { StacksNodeSecurityGroupConstruct } from "./constructs/stacks-node-security-group"
import { HANodesConstruct } from "../../constructs/ha-rpc-nodes-with-alb"
import * as constants from "../../constructs/constants";

export interface StacksHANodesStackProps extends cdk.StackProps, configTypes.StacksBaseNodeConfig, configTypes.StacksHAConfig {
    // instanceType: ec2.InstanceType;
    // instanceCpuType: ec2.AmazonLinuxCpuType;
    // stacksCluster: configTypes.StacksCluster;
    // stacksVersion: string;
    // nodeConfiguration: configTypes.StacksNodeConfiguration;
    // dataVolume: configTypes.StacksDataVolumeConfig;
    // accountsVolume: configTypes.StacksAccountsVolumeConfig;
    // albHealthCheckGracePeriodMin: number;
    // heartBeatDelayMin: number;
    // numberOfNodes: number;
}

export class StacksHANodesStack extends cdk.Stack {
    constructor(scope: cdkConstructs.Construct, id: string, props: StacksHANodesStackProps) {
        super(scope, id, props);

        // // Setting up necessary environment variables
        // const REGION = cdk.Stack.of(this).region;
        // const STACK_NAME = cdk.Stack.of(this).stackName;
        // const lifecycleHookName = STACK_NAME;
        // const autoScalingGroupName = STACK_NAME;

        // // Getting our config from initialization properties
        // const {
        //     instanceType,
        //     instanceCpuType,
        //     stacksCluster,
        //     stacksVersion,
        //     nodeConfiguration,
        //     dataVolume,
        //     accountsVolume,
        //     albHealthCheckGracePeriodMin,
        //     heartBeatDelayMin,
        //     numberOfNodes,
        // } = props;

        // // Using default VPC
        // const vpc = ec2.Vpc.fromLookup(this, "vpc", { isDefault: true });

        // // Setting up the security group for the node from Stacks-specific construct
        // const instanceSG = new StacksNodeSecurityGroupConstruct (this, "security-group", {
        //     vpc: vpc,
        // })

        // // Making our scripts and configis from the local "assets" directory available for instance to download
        // const asset = new s3Assets.Asset(this, "assets", {
        //     path: path.join(__dirname, "assets"),
        // });

        // // Getting the IAM role ARN from the common stack
        // const importedInstanceRoleArn = cdk.Fn.importValue("StacksNodeInstanceRoleArn");

        // const instanceRole = iam.Role.fromRoleArn(this, "iam-role", importedInstanceRoleArn);

        // // Making sure our instance will be able to read the assets
        // asset.bucket.grantRead(instanceRole);

        // // Checking configuration
        // if (instanceCpuType === ec2.AmazonLinuxCpuType.ARM_64) {
        //     throw new Error("ARM_64 is not yet supported");
        // }

        // if (nodeConfiguration === "consensus") {
        //     throw new Error("Consensus node configuration is not yet supported for HA setup");
        // }

        // // Use Ubuntu 20.04 LTS image for amd64. Find more: https://discourse.ubuntu.com/t/finding-ubuntu-images-with-the-aws-ssm-parameter-store/15507
        // const ubuntu204stableImageSsmName = "/aws/service/canonical/ubuntu/server/20.04/stable/current/amd64/hvm/ebs-gp2/ami-id"

        // // Parsing user data script and injecting necessary variables
        // const nodeScript = fs.readFileSync(path.join(__dirname, "assets", "user-data", "node.sh")).toString();
        // const accountsVolumeSizeBytes = accountsVolume.sizeGiB * constants.GibibytesToBytesConversionCoefficient;
        // const dataVolumeSizeBytes = dataVolume.sizeGiB * constants.GibibytesToBytesConversionCoefficient;

        // const modifiedInitNodeScript = cdk.Fn.sub(nodeScript, {
        //     _AWS_REGION_: REGION,
        //     _ASSETS_S3_PATH_: `s3://${asset.s3BucketName}/${asset.s3ObjectKey}`,
        //     _STACK_NAME_: STACK_NAME,
        //     _STACK_ID_: constants.NoneValue,
        //     _NODE_CF_LOGICAL_ID_: constants.NoneValue,
        //     // _ACCOUNTS_VOLUME_TYPE_: accountsVolume.type,
        //     // _ACCOUNTS_VOLUME_SIZE_: accountsVolumeSizeBytes.toString(),
        //     // _DATA_VOLUME_TYPE_: dataVolume.type,
        //     // _DATA_VOLUME_SIZE_: dataVolumeSizeBytes.toString(),
        //     _STACKS_VERSION_: stacksVersion,
        //     _STACKS_NODE_CONFIGURATION_: nodeConfiguration,
        //     _SIGNER_PRIVATE_KEY_SECRET_ARN_: constants.NoneValue,
        //     _MINER_PRIVATE_KEY_SECRET_ARN_: constants.NoneValue,
        //     _STACKS_CHAINSTATE_ARCHIVE_:
        //     // _LIFECYCLE_HOOK_NAME_: lifecycleHookName,
        //     // _ASG_NAME_: autoScalingGroupName,
        // });

        // # Setup environment variables provided by from CDK template on local machine.
        // echo "STACKS_CHAINSTATE_ARCHIVE=${_STACKS_CHAINSTATE_ARCHIVE_}"
        // echo "LIFECYCLE_HOOK_NAME=${_LIFECYCLE_HOOK_NAME_}" >> /etc/environment
        // echo "ASG_NAME=${_ASG_NAME_}" >> /etc/environment
        // echo "STACKS_CHAINSTATE_ARCHIVE=${_STACKS_CHAINSTATE_ARCHIVE_}" >> /etc/environment

        // // Setting up the node using generic High Availability (HA) Node constract
        // const healthCheckPath = "/health";
        // const rpcNodes = new HANodesConstruct (this, "rpc-nodes", {
        //     instanceType,
        //     dataVolumes: [dataVolume, accountsVolume],
        //     rootDataVolumeDeviceName: "/dev/sda1",
        //     machineImage: ec2.MachineImage.fromSsmParameter(ubuntu204stableImageSsmName),
        //     role: instanceRole,
        //     vpc,
        //     securityGroup: instanceSG.securityGroup,
        //     userData: modifiedInitNodeScript,
        //     numberOfNodes,
        //     rpcPortForALB: 8899,
        //     albHealthCheckGracePeriodMin,
        //     healthCheckPath,
        //     heartBeatDelayMin,
        //     lifecycleHookName: lifecycleHookName,
        //     autoScalingGroupName: autoScalingGroupName,
        // });

        // // Making sure we output the URL of our Applicaiton Load Balancer
        // new cdk.CfnOutput(this, "alb-url", {
        //     value: rpcNodes.loadBalancerDnsName,
        // });

        // // Adding suppressions to the stack
        // nag.NagSuppressions.addResourceSuppressions(
        //     this,
        //     [
        //         {
        //             id: "AwsSolutions-AS3",
        //             reason: "No notifications needed",
        //         },
        //         {
        //             id: "AwsSolutions-S1",
        //             reason: "No access log needed for ALB logs bucket",
        //         },
        //         {
        //             id: "AwsSolutions-EC28",
        //             reason: "Using basic monitoring to save costs",
        //         },
        //         {
        //             id: "AwsSolutions-IAM5",
        //             reason: "Need read access to the S3 bucket with assets",
        //         },
        //     ],
        //     true
        // );
    }
}
