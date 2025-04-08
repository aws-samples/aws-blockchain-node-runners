import * as cdk from "aws-cdk-lib";
import * as cdkConstructs from "constructs";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as iam from "aws-cdk-lib/aws-iam";
import { AmazonLinuxGeneration, AmazonLinuxImage } from "aws-cdk-lib/aws-ec2";
import * as s3Assets from "aws-cdk-lib/aws-s3-assets";
import * as configTypes from "./config/baseConfig.interface";
import { BaseNodeSecurityGroupConstruct } from "./constructs/base-node-security-group";
import * as fs from "fs";
import * as path from "path";
import * as constants from "../../constructs/constants";
import { HANodesConstruct } from "../../constructs/ha-rpc-nodes-with-alb";
import * as nag from "cdk-nag";

export interface BaseHANodesStackProps extends cdk.StackProps {
    instanceType: ec2.InstanceType;
    instanceCpuType: ec2.AmazonLinuxCpuType;
    baseNetworkId: configTypes.BaseNetworkId;
    baseNodeConfiguration: configTypes.BaseNodeConfiguration;
    restoreFromSnapshot: boolean;
    l1ExecutionEndpoint: string,
    l1ConsensusEndpoint: string,
    snapshotUrl: string,
    dataVolume: configTypes.BaseDataVolumeConfig;
    albHealthCheckGracePeriodMin: number;
    heartBeatDelayMin: number;
    numberOfNodes: number;
}

export class BaseHANodesStack extends cdk.Stack {
    constructor(scope: cdkConstructs.Construct, id: string, props: BaseHANodesStackProps) {
        super(scope, id, props);

        const AWS_REGION = cdk.Stack.of(this).region;
        const STACK_NAME = cdk.Stack.of(this).stackName;
        const lifecycleHookName = STACK_NAME;
        const autoScalingGroupName = STACK_NAME;

        const {
            instanceType,
            instanceCpuType,
            baseNetworkId,
            baseNodeConfiguration,
            restoreFromSnapshot,
            l1ExecutionEndpoint,
            l1ConsensusEndpoint,
            dataVolume,
            albHealthCheckGracePeriodMin,
            heartBeatDelayMin,
            numberOfNodes
        } = props;

        // using default vpc
        const vpc = ec2.Vpc.fromLookup(this, "vpc", { isDefault: true });

        // setting up the security group for the node from BSC-specific construct
        const instanceSG = new BaseNodeSecurityGroupConstruct(this, "security-group", { vpc: vpc });

        // getting the IAM Role ARM from the common stack
        const importedInstanceRoleArn = cdk.Fn.importValue("BaseNodeInstanceRoleArn");

        const instanceRole = iam.Role.fromRoleArn(this, "iam-role", importedInstanceRoleArn);

        // making our scripts and configs from the local "assets" directory available for instance to download
        const asset = new s3Assets.Asset(this, "assets", {
            path: path.join(__dirname, "assets")
        });

        asset.bucket.grantRead(instanceRole);

        // parsing user data script and injecting necessary variables
        const nodeScript = fs.readFileSync(path.join(__dirname, "assets", "user-data-alinux.sh")).toString();
        const dataVolumeSizeBytes = dataVolume.sizeGiB * constants.GibibytesToBytesConversionCoefficient;

        const modifiedInitNodeScript = cdk.Fn.sub(nodeScript, {
            _AWS_REGION_: AWS_REGION,
            _ASSETS_S3_PATH_: `s3://${asset.s3BucketName}/${asset.s3ObjectKey}`,
            _STACK_NAME_: STACK_NAME,
            _NODE_CF_LOGICAL_ID_: constants.NoneValue,
            _DATA_VOLUME_TYPE_: dataVolume.type,
            _DATA_VOLUME_SIZE_: dataVolumeSizeBytes.toString(),
            _NETWORK_ID_: baseNetworkId,
            _NODE_CONFIG_: baseNodeConfiguration,
            _LIFECYCLE_HOOK_NAME_: lifecycleHookName,
            _AUTOSCALING_GROUP_NAME_: autoScalingGroupName,
            _RESTORE_FROM_SNAPSHOT_: restoreFromSnapshot.toString(),
            _FORMAT_DISK_: "true",
            _L1_EXECUTION_ENDPOINT_: l1ExecutionEndpoint,
            _L1_CONSENSUS_ENDPOINT_: l1ConsensusEndpoint,
            _SNAPSHOT_URL_: props.snapshotUrl,
        });

        const rpcNodes = new HANodesConstruct(this, "rpc-nodes", {
            instanceType,
            dataVolumes: [dataVolume],
            machineImage: new ec2.AmazonLinuxImage({
                generation: ec2.AmazonLinuxGeneration.AMAZON_LINUX_2023,
                kernel:ec2.AmazonLinuxKernel.KERNEL6_1,
                cpuType: instanceCpuType,
            }),
            role: instanceRole,
            vpc,
            securityGroup: instanceSG.securityGroup,
            userData: modifiedInitNodeScript,
            numberOfNodes,
            rpcPortForALB: 8545,
            albHealthCheckGracePeriodMin,
            heartBeatDelayMin,
            lifecycleHookName: lifecycleHookName,
            autoScalingGroupName: autoScalingGroupName
        });



        new cdk.CfnOutput(this, "alb-url", { value: rpcNodes.loadBalancerDnsName });

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
