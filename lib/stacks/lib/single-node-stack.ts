import * as cdk from "aws-cdk-lib";
import * as cdkConstructs from "constructs";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as iam from "aws-cdk-lib/aws-iam";
import * as s3Assets from "aws-cdk-lib/aws-s3-assets";
import * as path from "path";
import * as fs from "fs";
import * as nodeCwDashboard from "./constructs/node-cw-dashboard"
import * as cw from 'aws-cdk-lib/aws-cloudwatch';
import * as nag from "cdk-nag";
import { SingleNodeConstruct } from "../../constructs/single-node"
import * as configTypes from "./config/stacksConfig.interface";
import * as constants from "../../constructs/constants";
import { StacksNodeSecurityGroupConstruct } from "./constructs/stacks-node-security-group"

export interface StacksSingleNodeStackProps extends cdk.StackProps, configTypes.StacksBaseNodeConfig {
}

export class StacksSingleNodeStack extends cdk.Stack {
    constructor(scope: cdkConstructs.Construct, id: string, props: StacksSingleNodeStackProps) {
        super(scope, id, props);

        // Setting up necessary environment variables
        const REGION = cdk.Stack.of(this).region;
        const STACK_NAME = cdk.Stack.of(this).stackName;
        const STACK_ID = cdk.Stack.of(this).stackId;
        const availabilityZones = cdk.Stack.of(this).availabilityZones;
        const chosenAvailabilityZone = availabilityZones.slice(0, 1)[0];

        // Getting our config from initialization properties
        const {
            // Instance configuration
            instanceType,
            stacksNetwork,
            stacksVersion,
            stacksNodeConfiguration,
            buildFromSource,
            downloadChainstate,
            // Stacks networking
            stacksBootstrapNode,
            stacksChainstateArchive,
            stacksP2pPort,
            stacksRpcPort,
            // Bitcoin networking
            bitcoinPeerHost,
            bitcoinRpcUsername,
            bitcoinRpcPassword,
            bitcoinP2pPort,
            bitcoinRpcPort,
            // CDK resources
            stacksSignerSecretArn,
            stacksMinerSecretArn,
            dataVolume,
        } = props;

        // Using default VPC
        const vpc = ec2.Vpc.fromLookup(this, "vpc", { isDefault: true });

        // Setting up the security group for the node from Stacks-specific construct
        const instanceSG = new StacksNodeSecurityGroupConstruct (this, "security-group", {
            vpc: vpc,
            stacksRpcPort: stacksRpcPort,
            stacksP2pPort: stacksP2pPort,
        })

        // Making our scripts and configis from the local "assets" directory available for instance to download
        const asset = new s3Assets.Asset(this, "assets", {
            path: path.join(__dirname, "assets"),
        });

        // Getting the IAM role ARN from the common stack
        const importedInstanceRoleArn = cdk.Fn.importValue("StacksNodeInstanceRoleArn");

        const instanceRole = iam.Role.fromRoleArn(this, "iam-role", importedInstanceRoleArn);

        // Making sure our instance will be able to read the assets
        asset.bucket.grantRead(instanceRole);

        if (stacksNodeConfiguration === "miner" || stacksNodeConfiguration === "signer") {
            throw new Error(`{stacksNodeConfiguration} node configuration is not yet supported.`);
        }

        const node = new SingleNodeConstruct(this, "sync-node", {
            instanceName: STACK_NAME,
            instanceType,
            dataVolumes: [dataVolume],
            rootDataVolumeDeviceName: "/dev/xvda",
            machineImage: ec2.MachineImage.latestAmazonLinux2023(),
            vpc,
            availabilityZone: chosenAvailabilityZone,
            role: instanceRole,
            securityGroup: instanceSG.securityGroup,
            vpcSubnets: {
                subnetType: ec2.SubnetType.PUBLIC,
            },
        });

        // Parsing user data script and injecting necessary variables
        const nodeStartScript = fs.readFileSync(path.join(__dirname, "assets", "user-data", "node.sh")).toString();
        const dataVolumeSizeBytes = dataVolume.sizeGiB * constants.GibibytesToBytesConversionCoefficient;

        const modifiedInitNodeScript = cdk.Fn.sub(nodeStartScript, {
            _AWS_REGION_: REGION,
            _STACK_NAME_: STACK_NAME,
            _STACK_ID_: STACK_ID,
            _NODE_CF_LOGICAL_ID_: node.nodeCFLogicalId,
            _STACKS_VERSION_: stacksVersion,
            _STACKS_NODE_CONFIGURATION_: stacksNodeConfiguration,
            _STACKS_NETWORK_: stacksNetwork === "testnet"
                ? "xenon"
                : stacksNetwork,
            _STACKS_BOOTSTRAP_NODE_: stacksBootstrapNode,
            _STACKS_CHAINSTATE_ARCHIVE_: stacksChainstateArchive,
            _STACKS_P2P_PORT_: stacksP2pPort.toString(),
            _STACKS_RPC_PORT_: stacksRpcPort.toString(),
            _BITCOIN_PEER_HOST_: bitcoinPeerHost,
            _BITCOIN_RPC_USERNAME_: bitcoinRpcUsername,
            _BITCOIN_RPC_PASSWORD_: bitcoinRpcPassword,
            _BITCOIN_P2P_PORT_: bitcoinP2pPort.toString(),
            _BITCOIN_RPC_PORT_: bitcoinRpcPort.toString(),
            _STACKS_SIGNER_SECRET_ARN_: stacksSignerSecretArn,
            _STACKS_MINER_SECRET_ARN_: stacksMinerSecretArn,
            _DATA_VOLUME_TYPE_: dataVolume.type,
            _DATA_VOLUME_SIZE_: dataVolumeSizeBytes.toString(),
            _ASSETS_S3_PATH_: `s3://${asset.s3BucketName}/${asset.s3ObjectKey}`,
            _LIFECYCLE_HOOK_NAME_: constants.NoneValue,
            _ASG_NAME_: constants.NoneValue,
            _BUILD_FROM_SOURCE_: buildFromSource.toString(),
            _DOWNLOAD_CHAINSTATE_: downloadChainstate.toString(),
        });
        node.instance.addUserData(modifiedInitNodeScript);

        // Adding CloudWatch dashboard to the node
        const dashboardString = cdk.Fn.sub(JSON.stringify(nodeCwDashboard.SingleNodeCWDashboardJSON), {
            INSTANCE_ID: node.instanceId,
            INSTANCE_NAME: STACK_NAME,
            REGION: REGION,
        })

        new cw.CfnDashboard(this, 'stacks-cw-dashboard', {
            dashboardName: `${STACK_NAME}-${node.instanceId}`,
            dashboardBody: dashboardString,
        });

        new cdk.CfnOutput(this, "node-instance-id", {
            value: node.instanceId,
        });

        new cdk.CfnOutput(this, "region", {
            value: REGION,
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
