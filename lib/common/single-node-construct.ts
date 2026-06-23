// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import * as cdk from "aws-cdk-lib";
import * as constructs from "constructs";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as iam from "aws-cdk-lib/aws-iam";
import * as nag from "cdk-nag";
import * as path from 'path';
import {
    ProtocolConfig,
    DeploymentConfig,
    EnvironmentConfig,
    StorageVolumeConfig,
    CpuType,
    CFNandCDKUserDataConfig,
    NoneValue,
} from "../interfaces";

import { 
    UserDataManager,
    AssetsManager,
} from "../core";

/**
 * Constants for volume device naming
 */
const INSTANCE_STORAGE_DEVICE_VOLUME_TYPE = "instance-store";

/**
 * Properties for SingleNodeConstruct
 */
export interface SingleNodeProps {
    /**
     * Protocol configuration containing blockchain-specific settings
     */
    protocolConfig: ProtocolConfig;

    /**
     * Deployment configuration combining protocol and environment settings
     */
    deploymentConfig: DeploymentConfig;

    /**
     * Path to user data script to run on instance startup
     */
    userDataScriptPath: string;

    /**
     * Optional VPC to deploy into. If not provided, uses default VPC.
     */
    vpc?: ec2.IVpc;

    /**
     * Optional Availability Zone index [1-10]. If not provided, uses [1].
     */
    azIndex?: number;
}

/**
 * Universal single node construct for deploying blockchain nodes
 * 
 * This construct creates:
 * - EC2 instance with configurable instance type
 * - Security group based on protocol required ports
 * - IAM role with SSM and CloudWatch permissions
 * - EBS volumes based on storage configuration
 * - User data injection with CDK-managed variables
 */
export class SingleNodeConstruct extends constructs.Construct {
    /**
     * The EC2 instance ID
     */
    public readonly instanceId: string;

    /**
     * The CloudFormation logical ID of the instance
     */
    public readonly nodeCFLogicalId: string;

    /**
     * The EC2 instance
     */
    public readonly instance: ec2.Instance;

    /**
     * The security group attached to the instance
     */
    public readonly securityGroup: ec2.ISecurityGroup;

    /**
     * The IAM role attached to the instance
     */
    public readonly instanceRole: iam.IRole;

    /**
     * The VPC where the instance is deployed
     */
    public readonly vpc: ec2.IVpc;

