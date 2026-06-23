// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import * as cdk from "aws-cdk-lib";
import * as constructs from "constructs";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as iam from "aws-cdk-lib/aws-iam";
import * as autoscaling from "aws-cdk-lib/aws-autoscaling";
import * as elbv2 from "aws-cdk-lib/aws-elasticloadbalancingv2";
import * as nag from "cdk-nag";
import {
    ProtocolConfig,
    DeploymentConfig,
    EnvironmentConfig,
    StorageVolumeConfig,
    CpuType,
    HAConfig,
    CFNandCDKUserDataConfig,
    NoneValue
} from "../interfaces";

import {
    ConfigurationLoader,
    AssetsManager,
    UserDataManager
} from "../core"

/**
 * Constants for volume device naming
 */
const INSTANCE_STORAGE_DEVICE_VOLUME_TYPE = "instance-store";

/**
 * Properties for HANodesConstruct
 */
export interface HANodesProps {
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
}

/**
 * Universal HA nodes construct for deploying blockchain nodes with high availability
 * 
 * This construct creates:
 * - Application Load Balancer with target group
 * - Auto Scaling Group with launch template
 * - Security groups for ALB and instances
 * - IAM role with SSM, CloudWatch, and ASG lifecycle hook permissions
 * - Lifecycle hooks for graceful node startup/shutdown
 * - Health checks based on protocol monitoring config
 */
export class HANodesConstruct extends constructs.Construct {
    /**
     * The Application Load Balancer
     */
    public readonly alb: elbv2.ApplicationLoadBalancer;

    /**
     * The ALB target group
     */
    public readonly targetGroup: elbv2.ApplicationTargetGroup;

    /**
     * The Auto Scaling Group
     */
    public readonly autoScalingGroup: autoscaling.AutoScalingGroup;

    /**
     * The security group attached to the instances
     */
    public readonly instanceSecurityGroup: ec2.ISecurityGroup;

    /**
     * The security group attached to the ALB
     */
    public readonly albSecurityGroup: ec2.ISecurityGroup;

    /**
     * The IAM role attached to the instances
     */
    public readonly instanceRole: iam.IRole;

    /**
     * The VPC where the resources are deployed
     */
    public readonly vpc: ec2.IVpc;

    /**
     * The lifecycle hook name for instance launching
     */
    public readonly lifecycleHookName: string;

