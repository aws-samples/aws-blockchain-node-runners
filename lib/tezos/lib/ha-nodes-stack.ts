import * as cdk from "aws-cdk-lib";
import * as cdkConstructs from "constructs";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as iam from "aws-cdk-lib/aws-iam";
import { AmazonLinuxGeneration, AmazonLinuxImage } from "aws-cdk-lib/aws-ec2";
import * as s3Assets from "aws-cdk-lib/aws-s3-assets";
import * as configTypes from "./config/tzConfig.interface";
import { TzNodeSecurityGroupConstructs } from "./constructs/tz-node-security-group";
import * as fs from "fs";
import * as path from "path";
import * as constants from "../../constructs/constants";
import { HANodesConstruct } from "../../constructs/ha-rpc-nodes-with-alb";
import * as nag from "cdk-nag";

export interface TzHANodesStackProps extends cdk.StackProps {
    nodeRole: configTypes.TzNodeRole;
    instanceType: ec2.InstanceType;
    instanceCpuType: ec2.AmazonLinuxCpuType;
    tzNetwork: configTypes.TzNetwork;
    historyMode: configTypes.TzNodeHistoryMode;
    snapshotsUrl: string;
    dataVolume: configTypes.TzDataVolumeConfig;
    albHealthCheckGracePeriodMin: number;
    heartBeatDelayMin: number;
    numberOfNodes: number;
}

export class TzHANodesStack extends cdk.Stack {
    constructor(scope: cdkConstructs.Construct, id: string, props: TzHANodesStackProps) {
        super(scope, id, props);

        const REGION = cdk.Stack.of(this).region;
        const STACK_NAME = cdk.Stack.of(this).stackName;
        const lifecycleHookName = STACK_NAME;
        const autoScalingGroupName = STACK_NAME;

        const {
            nodeRole,
            instanceType,
            instanceCpuType,
            tzNetwork,
            snapshotsUrl,
            dataVolume,
            albHealthCheckGracePeriodMin,
            heartBeatDelayMin,
            numberOfNodes
        } = props;

        // using default vpc
        const vpc = ec2.Vpc.fromLookup(this, "vpc", { isDefault: true });

        // setting up the security group for the node from TZ-specific construct
        const instanceSG = new TzNodeSecurityGroupConstructs(this, "security-group", { vpc: vpc });

        // getting the IAM Role ARM from the common stack
        const importedInstanceRoleArn = cdk.Fn.importValue("TzNodeInstanceRoleArn");

        const instanceRole = iam.Role.fromRoleArn(this, "iam-role", importedInstanceRoleArn);

        // making our scripts and configs from the local "assets" directory available for instance to download
        const asset = new s3Assets.Asset(this, "assets", {
            path: path.join(__dirname, "assets")
        });

        asset.bucket.grantRead(instanceRole);

        // parsing user data script and injecting necessary variables
        const nodeScript = fs.readFileSync(path.join(__dirname, "assets", "user-data", "node.sh")).toString();
        const dataVolumeSizeBytes = dataVolume.sizeGiB * constants.GibibytesToBytesConversionCoefficient;

        const modifiedInitNodeScript = cdk.Fn.sub(nodeScript, {
            _AWS_REGION_: REGION,
            _ASSETS_S3_PATH_: `s3://${asset.s3BucketName}/${asset.s3ObjectKey}`,
            _STACK_NAME_: STACK_NAME,
            _TZ_SNAPSHOTS_URI_: snapshotsUrl,
            _STACK_ID_: constants.NoneValue,
            _NODE_CF_LOGICAL_ID_: constants.NoneValue,
            _DATA_VOLUME_TYPE_: dataVolume.type,
            _DATA_VOLUME_SIZE_: dataVolumeSizeBytes.toString(),
            _NODE_ROLE_: nodeRole,

            _TZ_NETWORK_: tzNetwork,
            _LIFECYCLE_HOOK_NAME_: lifecycleHookName,
            _AUTOSCALING_GROUP_NAME_: autoScalingGroupName
        });

        const rpcNodes = new HANodesConstruct(this, "rpc-nodes", {
            instanceType,
            dataVolumes: [dataVolume],
            machineImage: new ec2.AmazonLinuxImage({
                generation: AmazonLinuxGeneration.AMAZON_LINUX_2,
                kernel:ec2.AmazonLinuxKernel.KERNEL5_X,
                cpuType: instanceCpuType
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