    constructor(scope: constructs.Construct, id: string, props: SingleNodeProps) {
        super(scope, id);

        const { protocolConfig, deploymentConfig, userDataScriptPath, vpc: providedVpc, azIndex } = props;
        const { environment } = deploymentConfig;

        // Get stack context
        const stackName = cdk.Stack.of(this).stackName;
        const availabilityZones = cdk.Stack.of(this).availabilityZones;
        const chosenAvailabilityZone = environment.AWS_AZ
            || (azIndex ? availabilityZones.slice(0, availabilityZones.length - 1 )[azIndex] : availabilityZones[1]);

        // Use provided VPC or lookup default VPC
        this.vpc = providedVpc || ec2.Vpc.fromLookup(this, "vpc", { isDefault: true });

        // Create security group based on protocol required ports
        this.securityGroup = this.createSecurityGroup(protocolConfig);

        // Create IAM role with SSM and CloudWatch permissions
        this.instanceRole = this.createInstanceRole(environment);

        // Determine machine image based on CPU type
        const userDataScriptFileName = path.basename(userDataScriptPath)
        const machineImage = this.getMachineImage(environment.CPU_TYPE, userDataScriptFileName);

        // Create EC2 instance
        this.instance = new ec2.Instance(this, "single-node", {
            instanceName: stackName,
            instanceType: new ec2.InstanceType(environment.INSTANCE_TYPE),
            machineImage: machineImage,
            vpc: this.vpc,
            availabilityZone: chosenAvailabilityZone,
            blockDevices: [
                {
                    // ROOT VOLUME
                    deviceName: "/dev/sda1",
                    volume: ec2.BlockDeviceVolume.ebs(80, {
                        deleteOnTermination: true,
                        encrypted: true,
                        iops: 3000,
                        volumeType: ec2.EbsDeviceVolumeType.GP3,
                    }),
                },
            ],
            detailedMonitoring: true,
            propagateTagsToVolumeOnCreation: true,
            role: this.instanceRole,
            securityGroup: this.securityGroup,
            vpcSubnets: {
                subnetType: ec2.SubnetType.PUBLIC,
            },
        });

        // Create and attach data volumes
        this.createDataVolumes(environment.DATA_VOLUMES, chosenAvailabilityZone);

        // Create and attach snapshot staging volume if configured
        let snapshotStagingVolumeId: string = NoneValue;
        if (environment.SNAPSHOT_ENABLED && (environment.SNAPSHOT_STAGING_VOL_SIZE ?? 0) > 0) {
            snapshotStagingVolumeId = this.createSnapshotStagingVolume(
                environment.SNAPSHOT_STAGING_VOL_SIZE!,
                chosenAvailabilityZone,
                stackName,
            );
        }

        // Get CloudFormation logical ID for signaling
        const instanceCfn = this.instance.node.defaultChild as ec2.CfnInstance;
        this.nodeCFLogicalId = instanceCfn.logicalId;

        // Configure CloudFormation creation policy for signaling
        const creationPolicy: cdk.CfnCreationPolicy = {
            resourceSignal: {
                count: 1,
                timeout: "PT15M",
            },
        };
        instanceCfn.cfnOptions.creationPolicy = creationPolicy;

        const singleNodeCfn = this.instance.node.defaultChild as ec2.CfnInstance;
        const nodeCFLogicalId = singleNodeCfn.logicalId;

        // Uploading assets to S3 to be used furhter by user-data script
        const assetManager = new AssetsManager(scope);
        const comonAssetsS3Path = assetManager.uploadAssets();
        const protocolAssetsS3Path = assetManager.uploadProtocolAssets(environment.BLOCKCHAIN_PROTOCOL);

        // Grant the instance role read access scoped to ONLY the CDK asset
        // objects it downloads at boot (specific keys in the bootstrap assets
        // bucket), instead of a blanket s3:GetObject/ListBucket on "*".
        const commonAsset = assetManager.getAsset();
        if (commonAsset) {
            commonAsset.bucket.grantRead(this.instanceRole, commonAsset.s3ObjectKey);
        }
        const protocolAsset = assetManager.getProtocolAssets();
        if (protocolAsset) {
            protocolAsset.bucket.grantRead(this.instanceRole, protocolAsset.s3ObjectKey);
        }

        const cfnandCDKUserDataConfig: CFNandCDKUserDataConfig = {
            STACK_NAME: stackName,
            LOGICAL_RESOURCE_ID: nodeCFLogicalId,
            ASG_NAME: NoneValue,
            LIFECYCLE_HOOK_NAME: NoneValue,
            COMMON_ASSETS_S3_PATH: comonAssetsS3Path,
            PROTOCOL_ASSETS_S3_PATH: protocolAssetsS3Path,
            SNAPSHOT_STAGING_VOL_ID: snapshotStagingVolumeId,
        }

        const userDataManager = new UserDataManager(userDataScriptPath);
        const userDataScript = userDataManager.loadUserDataScript();

        const processedUserData = userDataManager.injectVariables(userDataScript, environment, cfnandCDKUserDataConfig);

        // Add user data script
        this.instance.addUserData(processedUserData);

        // Store instance ID
        this.instanceId = this.instance.instanceId;

        // Add CDK Nag suppressions
        this.addNagSuppressions();
    }