    constructor(scope: constructs.Construct, id: string, props: HANodesProps) {
        super(scope, id);

        const { protocolConfig, deploymentConfig, userDataScriptPath, vpc: providedVpc } = props;
        const { environment } = deploymentConfig;

        // Validate HA configuration is present
        const configurationLoader = new ConfigurationLoader();
        const haConfig = configurationLoader.getHAConfigVariables(environment);
        
        // Get stack context
        const stackName = cdk.Stack.of(this).stackName;

        // Set Lifecycle Hook Name and Autoscaling Group Name
        const lifecycleHookName = stackName;
        const autoScalingGroupName = stackName;

        // Store lifecycle hook name for external access
        this.lifecycleHookName = lifecycleHookName;

        // Uploading assets to S3 to be used furhter by user-data script
        const assetManager = new AssetsManager(scope);
        const comonAssetsS3Path = assetManager.uploadAssets();
        const protocolAssetsS3Path = assetManager.uploadProtocolAssets(environment.BLOCKCHAIN_PROTOCOL);

        const cfnandCDKUserDataConfig: CFNandCDKUserDataConfig = {
            STACK_NAME: stackName,
            LOGICAL_RESOURCE_ID: NoneValue,
            ASG_NAME: autoScalingGroupName,
            LIFECYCLE_HOOK_NAME: lifecycleHookName,
            COMMON_ASSETS_S3_PATH: comonAssetsS3Path,
            PROTOCOL_ASSETS_S3_PATH: protocolAssetsS3Path,
            SNAPSHOT_STAGING_VOL_ID: NoneValue,
        }

        const userDataManager = new UserDataManager(userDataScriptPath);
        const userDataScript = userDataManager.loadUserDataScript();

        const processedUserData = userDataManager.injectVariables(userDataScript, environment, cfnandCDKUserDataConfig);

        // Use provided VPC or lookup default VPC
        this.vpc = providedVpc || ec2.Vpc.fromLookup(this, "vpc", { isDefault: true });

        // Create security groups
        this.albSecurityGroup = this.createAlbSecurityGroup(protocolConfig, haConfig);
        this.instanceSecurityGroup = this.createInstanceSecurityGroup(protocolConfig, haConfig);

        // Create IAM role with SSM, CloudWatch, and ASG lifecycle hook permissions
        this.instanceRole = this.createInstanceRole(environment);

        // Grant the instance role read access scoped to ONLY the CDK asset
        // objects it downloads at boot (specific keys in the bootstrap assets
        // bucket), instead of a blanket s3:GetObject/ListBucket on "*".
        // Assets were uploaded above.
        const commonAsset = assetManager.getAsset();
        if (commonAsset) {
            commonAsset.bucket.grantRead(this.instanceRole, commonAsset.s3ObjectKey);
        }
        const protocolAsset = assetManager.getProtocolAssets();
        if (protocolAsset) {
            protocolAsset.bucket.grantRead(this.instanceRole, protocolAsset.s3ObjectKey);
        }

        // Add staging volume self-management permissions for HA mode.
        // In HA mode, instances are created dynamically by the ASG so they must
        // create, attach, detach, and delete their own staging volumes at
        // runtime (see assets/common/snapshot-staging.sh). Permissions are
        // scoped to volumes tagged "Purpose=snapshot-staging" and to instances
        // belonging to this stack's Auto Scaling Group — never account-wide.
        if (environment.SNAPSHOT_ENABLED && (environment.SNAPSHOT_STAGING_VOL_SIZE ?? 0) > 0) {
            const region = cdk.Stack.of(this).region;
            const account = cdk.Stack.of(this).account;
            const stagingTagKey = "Purpose";
            const stagingTagValue = "snapshot-staging";
            const volumeArn = `arn:aws:ec2:${region}:${account}:volume/*`;
            const instanceArn = `arn:aws:ec2:${region}:${account}:instance/*`;
            const role = this.instanceRole as iam.Role;

            // Create a staging volume — only when tagged Purpose=snapshot-staging.
            role.addToPolicy(new iam.PolicyStatement({
                effect: iam.Effect.ALLOW,
                actions: ["ec2:CreateVolume"],
                resources: [volumeArn],
                conditions: {
                    StringEquals: { [`aws:RequestTag/${stagingTagKey}`]: stagingTagValue },
                },
            }));

            // Allow tagging only as part of the CreateVolume call (tag-on-create).
            role.addToPolicy(new iam.PolicyStatement({
                effect: iam.Effect.ALLOW,
                actions: ["ec2:CreateTags"],
                resources: [volumeArn],
                conditions: {
                    StringEquals: { "ec2:CreateAction": "CreateVolume" },
                },
            }));

            // Attach/detach/delete only volumes tagged Purpose=snapshot-staging.
            role.addToPolicy(new iam.PolicyStatement({
                effect: iam.Effect.ALLOW,
                actions: ["ec2:AttachVolume", "ec2:DetachVolume", "ec2:DeleteVolume"],
                resources: [volumeArn],
                conditions: {
                    StringEquals: { [`aws:ResourceTag/${stagingTagKey}`]: stagingTagValue },
                },
            }));

            // Attach/detach also authorize against the instance resource. Limit
            // this to instances in this stack's Auto Scaling Group (ASG tags
            // every instance it launches with aws:autoscaling:groupName), so a
            // node can only manage volumes on its own peers — not arbitrary
            // instances in the account.
            role.addToPolicy(new iam.PolicyStatement({
                effect: iam.Effect.ALLOW,
                actions: ["ec2:AttachVolume", "ec2:DetachVolume"],
                resources: [instanceArn],
                conditions: {
                    StringEquals: { "aws:ResourceTag/aws:autoscaling:groupName": autoScalingGroupName },
                },
            }));

            // DescribeVolumes does not support resource-level permissions, so it
            // must use "*"; keep it region-scoped. This call is read-only.
            role.addToPolicy(new iam.PolicyStatement({
                effect: iam.Effect.ALLOW,
                actions: ["ec2:DescribeVolumes"],
                resources: ["*"],
                conditions: {
                    StringEquals: { "aws:RequestedRegion": region },
                },
            }));
        }

        // Create Application Load Balancer
        this.alb = this.createApplicationLoadBalancer(haConfig);

        // Create target group
        this.targetGroup = this.createTargetGroup(haConfig);

        // Create ALB listener
        this.createAlbListener(haConfig);

        // Determine machine image based on CPU type
        const machineImage = this.getMachineImage(environment.CPU_TYPE, userDataScriptPath);

        // Create launch template
        const launchTemplate = this.createLaunchTemplate(
            stackName,
            environment.INSTANCE_TYPE,
            machineImage,
            environment.DATA_VOLUMES,
            processedUserData
        );

        // Create Auto Scaling Group
        this.autoScalingGroup = this.createAutoScalingGroup(
            launchTemplate,
            haConfig,
            autoScalingGroupName
        );

        // Create lifecycle hook for graceful startup
        this.createLifecycleHook(
            haConfig, 
            lifecycleHookName
        );

        // Add CDK Nag suppressions
        this.addNagSuppressions();
    }


