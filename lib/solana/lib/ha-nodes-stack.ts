import * as cdk from "aws-cdk-lib";
import * as cdkConstructs from "constructs";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as iam from "aws-cdk-lib/aws-iam";
import * as s3Assets from "aws-cdk-lib/aws-s3-assets";
import * as nag from "cdk-nag";
import * as path from "path";
import * as fs from "fs";
import * as configTypes from "./config/node-config.interface";
import { NodeSecurityGroupConstruct } from "./constructs/node-security-group"
import { HANodesConstruct } from "../../constructs/ha-rpc-nodes-with-alb"
import * as constants from "../../constructs/constants";

export interface SolanaHANodesStackProps extends cdk.StackProps {
    instanceType: ec2.InstanceType;
    instanceCpuType: ec2.AmazonLinuxCpuType;
    solanaCluster: configTypes.SolanaCluster;
    solanaVersion: string;
    nodeConfiguration: configTypes.SolanaNodeConfiguration;
    dataVolume: configTypes.SolanaDataVolumeConfig;
    accountsVolume: configTypes.SolanaAccountsVolumeConfig;

    albHealthCheckGracePeriodMin: number;
    heartBeatDelayMin: number;
    numberOfNodes: number;

    limitOutTrafficMbps: number;
}

export class SolanaHANodesStack extends cdk.Stack {
    constructor(scope: cdkConstructs.Construct, id: string, props: SolanaHANodesStackProps) {
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
            solanaCluster,
            solanaVersion,
            nodeConfiguration,
            dataVolume,
            accountsVolume,
            albHealthCheckGracePeriodMin,
            heartBeatDelayMin,
            numberOfNodes,
            limitOutTrafficMbps,
        } = props;

        // Using default VPC
        const vpc = ec2.Vpc.fromLookup(this, "vpc", { isDefault: true });

        // Setting up the security group for the node from Solana-specific construct
        const instanceSG = new NodeSecurityGroupConstruct(this, "security-group", {
            vpc: vpc,
        })

        // Making our scripts and configis from the local "assets" directory available for instance to download
        const asset = new s3Assets.Asset(this, "assets", {
            path: path.join(__dirname, "assets"),
        });

        // Getting the IAM role ARN from the common stack
        const importedInstanceRoleArn = cdk.Fn.importValue("SolanaNodeInstanceRoleArn");

        const instanceRole = iam.Role.fromRoleArn(this, "iam-role", importedInstanceRoleArn);

        // Making sure our instance will be able to read the assets
        asset.bucket.grantRead(instanceRole);

        // Use Ubuntu 24.04 LTS image for amd64. Find more: https://discourse.ubuntu.com/t/finding-ubuntu-images-with-the-aws-ssm-parameter-store/15507
        let ubuntuStableImageSsmName = "/aws/service/canonical/ubuntu/server/24.04/stable/current/amd64/hvm/ebs-gp3/ami-id"
        // Setting up the node using generic Single Node constract
        if (instanceCpuType === ec2.AmazonLinuxCpuType.ARM_64) {
            ubuntuStableImageSsmName = "/aws/service/canonical/ubuntu/server/24.04/stable/current/arm64/hvm/ebs-gp3/ami-id"
        }

        // Parsing user data script and injecting necessary variables
        const nodeScript = fs.readFileSync(path.join(__dirname, "assets", "user-data-ubuntu.sh")).toString();
        const accountsVolumeSizeBytes = accountsVolume.sizeGiB * constants.GibibytesToBytesConversionCoefficient;
        const dataVolumeSizeBytes = dataVolume.sizeGiB * constants.GibibytesToBytesConversionCoefficient;

        const modifiedInitNodeScript = cdk.Fn.sub(nodeScript, {
            _AWS_REGION_: REGION,
            _ASSETS_S3_PATH_: `s3://${asset.s3BucketName}/${asset.s3ObjectKey}`,
            _STACK_NAME_: STACK_NAME,
            _STACK_ID_: constants.NoneValue,
            _NODE_CF_LOGICAL_ID_: constants.NoneValue,
            _ACCOUNTS_VOLUME_TYPE_: accountsVolume.type,
            _ACCOUNTS_VOLUME_SIZE_: accountsVolumeSizeBytes.toString(),
            _DATA_VOLUME_TYPE_: dataVolume.type,
            _DATA_VOLUME_SIZE_: dataVolumeSizeBytes.toString(),
            _SOLANA_VERSION_: solanaVersion,
            _SOLANA_NODE_TYPE_: nodeConfiguration,
            _NODE_IDENTITY_SECRET_ARN_: constants.NoneValue,
            _VOTE_ACCOUNT_SECRET_ARN_: constants.NoneValue,
            _AUTHORIZED_WITHDRAWER_ACCOUNT_SECRET_ARN_: constants.NoneValue,
            _REGISTRATION_TRANSACTION_FUNDING_ACCOUNT_SECRET_ARN_: constants.NoneValue,
            _SOLANA_CLUSTER_: solanaCluster,
            _LIFECYCLE_HOOK_NAME_: lifecycleHookName,
            _ASG_NAME_: autoScalingGroupName,
            _LIMIT_OUT_TRAFFIC_: limitOutTrafficMbps.toString(),
        });

        // Setting up the nodse using generic High Availability (HA) Node constract
        const healthCheckPath = "/health";
        const rpcNodes = new HANodesConstruct(this, "rpc-nodes", {
            instanceType,
            dataVolumes: [accountsVolume, dataVolume],
            rootDataVolumeDeviceName: "/dev/sda1",
            machineImage: ec2.MachineImage.fromSsmParameter(ubuntuStableImageSsmName),
            role: instanceRole,
            vpc,
            securityGroup: instanceSG.securityGroup,
            userData: modifiedInitNodeScript,
            numberOfNodes,
            rpcPortForALB: 8899,
            albHealthCheckGracePeriodMin,
            healthCheckPath,
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
                {
                    id: "AwsSolutions-IAM5",
                    reason: "Need read access to the S3 bucket with assets",
                },
            ],
            true
        );
    }
}