    /**
     * Create security group based on protocol required ports
     */
    private createSecurityGroup(protocolConfig: ProtocolConfig): ec2.SecurityGroup {
        const sg = new ec2.SecurityGroup(this, "security-group", {
            vpc: this.vpc,
            description: `Security Group for ${protocolConfig.BLOCKCHAIN_PROTOCOL} blockchain node`,
            allowAllOutbound: false,
        });

        // Add ingress rules based on protocol required ports
        protocolConfig.requiredPorts.forEach((portConfig) => {
            const peer = portConfig.public !== false ? ec2.Peer.anyIpv4() : ec2.Peer.ipv4(this.vpc.vpcCidrBlock);

            if (portConfig.port) {
                // Single port
                if (portConfig.protocol === "tcp") {
                    sg.addIngressRule(peer, ec2.Port.tcp(portConfig.port), portConfig.description);
                } else {
                    sg.addIngressRule(peer, ec2.Port.udp(portConfig.port), portConfig.description);
                }
            } else if (portConfig.portRange) {
                // Port range
                if (portConfig.protocol === "tcp") {
                    sg.addIngressRule(
                        peer,
                        ec2.Port.tcpRange(portConfig.portRange.from, portConfig.portRange.to),
                        portConfig.description
                    );
                } else {
                    sg.addIngressRule(
                        peer,
                        ec2.Port.udpRange(portConfig.portRange.from, portConfig.portRange.to),
                        portConfig.description
                    );
                }
            }
        });

        // Add egress rules - allow all outbound traffic
        sg.addEgressRule(ec2.Peer.anyIpv4(), ec2.Port.allTcp(), "Allow all outbound TCP");
        sg.addEgressRule(ec2.Peer.anyIpv4(), ec2.Port.allUdp(), "Allow all outbound UDP");

        return sg;
    }

    /**
     * Create IAM role with SSM and CloudWatch permissions
     */
    private createInstanceRole(environment: EnvironmentConfig): iam.Role {
        const role = new iam.Role(this, "instance-role", {
            assumedBy: new iam.ServicePrincipal("ec2.amazonaws.com"),
            description: "IAM role for blockchain node instance",
            managedPolicies: [
                iam.ManagedPolicy.fromAwsManagedPolicyName("AmazonSSMManagedInstanceCore"),
                iam.ManagedPolicy.fromAwsManagedPolicyName("CloudWatchAgentServerPolicy"),
            ],
        });

        // Add S3 read permissions for downloading assets.
        // Scoped to the specific CDK asset objects via Asset.grantRead() after
        // the assets are uploaded (see constructor), not a blanket "*" grant.

        // Add CloudFormation signal permissions, scoped to this stack only.
        // The instance signals its own stack resource at boot (cfn-signal); it
        // has no need to touch other stacks in the account.
        const region = cdk.Stack.of(this).region;
        const account = cdk.Stack.of(this).account;
        const stackName = cdk.Stack.of(this).stackName;
        role.addToPolicy(new iam.PolicyStatement({
            effect: iam.Effect.ALLOW,
            actions: [
                "cloudformation:SignalResource",
                "cloudformation:DescribeStackResource",
            ],
            resources: [`arn:aws:cloudformation:${region}:${account}:stack/${stackName}/*`],
        }));

        // Add Secrets Manager permissions scoped to this stack's own secrets.
        // Blueprints that manage credentials name their secrets "<stackName>/..."
        // (e.g. Bitcoin's "<stackName>/bitcoin_rpc_credentials"), so a stack-scoped
        // ARN prefix covers create/read/update without granting access to
        // unrelated secrets elsewhere in the account.
        this.addSecretsManagerPolicy(role, environment);

        return role;
    }