    /**
     * Create security group for the Application Load Balancer
     */
    private createAlbSecurityGroup(protocolConfig: ProtocolConfig, haConfig: HAConfig): ec2.SecurityGroup {
        const sg = new ec2.SecurityGroup(this, "alb-security-group", {
            vpc: this.vpc,
            description: `ALB Security Group for ${protocolConfig.BLOCKCHAIN_PROTOCOL} blockchain HA nodes`,
            allowAllOutbound: false,
        });

        // Determine the CIDR allowed to reach the ALB. Secure default: restrict
        // to the VPC CIDR so the RPC endpoint is not exposed to the internet.
        // Operators can widen this via HA_ALB_ALLOWED_CIDR (and must, if they
        // also set HA_ALB_INTERNET_FACING=true).
        const allowedCidr = haConfig.HA_ALB_ALLOWED_CIDR && haConfig.HA_ALB_ALLOWED_CIDR.trim() !== ""
            ? haConfig.HA_ALB_ALLOWED_CIDR.trim()
            : this.vpc.vpcCidrBlock;

        // Warn loudly if the endpoint is being exposed to the entire internet.
        if (haConfig.HA_ALB_INTERNET_FACING && allowedCidr === "0.0.0.0/0") {
            cdk.Annotations.of(this).addWarning(
                "HA ALB is internet-facing with HA_ALB_ALLOWED_CIDR=0.0.0.0/0: the " +
                "blockchain RPC endpoint will be reachable by anyone. Restrict " +
                "HA_ALB_ALLOWED_CIDR to trusted ranges and set HA_ALB_CERTIFICATE_ARN for TLS."
            );
        }

        // Allow inbound traffic on the listener port from the allowed CIDR only
        sg.addIngressRule(
            ec2.Peer.ipv4(allowedCidr),
            ec2.Port.tcp(haConfig.HA_ALB_HEALTHCHECK_PORT),
            `Allow inbound traffic on listener port ${haConfig.HA_ALB_HEALTHCHECK_PORT} from ${allowedCidr}`
        );

        // Allow outbound traffic to instances
        sg.addEgressRule(
            ec2.Peer.anyIpv4(),
            ec2.Port.tcp(haConfig.HA_ALB_HEALTHCHECK_PORT),
            `Allow outbound traffic to instances on port ${haConfig.HA_ALB_HEALTHCHECK_PORT}`
        );

        return sg;
    }

