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

export interface StacksHANodesStackProps extends cdk.StackProps, configTypes.StacksHAConfig {
}

export class StacksHANodesStack extends cdk.Stack {
    constructor(scope: cdkConstructs.Construct, id: string, props: StacksHANodesStackProps) {
        super(scope, id, props);

        // Setting up necessary environment variables
        const REGION = cdk.Stack.of(this).region;
        const STACK_NAME = cdk.Stack.of(this).stackName;
        const lifecycleHookName = STACK_NAME;
        const autoScalingGroupName = STACK_NAME;

        // Getting our config from initialization properties
        const {
            // Instance configuration
            instanceType,
            stacksNetwork,
            stacksVersion,
            stacksNodeConfiguration,
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
            // High availability
            albHealthCheckGracePeriodMin,
            heartBeatDelayMin,
            numberOfNodes,
            // Ssh access for debugging. TODO: delete before merge to upstream repo.
            debugKeyName,
        } = props;

        // Using default VPC
        const vpc = ec2.Vpc.fromLookup(this, "vpc", { isDefault: true });

        // Setting up the security group for the node from Stacks-specific construct
        const instanceSG = new StacksNodeSecurityGroupConstruct (this, "security-group", {
            vpc: vpc,
            stacksRpcPort: stacksRpcPort,
            stacksP2pPort: stacksP2pPort,
            isAllowSshAccess: !!(debugKeyName),
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
            throw new Error(`{stacksNodeConfiguration} node configuration is not yet supported HA setup.`);
        }

        // Parsing user data script and injecting necessary variables
        const nodeScript = fs.readFileSync(path.join(__dirname, "assets", "user-data", "node.sh")).toString();
        const dataVolumeSizeBytes = dataVolume.sizeGiB * constants.GibibytesToBytesConversionCoefficient;

        const modifiedInitNodeScript = cdk.Fn.sub(nodeScript, {
            _AWS_REGION_: REGION,
            _ASSETS_S3_PATH_: `s3://${asset.s3BucketName}/${asset.s3ObjectKey}`,
            _STACK_NAME_: STACK_NAME,
            _STACK_ID_: constants.NoneValue,
            _NODE_CF_LOGICAL_ID_: constants.NoneValue,
            _STACKS_VERSION_: stacksVersion,
            _STACKS_NODE_CONFIGURATION_: stacksNodeConfiguration,
            _STACKS_NETWORK_:stacksNetwork === "testnet"
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
            _LIFECYCLE_HOOK_NAME_: lifecycleHookName,
            _ASG_NAME_: autoScalingGroupName,
        });

        // Path on the rpc port that will return a successful status code when the node
        // is healthy.
        const healthCheckPath = "/v2/info";

        // Setting up the node using generic High Availability (HA) Node constract
        const rpcNodes = new HANodesConstruct(this, "rpc-nodes", {
            instanceType,
            dataVolumes: [dataVolume],
            rootDataVolumeDeviceName: "/dev/xvda",
            machineImage: ec2.MachineImage.latestAmazonLinux2023(),
            role: instanceRole,
            vpc,
            securityGroup: instanceSG.securityGroup,
            userData: modifiedInitNodeScript,
            numberOfNodes,
            rpcPortForALB: stacksRpcPort,
            albHealthCheckGracePeriodMin,
            healthCheckPath,
            heartBeatDelayMin,
            lifecycleHookName: lifecycleHookName,
            autoScalingGroupName: autoScalingGroupName,
            // Ssh access for debugging. TODO: delete before merge to upstream repo.
            debugKeyName: debugKeyName
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
