import * as cdk from "aws-cdk-lib";
import * as cdkConstructs from "constructs";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as iam from "aws-cdk-lib/aws-iam";
import * as s3Assets from "aws-cdk-lib/aws-s3-assets";
import * as path from "path";
import * as fs from "fs";
import * as cw from "aws-cdk-lib/aws-cloudwatch";
import * as nag from "cdk-nag";
import { SingleNodeConstruct } from "../../constructs/single-node";
import { XRPNodeSecurityGroupConstruct } from "./constructs/xrp-node-security-group";
import { SingleNodeCWDashboardJSON } from "./constructs/node-cw-dashboard";
import { DataVolumeConfig } from "../../constructs/config.interface";
import * as constants from "../../constructs/constants";
import { parseRippledConfig } from "./config/createIniFile";


export interface XRPSingleNodeStackProps extends cdk.StackProps {
    instanceType: ec2.InstanceType;
    instanceCpuType: ec2.AmazonLinuxCpuType;
    dataVolume: DataVolumeConfig;
    stackName: string;
    hubNetworkID: string;
    instanceRole: iam.Role;

}

export class XRPSingleNodeStack extends cdk.Stack {
    constructor(scope: cdkConstructs.Construct, id: string, props: XRPSingleNodeStackProps) {
        super(scope, id, props);

        // Setting up necessary environment variables
        const REGION = cdk.Stack.of(this).region;
        const STACK_NAME = cdk.Stack.of(this).stackName;
        const STACK_ID = cdk.Stack.of(this).stackId;
        const availabilityZones = cdk.Stack.of(this).availabilityZones;
        const chosenAvailabilityZone = availabilityZones.slice(0, 1)[0];

        // Getting our config from initialization properties
        const {
            instanceType,
            instanceCpuType,
            dataVolume: dataVolume,
            stackName,
            hubNetworkID
        } = props;

        // Using default VPC
        const vpc = ec2.Vpc.fromLookup(this, "vpc", { isDefault: true });

        // Setting up the security group for the node from XRP-specific construct
        const instanceSG = new XRPNodeSecurityGroupConstruct(this, "security-group", {
            vpc: vpc
        });

        // Making our scripts and configis from the local "assets" directory available for instance to download
        const asset = new s3Assets.Asset(this, "assets", {
            path: path.join(__dirname, "assets")
        });

        // Getting the IAM role ARN from the common stack
        const importedInstanceRoleArn = cdk.Fn.importValue("XRPNodeInstanceRoleArn");

        const instanceRole = props.instanceRole; //iam.Role.fromRoleArn(this, "iam-role", importedInstanceRoleArn);

        // Making sure our instance will be able to read the assets
        asset.bucket.grantRead(instanceRole);

        // Setting up the node using generic Single Node constract
        if (instanceCpuType === ec2.AmazonLinuxCpuType.ARM_64) {
            throw new Error("ARM_64 is not yet supported");
        }


        const node = new SingleNodeConstruct(this, "stock-server-node", {
            instanceName: STACK_NAME,
            instanceType,
            dataVolumes: [dataVolume],
            rootDataVolumeDeviceName: "/dev/xvda",
            machineImage: new ec2.AmazonLinuxImage({
                generation: ec2.AmazonLinuxGeneration.AMAZON_LINUX_2,
                cpuType: ec2.AmazonLinuxCpuType.X86_64
            }),
            vpc,
            availabilityZone: chosenAvailabilityZone,
            role: instanceRole,
            securityGroup: instanceSG.securityGroup,
            vpcSubnets: {
                subnetType: ec2.SubnetType.PUBLIC
            }
        });


        // Parsing user data script and injecting necessary variables
        const nodeStartScript = fs.readFileSync(path.join(__dirname, "assets", "user-data", "node.sh")).toString();
        const dataVolumeSizeBytes = dataVolume.sizeGiB * constants.GibibytesToBytesConversionCoefficient;

        const modifiedInitNodeScript = cdk.Token.asString(
            cdk.Lazy.string({
                produce: () => {
                    return nodeStartScript
                        .replace("_AWS_REGION_", REGION)
                        .replace("_ASSETS_S3_PATH_", `s3://${asset.s3BucketName}/${asset.s3ObjectKey}`)
                        .replace("_STACK_NAME_", STACK_NAME)
                        .replace("_STACK_ID_", STACK_ID)
                        .replace("_NODE_CF_LOGICAL_ID_", node.nodeCFLogicalId)
                        .replace("_DATA_VOLUME_TYPE_", dataVolume.type)
                        .replace("_DATA_VOLUME_SIZE_", dataVolumeSizeBytes.toString())
                        .replace("_HUB_NETWORK_ID_", hubNetworkID)
                        .replace("_LIFECYCLE_HOOK_NAME_", constants.NoneValue);
                }
            })
        );

        const userData = ec2.UserData.forLinux();
        userData.addCommands(modifiedInitNodeScript);
        node.instance.addUserData(userData.render());

        // Adding CloudWatch dashboard to the node
        const dashboardString = cdk.Fn.sub(JSON.stringify(SingleNodeCWDashboardJSON), {
            INSTANCE_ID: node.instanceId,
            INSTANCE_NAME: STACK_NAME,
            REGION: REGION
        });

        new cw.CfnDashboard(this, "xrp-cw-dashboard", {
            dashboardName: `${STACK_NAME}-${node.instanceId}`,
            dashboardBody: dashboardString
        });

        new cdk.CfnOutput(this, "node-instance-id", {
            value: node.instanceId
        });

        // Adding suppressions to the stack
        nag.NagSuppressions.addResourceSuppressions(
            this,
            [
                {
                    id: "AwsSolutions-IAM5",
                    reason: "Need read access to the S3 bucket with assets"
                }
            ],
            true
        );
    }
}