    /**
     * Create security group for the instances
     */
    private createInstanceSecurityGroup(protocolConfig: ProtocolConfig, haConfig: HAConfig): ec2.SecurityGroup {
        const sg = new ec2.SecurityGroup(this, "instance-security-group", {
            vpc: this.vpc,
            description: `Instance Security Group for ${protocolConfig.BLOCKCHAIN_PROTOCOL} blockchain HA nodes`,
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

        // Allow traffic from ALB security group only on the listener/target
        // port (not all TCP). The ALB forwards health-check and RPC traffic on
        // this single port; granting allTcp would let the ALB reach every
        // service port on the instance.
        sg.addIngressRule(
            this.albSecurityGroup,
            ec2.Port.tcp(haConfig.HA_ALB_HEALTHCHECK_PORT),
            `Allow traffic from ALB on listener port ${haConfig.HA_ALB_HEALTHCHECK_PORT}`
        );

        // Add egress rules - allow all outbound traffic
        sg.addEgressRule(ec2.Peer.anyIpv4(), ec2.Port.allTcp(), "Allow all outbound TCP");
        sg.addEgressRule(ec2.Peer.anyIpv4(), ec2.Port.allUdp(), "Allow all outbound UDP");

        return sg;
    }

    /**
     * Create IAM role with SSM, CloudWatch, and ASG lifecycle hook permissions
     */
    private createInstanceRole(environment: EnvironmentConfig): iam.Role {
        const role = new iam.Role(this, "instance-role", {
            assumedBy: new iam.ServicePrincipal("ec2.amazonaws.com"),
            description: "IAM role for blockchain HA node instances",
            managedPolicies: [
                iam.ManagedPolicy.fromAwsManagedPolicyName("AmazonSSMManagedInstanceCore"),
                iam.ManagedPolicy.fromAwsManagedPolicyName("CloudWatchAgentServerPolicy"),
            ],
        });

        // Add S3 read permissions for downloading assets.
        // Scoped to the specific CDK asset objects via Asset.grantRead() after
        // the role is created (see constructor), not a blanket "*" grant.

        // Add ASG lifecycle hook permissions, scoped to this stack's Auto
        // Scaling Group only (the ASG name equals the stack name — see
        // constructor). The instance only completes/heartbeats its own ASG's
        // lifecycle action, so it needs no access to other ASGs.
        const region = cdk.Stack.of(this).region;
        const account = cdk.Stack.of(this).account;
        const asgName = cdk.Stack.of(this).stackName;
        role.addToPolicy(new iam.PolicyStatement({
            effect: iam.Effect.ALLOW,
            actions: [
                "autoscaling:CompleteLifecycleAction",
                "autoscaling:RecordLifecycleActionHeartbeat",
            ],
            resources: [
                `arn:aws:autoscaling:${region}:${account}:autoScalingGroup:*:autoScalingGroupName/${asgName}`,
            ],
        }));

        // Add Secrets Manager permissions scoped to this stack's own secrets.
        // In HA mode multiple nodes share the same "<stackName>/..." secret
        // (e.g. Bitcoin RPC auth): the first node creates it, the rest read it.
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
     * Create Application Load Balancer.
     * Defaults to an INTERNAL scheme (reachable only from within the VPC).
     * Set HA_ALB_INTERNET_FACING=true to expose it to the internet.
     */
    private createApplicationLoadBalancer(haConfig: HAConfig): elbv2.ApplicationLoadBalancer {
        return new elbv2.ApplicationLoadBalancer(this, "alb", {
            vpc: this.vpc,
            internetFacing: haConfig.HA_ALB_INTERNET_FACING === true,
            securityGroup: this.albSecurityGroup,
            vpcSubnets: {
                subnetType: ec2.SubnetType.PUBLIC,
            },
        });
    }

    /**
     * Create target group for the ALB
     */
    private createTargetGroup(haConfig: HAConfig): elbv2.ApplicationTargetGroup {
        return new elbv2.ApplicationTargetGroup(this, "target-group", {
            vpc: this.vpc,
            port: haConfig.HA_ALB_HEALTHCHECK_PORT,
            protocol: elbv2.ApplicationProtocol.HTTP,
            targetType: elbv2.TargetType.INSTANCE,
            healthCheck: {
                enabled: true,
                path: haConfig.HA_ALB_HEALTHCHECK_PATH,
                port: haConfig.HA_ALB_HEALTHCHECK_PORT.toString(),
                protocol: elbv2.Protocol.HTTP,
                interval: cdk.Duration.seconds(haConfig.HA_ALB_HEALTHCHECK_INTERVAL_SEC),
                timeout: cdk.Duration.seconds(haConfig.HA_ALB_HEALTHCHECK_TIMEOUT_SEC),
                healthyThresholdCount: haConfig.HA_ALB_HEALTHCHECK_HEALTHY_THRESHOLD,
                unhealthyThresholdCount: haConfig.HA_ALB_HEALTHCHECK_UNHEALTHY_THRESHOLD,
                healthyHttpCodes: haConfig.HA_ALB_HEALTHCHECK_HTTP_CODES,
            },
            deregistrationDelay: cdk.Duration.seconds(haConfig.HA_ALB_DEREGISTRATION_DELAY_SEC ),
        });
    }

    /**
     * Create ALB listener. Uses HTTPS (TLS terminated at the ALB) when an ACM
     * certificate ARN is provided via HA_ALB_CERTIFICATE_ARN, otherwise HTTP.
     */
    private createAlbListener(haConfig: HAConfig): elbv2.ApplicationListener {
        const certArn = haConfig.HA_ALB_CERTIFICATE_ARN;
        const useTls = !!certArn && certArn !== "none" && certArn.trim() !== "";

        return this.alb.addListener("listener", {
            port: haConfig.HA_ALB_HEALTHCHECK_PORT,
            protocol: useTls ? elbv2.ApplicationProtocol.HTTPS : elbv2.ApplicationProtocol.HTTP,
            certificates: useTls ? [elbv2.ListenerCertificate.fromArn(certArn.trim())] : undefined,
            // Do NOT let CDK auto-open the listener to 0.0.0.0/0. Ingress is
            // controlled explicitly by the ALB security group (scoped to
            // HA_ALB_ALLOWED_CIDR / the VPC CIDR).
            open: false,
            defaultTargetGroups: [this.targetGroup],
        });
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
     * Create launch template for the Auto Scaling Group
     */
    private createLaunchTemplate(
        stackName: string,
        instanceType: string,
        machineImage: ec2.IMachineImage,
        dataVolumes: StorageVolumeConfig[],
        processedUserData: string
    ): ec2.LaunchTemplate {
        // Create block device mappings for data volumes
        const blockDevices: ec2.BlockDevice[] = [
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
        ];

        // Add data volumes
        dataVolumes.forEach((volumeConfig, index) => {

            // Skip instance store volumes - they are handled differently
            if (volumeConfig.TYPE === INSTANCE_STORAGE_DEVICE_VOLUME_TYPE) {
                return;
            }

            const volumeType = this.getEbsVolumeType(volumeConfig.TYPE);

            if (volumeConfig.TYPE === "gp3") {
                blockDevices.push({
                    deviceName: volumeConfig.DEVICE_NAME,
                    volume: ec2.BlockDeviceVolume.ebs(volumeConfig.SIZE, {
                        deleteOnTermination: true,
                        encrypted: true,
                        iops: volumeConfig.IOPS,
                        throughput: volumeConfig.THROUGHPUT,
                        volumeType: volumeType,
                    }),
                });
            } else {
                // io1, io2 volumes
                blockDevices.push({
                    deviceName: volumeConfig.DEVICE_NAME,
                    volume: ec2.BlockDeviceVolume.ebs(volumeConfig.SIZE, {
                        deleteOnTermination: true,
                        encrypted: true,
                        iops: volumeConfig.IOPS,
                        volumeType: volumeType,
                    }),
                });
            }
        });

        return new ec2.LaunchTemplate(this, "launch-template", {
            launchTemplateName: `${stackName}-launch-template`,
            instanceType: new ec2.InstanceType(instanceType),
            machineImage: machineImage,
            securityGroup: this.instanceSecurityGroup,
            role: this.instanceRole,
            blockDevices: blockDevices,
            userData: ec2.UserData.custom(processedUserData),
            detailedMonitoring: true,
        });
    }

    /**
     * Create Auto Scaling Group
     */
    private createAutoScalingGroup(
        launchTemplate: ec2.LaunchTemplate,
        haConfig: HAConfig,
        autoScalingGroupName: string,
    ): autoscaling.AutoScalingGroup {
        const asg = new autoscaling.AutoScalingGroup(this, "asg", {
            autoScalingGroupName: autoScalingGroupName,
            vpc: this.vpc,
            launchTemplate: launchTemplate,
            minCapacity: 1,
            maxCapacity: haConfig.HA_NUMBER_OF_NODES * 2,
            desiredCapacity: haConfig.HA_NUMBER_OF_NODES,
            healthChecks: autoscaling.HealthChecks.withAdditionalChecks({
                gracePeriod: cdk.Duration.minutes(haConfig.HA_ALB_HEALTHCHECK_GRACE_PERIOD_MIN),
                additionalTypes: [autoscaling.AdditionalHealthCheckType.ELB],
            }),
            vpcSubnets: {
                subnetType: ec2.SubnetType.PUBLIC,
            },
            updatePolicy: autoscaling.UpdatePolicy.rollingUpdate({
                maxBatchSize: 1,
                minInstancesInService: 1,
                pauseTime: cdk.Duration.minutes(5),
            }),
        });

        // Attach to target group
        asg.attachToApplicationTargetGroup(this.targetGroup);

        return asg;
    }

    /**
     * Create lifecycle hook for graceful startup
     */
    private createLifecycleHook(haConfig: HAConfig, lifecycleHookName: string) {

        new autoscaling.LifecycleHook(this, "lifecycle-hook", {
            autoScalingGroup: this.autoScalingGroup,
            lifecycleHookName: lifecycleHookName,
            lifecycleTransition: autoscaling.LifecycleTransition.INSTANCE_LAUNCHING,
            defaultResult: autoscaling.DefaultResult.ABANDON,
            heartbeatTimeout: cdk.Duration.minutes(haConfig.HA_NODES_HEARTBEAT_DELAY_MIN ),
        });

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
                    id: "AwsSolutions-EC23",
                    reason: "Blockchain protocols require wildcard inbound for specific P2P ports",
                },
                {
                    id: "AwsSolutions-IAM5",
                    reason: "Need read access to S3 bucket with assets and ASG lifecycle hook permissions",
                },
                {
                    id: "AwsSolutions-IAM4",
                    reason: "Using AWS managed policies for SSM and CloudWatch is acceptable for this use case",
                },
                {
                    id: "AwsSolutions-ELB2",
                    reason: "Access logging not required for blockchain node ALB in this use case",
                },
                {
                    id: "AwsSolutions-AS3",
                    reason: "ASG notifications not required for this use case",
                },
            ],
            true
        );
    }
}
