import * as cdk from "aws-cdk-lib";
import * as cdkConstructs from "constructs";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as iam from "aws-cdk-lib/aws-iam";
import * as s3Assets from "aws-cdk-lib/aws-s3-assets";
import * as path from "path";
import * as fs from "fs";
import * as cw from 'aws-cdk-lib/aws-cloudwatch';
import * as nag from "cdk-nag";
import { SingleNodeConstruct } from "../../constructs/single-node";
import * as configTypes from "./config/bitcoinConfig.interface";
import * as constants from "../../constructs/constants";
import { BitcoinNodeSecurityGroupConstruct } from "./constructs/bitcoin-node-security-group";
import { SingleNodeCWDashboardJSON } from "./constructs/node-cw-dashboard";

export interface BitcoinSingleNodeStackProps extends cdk.StackProps {
    instanceType: ec2.InstanceType;
    instanceCpuType: ec2.AmazonLinuxCpuType;
    bitcoinNetwork: configTypes.BitcoinNetwork;
    bitcoinVersion: string;
    nodeConfig: configTypes.BitcoinNodeConfig;
    snapshotConfig: configTypes.BitcoinSnapshotConfig;
    dataVolume: configTypes.BitcoinDataVolumeConfig;
}

export class BitcoinSingleNodeStack extends cdk.Stack {
    constructor(scope: cdkConstructs.Construct, id: string, props: BitcoinSingleNodeStackProps) {
        super(scope, id, props);

        const REGION = cdk.Stack.of(this).region;
        const STACK_NAME = cdk.Stack.of(this).stackName;
        const STACK_ID = cdk.Stack.of(this).stackId;
        const availabilityZones = cdk.Stack.of(this).availabilityZones;
        const chosenAvailabilityZone = availabilityZones.slice(0, 2)[1];

        const {
            instanceType,
            instanceCpuType,
            bitcoinNetwork,
            bitcoinVersion,
            nodeConfig,
            snapshotConfig,
            dataVolume,
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

        const node = new SingleNodeConstruct(this, "single-node", {
            instanceName: STACK_NAME,
            instanceType,
            dataVolumes: [dataVolume],
            machineImage,
            vpc,
            availabilityZone: chosenAvailabilityZone,
            role: instanceRole,
            securityGroup: instanceSG.securityGroup,
            vpcSubnets: {
                subnetType: ec2.SubnetType.PUBLIC,
            },
        });

        const nodeStartScript = fs.readFileSync(path.join(__dirname, "assets", "user-data", "user-data.sh")).toString();
        const dataVolumeSizeBytes = dataVolume.sizeGiB * constants.GibibytesToBytesConversionCoefficient;

        const modifiedInitNodeScript = cdk.Fn.sub(nodeStartScript, {
            _AWS_REGION_: REGION,
            _ASSETS_S3_PATH_: `s3://${asset.s3BucketName}/${asset.s3ObjectKey}`,
            _STACK_NAME_: STACK_NAME,
            _STACK_ID_: STACK_ID,
            _NODE_CF_LOGICAL_ID_: node.nodeCFLogicalId,
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
            _LIFECYCLE_HOOK_NAME_: constants.NoneValue,
            _ASG_NAME_: constants.NoneValue,
        });
        node.instance.addUserData(modifiedInitNodeScript);

        const dashboardString = cdk.Fn.sub(JSON.stringify(SingleNodeCWDashboardJSON), {
            INSTANCE_ID: node.instanceId,
            INSTANCE_NAME: STACK_NAME,
            REGION: REGION,
        });

        new cw.CfnDashboard(this, 'bitcoin-cw-dashboard', {
            dashboardName: `${STACK_NAME}-${node.instanceId}`,
            dashboardBody: dashboardString,
        });

        new cdk.CfnOutput(this, "node-instance-id", {
            value: node.instanceId,
        });

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
