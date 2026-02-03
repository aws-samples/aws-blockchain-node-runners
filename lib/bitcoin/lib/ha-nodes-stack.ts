import * as cdk from "aws-cdk-lib";
import * as cdkConstructs from "constructs";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as iam from "aws-cdk-lib/aws-iam";
import * as s3Assets from "aws-cdk-lib/aws-s3-assets";
import * as nag from "cdk-nag";
import * as path from "path";
import * as fs from "fs";
import * as configTypes from "./config/bitcoinConfig.interface";
import { BitcoinNodeSecurityGroupConstruct } from "./constructs/bitcoin-node-security-group";
import { HANodesConstruct } from "../../constructs/ha-rpc-nodes-with-alb";
import * as constants from "../../constructs/constants";

export interface BitcoinHANodesStackProps extends cdk.StackProps {
    instanceType: ec2.InstanceType;
    instanceCpuType: ec2.AmazonLinuxCpuType;
    bitcoinNetwork: configTypes.BitcoinNetwork;
    bitcoinVersion: string;
    nodeConfig: configTypes.BitcoinNodeConfig;
    snapshotConfig: configTypes.BitcoinSnapshotConfig;
    dataVolume: configTypes.BitcoinDataVolumeConfig;
    albHealthCheckGracePeriodMin: number;
    heartBeatDelayMin: number;
    numberOfNodes: number;
}

export class BitcoinHANodesStack extends cdk.Stack {
    constructor(scope: cdkConstructs.Construct, id: string, props: BitcoinHANodesStackProps) {
        super(scope, id, props);

        const REGION = cdk.Stack.of(this).region;
        const STACK_NAME = cdk.Stack.of(this).stackName;
        const lifecycleHookName = STACK_NAME;
        const autoScalingGroupName = STACK_NAME;

        const {
            instanceType,
            instanceCpuType,
            bitcoinNetwork,
            bitcoinVersion,
            nodeConfig,
            snapshotConfig,
            dataVolume,
            albHealthCheckGracePeriodMin,
            heartBeatDelayMin,
            numberOfNodes,
        } = props;

        const vpc = ec2.Vpc.fromLookup(this, "vpc", { isDefault: true });

        const instanceSG = new BitcoinNodeSecurityGroupConstruct(this, "security-group", {
            vpc: vpc,
        });

        const asset = new s3Assets.Asset(this, "assets", {
            path: path.join(__dirname, "assets"),
        });

        const importedInstanceRoleArn = cdk.Fn.importValue("BitcoinNodeInstanceRoleArn");
        const instanceRole = iam.Role.fromRoleArn(this, "iam-role", importedInstanceRoleArn);

        asset.bucket.grantRead(instanceRole);

        // Use Amazon Linux 2023 AMI (same as Ethereum blueprint)
        const machineImage = new ec2.AmazonLinuxImage({
            generation: ec2.AmazonLinuxGeneration.AMAZON_LINUX_2023,
            kernel: ec2.AmazonLinuxKernel.KERNEL6_1,
            cpuType: instanceCpuType,
        });

        const nodeScript = fs.readFileSync(path.join(__dirname, "assets", "user-data", "user-data.sh")).toString();
        const dataVolumeSizeBytes = dataVolume.sizeGiB * constants.GibibytesToBytesConversionCoefficient;

        const modifiedInitNodeScript = cdk.Fn.sub(nodeScript, {
            _AWS_REGION_: REGION,
            _ASSETS_S3_PATH_: `s3://${asset.s3BucketName}/${asset.s3ObjectKey}`,
            _STACK_NAME_: STACK_NAME,
            _STACK_ID_: constants.NoneValue,
            _NODE_CF_LOGICAL_ID_: constants.NoneValue,
            _DATA_VOLUME_TYPE_: dataVolume.type,
            _DATA_VOLUME_SIZE_: dataVolumeSizeBytes.toString(),
            _BITCOIN_NETWORK_: bitcoinNetwork,
            _BITCOIN_VERSION_: bitcoinVersion,
            _BITCOIN_TXINDEX_: nodeConfig.txindex.toString(),
            _BITCOIN_SERVER_: nodeConfig.server ? "1" : "0",
            _BITCOIN_LISTEN_: nodeConfig.listen ? "1" : "0",
            _BITCOIN_DBCACHE_: nodeConfig.dbcache.toString(),
            _BITCOIN_MAXCONNECTIONS_: nodeConfig.maxconnections.toString(),
            _BITCOIN_RPCALLOWIP_: nodeConfig.rpcallowip,
            _BITCOIN_RPCAUTH_: nodeConfig.rpcauth,
            _BITCOIN_PRUNE_: nodeConfig.prune.toString(),
            _BITCOIN_MAXMEMPOOL_: nodeConfig.maxmempool.toString(),
            _BITCOIN_MEMPOOLEXPIRY_: nodeConfig.mempoolexpiry.toString(),
            _BITCOIN_MAXORPHANTX_: nodeConfig.maxorphantx.toString(),
            _BITCOIN_BLOCKSONLY_: nodeConfig.blocksonly.toString(),
            _BITCOIN_ASSUMEVALID_: nodeConfig.assumevalid,
            _BITCOIN_ZMQPUBRAWBLOCK_: nodeConfig.zmqpubrawblock,
            _BITCOIN_ZMQPUBRAWTX_: nodeConfig.zmqpubrawtx,
            _BITCOIN_ZMQPUBHASHBLOCK_: nodeConfig.zmqpubhashblock,
            _BITCOIN_ZMQPUBHASHTX_: nodeConfig.zmqpubhashtx,
            _RESTORE_FROM_SNAPSHOT_: snapshotConfig.restoreFromSnapshot.toString(),
            _SNAPSHOT_URL_: snapshotConfig.snapshotUrl,
            _LIFECYCLE_HOOK_NAME_: lifecycleHookName,
            _ASG_NAME_: autoScalingGroupName,
        });

        // Determine RPC port based on network
        let rpcPort = 8332;  // mainnet
        if (bitcoinNetwork === "testnet") rpcPort = 18332;
        else if (bitcoinNetwork === "signet") rpcPort = 38332;
        else if (bitcoinNetwork === "regtest") rpcPort = 18443;

        const rpcNodes = new HANodesConstruct(this, "rpc-nodes", {
            instanceType,
            dataVolumes: [dataVolume],
            machineImage,
            role: instanceRole,
            vpc,
            securityGroup: instanceSG.securityGroup,
            userData: modifiedInitNodeScript,
            numberOfNodes,
            rpcPortForALB: rpcPort,
            albHealthCheckGracePeriodMin,
            healthCheckPath: "/",
            heartBeatDelayMin,
            lifecycleHookName: lifecycleHookName,
            autoScalingGroupName: autoScalingGroupName,
        });

        new cdk.CfnOutput(this, "alb-url", {
            value: rpcNodes.loadBalancerDnsName,
        });

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
