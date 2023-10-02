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
import * as configTypes from "./config/solanaConfig.interface";
import { SolanaNodeSecurityGroupConstruct } from "./constructs/solana-node-security-group"

export interface SolanaSingleNodeStackProps extends cdk.StackProps {
    instanceType: ec2.InstanceType;
    instanceCpuType: ec2.AmazonLinuxCpuType;
    solanaCluster: configTypes.SolanaCluster;
    nodeConfiguration: configTypes.SolanaNodeConfiguration;
    dataVolume: configTypes.SolanaDataVolumeConfig;
    accountsVolume: configTypes.SolanaAccountsVolumeConfig;
    solanaNodeIdentitySecretARN: string;
    voteAccountSecretARN: string;
    authorizedWithdrawerAccountSecretARN: string;
    registrationTransactionFundingAccountSecretARN: string;
}

export class SolanaSingleNodeStack extends cdk.Stack {
    constructor(scope: cdkConstructs.Construct, id: string, props: SolanaSingleNodeStackProps) {
        super(scope, id, props);

        // Setting up necessary environment variables
        const REGION = cdk.Stack.of(this).region;
        const STACK_NAME = cdk.Stack.of(this).stackName;
        const availabilityZones = cdk.Stack.of(this).availabilityZones;
        const chosenAvailabilityZone = availabilityZones.slice(0, 1)[0];

        // Getting our config from initialization properties
        const {
            instanceType,
            instanceCpuType,
            solanaCluster,
            nodeConfiguration,
            dataVolume,
            accountsVolume,
            solanaNodeIdentitySecretARN,
            voteAccountSecretARN,
            authorizedWithdrawerAccountSecretARN,
            registrationTransactionFundingAccountSecretARN,
        } = props;

        // Using default VPC
        const vpc = ec2.Vpc.fromLookup(this, "vpc", { isDefault: true });

        // Setting up the security group for the node from Solana-specific construct
        const instanceSG = new SolanaNodeSecurityGroupConstruct (this, "security-group", {
            vpc: vpc,
        })

        // Making our scripts and configis from the local "assets" directory available for instance to download
        const asset = new s3Assets.Asset(this, "assets", {
            path: path.join(__dirname, "assets"),
        });

        // Getting the snapshot bucket name and IAM role ARN from the common stack
        const importedInstanceRoleArn = cdk.Fn.importValue("SolanaNodeInstanceRoleArn");

        const instanceRole = iam.Role.fromRoleArn(this, "iam-role", importedInstanceRoleArn);

        // Making sure our instance will be able to read the assets
        asset.bucket.grantRead(instanceRole);

        // Setting up the node using generic Single Node constract
        if (instanceCpuType === ec2.AmazonLinuxCpuType.x86_64) {
            throw new Error("ARM64 is not supported");
        }

        // Use Ubuntu 20.04 LTS image for amd64 or arm64. Find more: https://discourse.ubuntu.com/t/finding-ubuntu-images-with-the-aws-ssm-parameter-store/15507
        const ubuntu204stableImageSsmName = instanceCpuType === ec2.AmazonLinuxCpuType.X86_64 ? 
        "/aws/service/canonical/ubuntu/server/20.04/stable/current/amd64/hvm/ebs-gp2/ami-id" :
        "/aws/service/canonical/ubuntu/server/20.04/stable/current/arm64/hvm/ebs-gp2/ami-id";

        const node = new SingleNodeConstruct(this, "sync-node", {
            instanceName: STACK_NAME,
            instanceType,
            dataVolumes: [dataVolume, accountsVolume],
            machineImage: ec2.MachineImage.fromSsmParameter(ubuntu204stableImageSsmName),
            vpc,
            availabilityZone: chosenAvailabilityZone,
            role: instanceRole,
            securityGroup: instanceSG.securityGroup,
            vpcSubnets: {
                subnetType: ec2.SubnetType.PUBLIC,
            },
        });

        // Parsing user data script and injecting necessary variables
        const nodeStartScript = fs.readFileSync(path.join(__dirname, "assets", "user-data", "node-start.sh")).toString();

        const modifiedInitNodeScript = cdk.Fn.sub(nodeStartScript, {
            _ASSETS_S3_PATH_: `s3://${asset.s3BucketName}/${asset.s3ObjectKey}`,
            _REGION_: REGION,
            _STACK_NAME_: STACK_NAME,
            _RESOURCE_ID_: syncNode.nodeCFLogicalId,
            _SNAPSHOT_S3_PATH_: `s3://${snapshotBucketName}/${polygonClientCombination}-${network}`,
            _CLIENT_COMBINATION_: polygonClientCombination,
            _NETWORK_: network,
            _DATA_VOLUME_TYPE_:  dataVolumes[0].type,
            _FORMAT_DISK_: "true",
            
        });
        node.instance.addUserData(modifiedInitNodeScript);

        // Adding CloudWatch dashboard to the node
        const dashboardString = cdk.Fn.sub(JSON.stringify(nodeCwDashboard.SyncNodeCWDashboardJSON), {
            INSTANCE_ID:node.instanceId,
            INSTANCE_NAME: STACK_NAME,
            REGION: REGION,
        })
                
        new cw.CfnDashboard(this, 'solana-cw-dashboard', {
            dashboardName: STACK_NAME,
            dashboardBody: dashboardString,
        });

        new cdk.CfnOutput(this, "node-instance-id", {
            value: node.instanceId,
        });
    }
}
