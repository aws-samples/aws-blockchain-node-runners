import * as cdk from "aws-cdk-lib";
import * as cdkConstructs from "constructs";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as iam from "aws-cdk-lib/aws-iam";
import * as s3Assets from "aws-cdk-lib/aws-s3-assets";
import * as path from "path";
import * as fs from "fs";
import * as cw from 'aws-cdk-lib/aws-cloudwatch';
import { SingleNodeConstruct } from "../../constructs/single-node";
import * as configTypes from "./config/node-config.interface";
import * as constants from "../../constructs/constants";
import { PolygonNodeSecurityGroupConstruct } from "./constructs/polygon-node-security-group";
import * as polygonCwDashboard from "./constructs/polygon-cw-dashboard";
import * as nag from "cdk-nag";

export interface PolygonSingleNodeStackProps extends cdk.StackProps {
    network: configTypes.PolygonNetwork;
    erigonImage: string;
    heimdallApiUrl: string;
    instanceType: ec2.InstanceType;
    instanceCpuType: ec2.AmazonLinuxCpuType;
    dataVolume: configTypes.PolygonDataVolumeConfig;
}

export class PolygonSingleNodeStack extends cdk.Stack {
    constructor(scope: cdkConstructs.Construct, id: string, props: PolygonSingleNodeStackProps) {
        super(scope, id, props);

        const REGION = cdk.Stack.of(this).region;
        const STACK_NAME = cdk.Stack.of(this).stackName;
        const availabilityZones = cdk.Stack.of(this).availabilityZones;
        const azIndex = parseInt(process.env.POLYGON_AZ_INDEX || "0");
        const chosenAvailabilityZone = availabilityZones[Math.min(azIndex, availabilityZones.length - 1)];

        const {
            instanceType,
            network,
            erigonImage,
            heimdallApiUrl,
            instanceCpuType,
            dataVolume,
        } = props;

        const vpc = ec2.Vpc.fromLookup(this, "vpc", { isDefault: true });

        const instanceSG = new PolygonNodeSecurityGroupConstruct(this, "security-group", {
            vpc: vpc,
        });

        const asset = new s3Assets.Asset(this, "assets", {
            path: path.join(__dirname, "assets"),
        });

        const importedInstanceRoleArn = cdk.Fn.importValue("PolygonNodeInstanceRoleArn");
        const instanceRole = iam.Role.fromRoleArn(this, "iam-role", importedInstanceRoleArn);

        asset.bucket.grantRead(instanceRole);

        const node = new SingleNodeConstruct(this, "single-node", {
            instanceName: STACK_NAME,
            instanceType,
            dataVolumes: [dataVolume],
            machineImage: new ec2.AmazonLinuxImage({
                generation: ec2.AmazonLinuxGeneration.AMAZON_LINUX_2023,
                kernel: ec2.AmazonLinuxKernel.KERNEL6_1,
                cpuType: instanceCpuType,
            }),
            vpc,
            availabilityZone: chosenAvailabilityZone,
            role: instanceRole,
            securityGroup: instanceSG.securityGroup,
            vpcSubnets: {
                subnetType: ec2.SubnetType.PUBLIC,
            },
        });

        // Override CreationPolicy: remove cfn-signal requirement.
        // SingleNodeConstruct sets a 15-min CreationPolicy that waits for cfn-signal,
        // but this creates a circular dependency with VolumeAttachment — CloudFormation
        // won't attach the volume until the Instance is CREATE_COMPLETE, but the Instance
        // won't signal until user-data finishes (which needs the volume).
        // Instead, we let the Instance be CREATE_COMPLETE immediately and rely on
        // CloudWatch metrics to monitor node health.
        const cfnInstance = node.instance.node.defaultChild as ec2.CfnInstance;
        cfnInstance.cfnOptions.creationPolicy = undefined;

        const userData = fs.readFileSync(path.join(__dirname, "assets", "user-data", "node.sh")).toString();

        const modifiedUserData = cdk.Fn.sub(userData, {
            _REGION_: REGION,
            _ASSETS_S3_PATH_: `s3://${asset.s3BucketName}/${asset.s3ObjectKey}`,
            _POLYGON_NETWORK_: network,
            _POLYGON_ERIGON_IMAGE_: erigonImage,
            _POLYGON_HEIMDALL_API_URL_: heimdallApiUrl,
            _STACK_NAME_: STACK_NAME,
            _DATA_VOLUME_TYPE_: dataVolume.type,
            _DATA_VOLUME_SIZE_: dataVolume.sizeGiB.toString(),
        });

        node.instance.addUserData(modifiedUserData);

        const dashboardString = cdk.Fn.sub(JSON.stringify(polygonCwDashboard.SingleNodeCWDashboardJSON), {
            INSTANCE_ID: node.instanceId,
            INSTANCE_NAME: STACK_NAME,
            REGION: REGION,
        });

        new cw.CfnDashboard(this, 'single-cw-dashboard', {
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
                    reason: "Need read access to the S3 assets bucket",
                },
            ],
            true
        );
    }
}
