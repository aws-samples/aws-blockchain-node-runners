import * as cdk from "aws-cdk-lib";
import * as cdkConstructs from "constructs";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as iam from "aws-cdk-lib/aws-iam";
import * as s3Assets from "aws-cdk-lib/aws-s3-assets";
import * as path from "path";
import * as fs from "fs";
import * as cw from 'aws-cdk-lib/aws-cloudwatch';
import * as nag from "cdk-nag";
import { SingleNodeConstruct } from "../../constructs/single-node"
import * as configTypes from "./config/node-config.interface";
import * as constants from "../../constructs/constants";
import { NodeSecurityGroupConstruct } from "./constructs/node-security-group"
import { SingleNodeCWDashboardJSON } from "./constructs/node-cw-dashboard"

export interface SolanaSingleNodeStackProps extends cdk.StackProps {
    instanceType: ec2.InstanceType;
    instanceCpuType: ec2.AmazonLinuxCpuType;
    solanaCluster: configTypes.SolanaCluster;
    solanaVersion: string;
    nodeConfiguration: configTypes.SolanaNodeConfiguration;
    dataVolume: configTypes.SolanaDataVolumeConfig;
    accountsVolume: configTypes.SolanaAccountsVolumeConfig;
    solanaNodeIdentitySecretARN: string;
    voteAccountSecretARN: string;
    authorizedWithdrawerAccountSecretARN: string;
    registrationTransactionFundingAccountSecretARN: string;
    limitOutTrafficMbps: number;
}

export class SolanaSingleNodeStack extends cdk.Stack {
    constructor(scope: cdkConstructs.Construct, id: string, props: SolanaSingleNodeStackProps) {
        super(scope, id, props);

        // Setting up necessary environment variables
        const REGION = cdk.Stack.of(this).region;
        const STACK_NAME = cdk.Stack.of(this).stackName;
        const STACK_ID = cdk.Stack.of(this).stackId;
        const availabilityZones = cdk.Stack.of(this).availabilityZones;
        const chosenAvailabilityZone = availabilityZones.slice(0, 2)[1];

        // Getting our config from initialization properties
        const {
            instanceType,
            instanceCpuType,
            solanaCluster,
            solanaVersion,
            nodeConfiguration,
            dataVolume,
            accountsVolume,
            solanaNodeIdentitySecretARN,
            voteAccountSecretARN,
            authorizedWithdrawerAccountSecretARN,
            registrationTransactionFundingAccountSecretARN,
            limitOutTrafficMbps,
        } = props;

        // Using default VPC
        const vpc = ec2.Vpc.fromLookup(this, "vpc", { isDefault: true });

        // Setting up the security group for the node from Solana-specific construct
        const instanceSG = new NodeSecurityGroupConstruct (this, "security-group", {
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

        const node = new SingleNodeConstruct(this, "sync-node", {
            instanceName: STACK_NAME,
            instanceType,
            dataVolumes: [accountsVolume, dataVolume],
            rootDataVolumeDeviceName: "/dev/sda1",
            machineImage: ec2.MachineImage.fromSsmParameter(ubuntuStableImageSsmName),
            vpc,
            availabilityZone: chosenAvailabilityZone,
            role: instanceRole,
            securityGroup: instanceSG.securityGroup,
            vpcSubnets: {
                subnetType: ec2.SubnetType.PUBLIC,
            },
        });

        // Parsing user data script and injecting necessary variables
        const nodeStartScript = fs.readFileSync(path.join(__dirname, "assets", "user-data-ubuntu.sh")).toString();
        const accountsVolumeSizeBytes = accountsVolume.sizeGiB * constants.GibibytesToBytesConversionCoefficient;
        const dataVolumeSizeBytes = dataVolume.sizeGiB * constants.GibibytesToBytesConversionCoefficient;

        const modifiedInitNodeScript = cdk.Fn.sub(nodeStartScript, {
            _AWS_REGION_: REGION,
            _ASSETS_S3_PATH_: `s3://${asset.s3BucketName}/${asset.s3ObjectKey}`,
            _STACK_NAME_: STACK_NAME,
            _STACK_ID_: STACK_ID,
            _NODE_CF_LOGICAL_ID_: node.nodeCFLogicalId,
            _ACCOUNTS_VOLUME_TYPE_: accountsVolume.type,
            _ACCOUNTS_VOLUME_SIZE_: accountsVolumeSizeBytes.toString(),
            _DATA_VOLUME_TYPE_: dataVolume.type,
            _DATA_VOLUME_SIZE_: dataVolumeSizeBytes.toString(),
            _SOLANA_VERSION_: solanaVersion,
            _SOLANA_NODE_TYPE_: nodeConfiguration,
            _NODE_IDENTITY_SECRET_ARN_: solanaNodeIdentitySecretARN,
            _VOTE_ACCOUNT_SECRET_ARN_: voteAccountSecretARN,
            _AUTHORIZED_WITHDRAWER_ACCOUNT_SECRET_ARN_: authorizedWithdrawerAccountSecretARN,
            _REGISTRATION_TRANSACTION_FUNDING_ACCOUNT_SECRET_ARN_: registrationTransactionFundingAccountSecretARN,
            _SOLANA_CLUSTER_: solanaCluster,
            _LIFECYCLE_HOOK_NAME_: constants.NoneValue,
            _ASG_NAME_: constants.NoneValue,
            _LIMIT_OUT_TRAFFIC_: limitOutTrafficMbps.toString(),
        });
        node.instance.addUserData(modifiedInitNodeScript);

        // Adding CloudWatch dashboard to the node
        const dashboardString = cdk.Fn.sub(JSON.stringify(SingleNodeCWDashboardJSON), {
            INSTANCE_ID:node.instanceId,
            INSTANCE_NAME: STACK_NAME,
            REGION: REGION,
        })

        new cw.CfnDashboard(this, 'solana-cw-dashboard', {
            dashboardName: `${STACK_NAME}-${node.instanceId}`,
            dashboardBody: dashboardString,
        });

        new cdk.CfnOutput(this, "node-instance-id", {
            value: node.instanceId,
        });

        // Adding suppressions to the stack
        nag.NagSuppressions.addResourceSuppressions(
            this,
            [
                {
                    id: "AwsSolutions-IAM5",
                    reason: "Need read access to the S3 bucket with assets",
                },
            ],
            true
        );
    }
}