    /**
     * Grant the instance role least-privilege Secrets Manager access:
     *  - read + write on secrets named "<stackName>/*" or "<stackName>-*"
     *    (the only secrets blueprints create at runtime), and
     *  - read-only on any externally-provided secret ARNs referenced in the
     *    deployment config (e.g. SOLANA_NODE_IDENTITY_SECRET_ARN).
     */
    private addSecretsManagerPolicy(role: iam.Role, environment: EnvironmentConfig): void {
        const region = cdk.Stack.of(this).region;
        const account = cdk.Stack.of(this).account;
        const stackName = cdk.Stack.of(this).stackName;

        role.addToPolicy(new iam.PolicyStatement({
            effect: iam.Effect.ALLOW,
            actions: [
                "secretsmanager:GetSecretValue",
                "secretsmanager:DescribeSecret",
                "secretsmanager:CreateSecret",
                "secretsmanager:PutSecretValue",
            ],
            resources: [
                `arn:aws:secretsmanager:${region}:${account}:secret:${stackName}/*`,
                `arn:aws:secretsmanager:${region}:${account}:secret:${stackName}-*`,
            ],
        }));

        // Read-only access to operator-provided external secrets (created
        // out-of-band and pointed at via config), e.g. a Solana validator
        // identity keypair stored in Secrets Manager.
        const externalSecretArns = this.collectExternalSecretArns(environment);
        if (externalSecretArns.length > 0) {
            role.addToPolicy(new iam.PolicyStatement({
                effect: iam.Effect.ALLOW,
                actions: [
                    "secretsmanager:GetSecretValue",
                    "secretsmanager:DescribeSecret",
                ],
                resources: externalSecretArns,
            }));
        }
    }

    /**
     * Collect externally-provided Secrets Manager ARNs referenced in the
     * deployment configuration's custom variables (e.g.
     * SOLANA_NODE_IDENTITY_SECRET_ARN). These are secrets the operator created
     * out-of-band, so the node needs read-only access to them in addition to
     * its own stack-scoped secrets.
     */
    private collectExternalSecretArns(environment: EnvironmentConfig): string[] {
        const arns = new Set<string>();
        const secretArnPattern = /^arn:aws[a-zA-Z-]*:secretsmanager:[a-z0-9-]+:\d{12}:secret:.+/;
        const customVars = environment.CUSTOM_VARIABLES || {};
        for (const value of Object.values(customVars)) {
            if (typeof value === "string" && secretArnPattern.test(value.trim())) {
                arns.add(value.trim());
            }
        }
        return Array.from(arns);
    }

    /**
     * Get machine image based on CPU type and the name of the user-data script file
     */
    private getMachineImage(cpuType: CpuType, userDataScriptFileName: string): ec2.IMachineImage {
        switch (userDataScriptFileName) {
            case "user-data-ubuntu.sh":
                // Use Ubuntu 24.04 LTS
                return ec2.MachineImage.fromSsmParameter(
                    `/aws/service/canonical/ubuntu/server/24.04/stable/current/${cpuType === CpuType.ARM_64 ? 'arm64' : 'amd64'}/hvm/ebs-gp3/ami-id`,
                    {
                        os: ec2.OperatingSystemType.LINUX,
                    }
                );
            default:
                // Use Ubuntu 24.04 LTS
                return ec2.MachineImage.fromSsmParameter(
                    `/aws/service/canonical/ubuntu/server/24.04/stable/current/${cpuType === CpuType.ARM_64 ? 'arm64' : 'amd64'}/hvm/ebs-gp3/ami-id`,
                    {
                        os: ec2.OperatingSystemType.LINUX,
                    }
                );
        }
    }

    /**
     * Create and attach EBS data volumes
     */
    private createDataVolumes(dataVolumes: StorageVolumeConfig[], availabilityZone: string): void {
        dataVolumes.forEach((volumeConfig, index) => {
            if (index >= 6) {
                throw new Error(`Number of data volumes can't be more than 6, current number: ${index + 1}`);
            }

            // Skip instance store volumes - they are handled differently
            if (volumeConfig.TYPE === INSTANCE_STORAGE_DEVICE_VOLUME_TYPE) {
                return;
            }

            const volumeType = this.getEbsVolumeType(volumeConfig.TYPE);

            let volume: ec2.Volume;

            if (volumeConfig.TYPE === "gp3") {
                volume = new ec2.Volume(this, `data-volume-${index + 1}`, {
                    availabilityZone: availabilityZone,
                    size: cdk.Size.gibibytes(volumeConfig.SIZE),
                    volumeType: volumeType,
                    encrypted: true,
                    iops: volumeConfig.IOPS,
                    throughput: volumeConfig.THROUGHPUT,
                    removalPolicy: cdk.RemovalPolicy.DESTROY,
                });
            } else {
                // io1, io2 volumes
                volume = new ec2.Volume(this, `data-volume-${index + 1}`, {
                    availabilityZone: availabilityZone,
                    size: cdk.Size.gibibytes(volumeConfig.SIZE),
                    volumeType: volumeType,
                    encrypted: true,
                    iops: volumeConfig.IOPS,
                    removalPolicy: cdk.RemovalPolicy.DESTROY,
                });
            }

            // Attach volume to instance
            new ec2.CfnVolumeAttachment(this, `data-volume-${index + 1}-attachment`, {
                device: volumeConfig.DEVICE_NAME,
                instanceId: this.instance.instanceId,
                volumeId: volume.volumeId,
            });
        });
    }

    /**
     * Create and attach a temporary gp3 staging volume for snapshot downloads.
     * Returns the volume ID string for injection into user-data.
     */
    private createSnapshotStagingVolume(
        sizeGiB: number,
        availabilityZone: string,
        stackName: string,
    ): string {
        const region = cdk.Stack.of(this).region;
        const account = cdk.Stack.of(this).account;

        const stagingVolume = new ec2.Volume(this, "snapshot-staging-volume", {
            availabilityZone: availabilityZone,
            size: cdk.Size.gibibytes(sizeGiB),
            volumeType: ec2.EbsDeviceVolumeType.GP3,
            throughput: 300,
            iops: 4000,
            encrypted: true,
            removalPolicy: cdk.RemovalPolicy.DESTROY,
        });

        cdk.Tags.of(stagingVolume).add("Name", `${stackName}-snapshot-staging`);
        cdk.Tags.of(stagingVolume).add("Purpose", "snapshot-staging");

        // Attach volume to instance at /dev/xvdz
        new ec2.CfnVolumeAttachment(this, "snapshot-staging-volume-attachment", {
            device: "/dev/xvdz",
            instanceId: this.instance.instanceId,
            volumeId: stagingVolume.volumeId,
        });

        // Grant instance permission to detach and delete the staging volume.
        // ec2:DetachVolume authorizes against BOTH the volume and the instance
        // resource, so an instance ARN must be included or the detach is denied
        // (which previously left the volume orphaned). We use a wildcard instance
        // ARN rather than this.instance.instanceId to avoid a CDK dependency cycle
        // (role policy -> instance -> instance profile -> role); the grant is
        // still tightly constrained by the specific volume ARN.
        (this.instanceRole as iam.Role).addToPolicy(new iam.PolicyStatement({
            effect: iam.Effect.ALLOW,
            actions: [
                "ec2:DetachVolume",
                "ec2:DeleteVolume",
            ],
            resources: [
                `arn:aws:ec2:${region}:${account}:volume/${stagingVolume.volumeId}`,
                `arn:aws:ec2:${region}:${account}:instance/*`,
            ],
        }));

        return stagingVolume.volumeId;
    }

    /**
     * Convert volume type string to EBS volume type enum
     */
    private getEbsVolumeType(type: string): ec2.EbsDeviceVolumeType {
        switch (type) {
            case "gp3":
                return ec2.EbsDeviceVolumeType.GP3;
            case "io1":
                return ec2.EbsDeviceVolumeType.IO1;
            case "io2":
                return ec2.EbsDeviceVolumeType.IO2;
            default:
                return ec2.EbsDeviceVolumeType.GP3;
        }
    }

    /**
     * Add CDK Nag suppressions for known security patterns
     */
    private addNagSuppressions(): void {
        nag.NagSuppressions.addResourceSuppressions(
            this,
            [
                {
                    id: "AwsSolutions-EC29",
                    reason: "Instance can be terminated as data is persisted in EBS volumes",
                },
                {
                    id: "AwsSolutions-EC23",
                    reason: "Blockchain protocols require wildcard inbound for specific P2P ports",
                },
                {
                    id: "AwsSolutions-IAM5",
                    reason: "Need read access to S3 bucket with assets and CloudFormation signal permissions",
                },
                {
                    id: "AwsSolutions-IAM4",
                    reason: "Using AWS managed policies for SSM and CloudWatch is acceptable for this use case",
                },
            ],
            true
        );
    }
}
