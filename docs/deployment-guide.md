# Deployment Guide

This guide covers different deployment scenarios for the Universal Blockchain Node Runner, from development to production environments.

## Table of Contents

- [Prerequisites](#prerequisites)
- [Quick Start](#quick-start)
- [Deployment Modes](#deployment-modes)
- [Deployment Scenarios](#deployment-scenarios)
- [Best Practices](#best-practices)
- [Post-Deployment](#post-deployment)
- [Maintenance](#maintenance)
- [Destroying a Stack](#destroying-a-stack)
- [Troubleshooting](#troubleshooting)

## Prerequisites

### Required Tools

1. **AWS CLI** (v2.x or later)
   ```bash
   aws --version
   ```
   Install: https://docs.aws.amazon.com/cli/latest/userguide/getting-started-install.html

2. **Node.js** (v20.x or later)
   ```bash
   node --version
   ```
   Install: https://nodejs.org/

3. **Git**
   ```bash
   git --version
   ```

### AWS Account Setup

1. **AWS Account**: Active AWS account with appropriate permissions

2. **IAM Permissions**: To perform deployment, our IAM user/role needs:
   - CloudFormation full access
   - EC2 full access
   - IAM role creation
   - S3 bucket access
   - CloudWatch access
   - Auto Scaling (for HA deployments)
   - Elastic Load Balancing (for HA deployments)

3. **AWS CLI Configuration**:
   ```bash
   aws configure
   ```
   Provide:
   - AWS Access Key ID
   - AWS Secret Access Key
   - Default region
   - Output format (json recommended)

4. **Verify Configuration**:
   ```bash
   aws sts get-caller-identity
   ```

## Quick Start

### 1. Clone and Install

```bash
# Clone repository
git clone <repository-url>
cd aws-blockchain-node-runners

# Install dependencies
npm install
```

### 2. Bootstrap CDK

First-time setup in each account/region:

```bash
npx cdk bootstrap aws://ACCOUNT-ID/REGION
```

Example:
```bash
npx cdk bootstrap aws://123456789012/us-east-1
```

### 3. Configure Environment

```bash
# Copy sample configuration
cp node_modules/aws-bnr-blueprint-dummy/samples/.env-testnet .env

# Edit with your details
nano .env
```

Minimum required changes:
```bash
AWS_ACCOUNT_ID="your-account-id"
AWS_REGION="your-region"
```

> **Tip**: Run `aws sts get-caller-identity` to confirm your account ID. The deployment region is always taken from `AWS_REGION` in your `.env` — it overrides your AWS CLI profile default, so you can deploy to any region regardless of your profile configuration.

> **Tip**: If deployment fails because the instance type is not available in the default AZ, set `AWS_AZ` to a specific availability zone where your instance type is supported. For example, add `AWS_AZ="us-east-1a"` to your `.env` file. You can check which AZs support your instance type with:
> ```bash
> aws ec2 describe-instance-type-offerings --location-type availability-zone --filters Name=instance-type,Values=<type> --region <region>
> ```

### 4. Deploy

```bash
# Preview changes
npx cdk synth

# Backup .env file with stack name (for future reference)
STACK_NAME=$(npx cdk synth --quiet 2>&1 | grep "Stack created:" | awk '{print $3}')
cp .env .env-${STACK_NAME}

# Deploy stack
npx cdk deploy --json --outputs-file deploy-output-${STACK_NAME}.json

# Approve changes when prompted
```

**IMPORTANT: File Naming Convention**

After deployment, you'll have two files per deployment:
- `.env-{stack-name}` - Configuration backup (for reference)
- `deploy-output-{stack-name}.json` - Deployment outputs (required for operations)

**Examples:**
- `.env-solana-mainnet-beta-agave-rpc-base`
- `deploy-output-solana-mainnet-beta-agave-rpc-base.json`

**Why backup .env files:**
- Reference for what was deployed
- Useful for redeployment or troubleshooting
- Documents configuration decisions
- Not required for healthcheck (info extracted from stack name and logs)

**For multiple deployments:**
```bash
# List all deployments
ls deploy-output-*.json

# List all configuration backups
ls .env-*

# Each pair corresponds to a unique deployment
```

**Note**: The stack name is automatically generated in the format `${protocol}-${network}-${clientConfig}`. Version numbers, file extensions, and special characters are removed to reduce variability and allow version updates without changing the stack name.

### 5. Verify Deployment

```bash
# Set the deployment file (replace {stack-name} with your actual stack name)
export DEPLOY_FILE="deploy-output-{stack-name}.json"

# Get stack outputs
cat $DEPLOY_FILE | jq

# Get instance ID (single-node)
export INSTANCE_ID=$(cat $DEPLOY_FILE | jq -r '..|.InstanceId? | select(. != null)')
echo "INSTANCE_ID=$INSTANCE_ID"

# Connect to instance (single-node)
aws ssm start-session --target $INSTANCE_ID --region $AWS_REGION
```

## Deployment Modes

### Single-Node Deployment

**Use Cases**:
- Development and testing
- Personal blockchain node
- Low-traffic applications
- Cost-sensitive deployments

**Architecture**:
```
┌─────────────────────────────────────┐
│           VPC (Default)             │
│  ┌───────────────────────────────┐  │
│  │      Public Subnet            │  │
│  │  ┌─────────────────────────┐  │  │
│  │  │   EC2 Instance          │  │  │
│  │  │   - Blockchain Node     │  │  │
│  │  │   - EBS Volumes         │  │  │
│  │  │   - CloudWatch Agent    │  │  │
│  │  └─────────────────────────┘  │  │
│  └───────────────────────────────┘  │
└─────────────────────────────────────┘
```

**Configuration**:
```bash
DEPLOYMENT_MODE="single-node"
INSTANCE_TYPE="m6a.2xlarge"
```

**Characteristics**:
- Single point of failure
- Lower cost
- Simpler management
- Includes CloudWatch dashboard
- Direct instance access

### High Availability (HA) Deployment

**Use Cases**:
- Production workloads
- High-traffic applications
- Mission-critical services
- Redundancy requirements

**Architecture**:
```
┌─────────────────────────────────────────────────┐
│              VPC (Default)                      │
│  ┌───────────────────────────────────────────┐  │
│  │    Application Load Balancer              │  │
│  └────────────────┬──────────────────────────┘  │
│                   │                             │
│  ┌────────────────┴──────────────────────────┐  │
│  │        Auto Scaling Group                 │  │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────┐ │  │
│  │  │ Node 1   │  │ Node 2   │  │ Node N   │ │  │
│  │  │ (Primary)│  │ (Replica)│  │ (Replica)│ │  │
│  │  └──────────┘  └──────────┘  └──────────┘ │  │
│  └───────────────────────────────────────────┘  │
└─────────────────────────────────────────────────┘
```

**Configuration**:
```bash
DEPLOYMENT_MODE="ha-nodes"
HA_NUMBER_OF_NODES="3"
HA_ALB_HEALTHCHECK_PORT="8545"
HA_ALB_HEALTHCHECK_PATH="/health"
HA_ALB_HEALTHCHECK_GRACE_PERIOD_MIN="60"
HA_ALB_HEALTHCHECK_INTERVAL_SEC="30"
HA_ALB_HEALTHCHECK_TIMEOUT_SEC="5"
HA_ALB_HEALTHCHECK_HEALTHY_THRESHOLD="3"
HA_ALB_HEALTHCHECK_UNHEALTHY_THRESHOLD="2"
HA_NODES_HEARTBEAT_DELAY_MIN="10"
HA_ALB_DEREGISTRATION_DELAY_SEC="30"
```

**Characteristics**:
- High availability
- Auto-scaling capability
- Load balancing
- Higher cost
- No default dashboard (create custom)
- Graceful node replacement

## Deployment Scenarios

For specific deployment scenarios and configuration examples, refer to the protocol-specific documentation:

- **Dummy Protocol**: See [blueprints/dummy/README.md](https://github.com/aws-samples/aws-blockchain-node-runners/blob/main/blueprints/dummy/README.md) for testing and development scenarios
- **Future Protocols**: Each protocol will include deployment scenarios in its README

Sample configurations for each protocol are available in the blueprint package's `samples/` directory at `node_modules/aws-bnr-blueprint-{protocol}/samples/`.

## Best Practices

### Security

1. **Use IAM Roles**: Never use long-term credentials
   ```bash
   # Attach role to EC2 instances (done automatically)
   # Use AWS Systems Manager Session Manager for access
   ```

2. **Secrets Management**: Store sensitive data in AWS Secrets Manager
   ```bash
   # Create secret
   aws secretsmanager create-secret \
     --name my-protocol-secret \
     --secret-string '{"key":"value"}'
   
   # Reference in .env
   PROTOCOL_SECRET_ARN="arn:aws:secretsmanager:..."
   ```

3. **Network Security**: Minimize exposed ports
   - Only open required ports in security groups
   - Use private subnets for production (requires VPC configuration)
   - Enable VPC Flow Logs

   **Default network placement (by design):** Single-node instances and HA
   Auto Scaling Group instances are deployed into **public subnets of the
   default VPC and receive public IPs**. This is intentional — blockchain nodes
   need direct inbound P2P connectivity, and a public-subnet layout avoids NAT
   gateway cost/complexity. The security posture relies on the security group:
   - P2P ports are intentionally open to `0.0.0.0/0` (required for peer
     discovery).
   - RPC / WebSocket / metrics ports are marked `public: false` and are
     restricted to the VPC CIDR — they are **not** internet-reachable by default
     (in HA mode this is further governed by `HA_ALB_INTERNET_FACING` /
     `HA_ALB_ALLOWED_CIDR`, which default to internal/VPC-only).
   - Egress is effectively unrestricted (all TCP/UDP to `0.0.0.0/0`) because
     nodes must reach arbitrary peers across the internet.

   If you require defense-in-depth beyond the security group (e.g. instances in
   private subnets with a NAT gateway for egress, P2P via an EIP/NAT), deploy
   into a custom VPC configured that way rather than the default VPC.

4. **Encryption**: Enable encryption at rest
   - EBS volumes encrypted by default
   - Use KMS for additional control

### Performance

1. **Right-Size Instances**: Start with recommended types
   ```bash
   # Check protocol's package.json for recommendations
   cat node_modules/aws-bnr-blueprint-{protocol}/package.json | jq '."aws-blockchain-node-runner".defaultInstanceTypes'
   ```

2. **Optimize Storage**:
   - Use gp3 for cost-effective performance
   - Use io2 for high performance, but only if you require persistance
   - Use Instance Store if you need high performance and can tolerate ephemeral nature of it
   - Monitor IOPS and throughput metrics

3. **Enable Snapshots**: Significantly reduces sync time
   ```bash
   SNAPSHOT_ENABLED="true"
   SNAPSHOT_DOWNLOAD_URL="https://..."
   ```

   **Large Snapshots**: If the compressed archive plus extracted data exceeds available disk space (common with multi-TB snapshots on instance-store volumes), configure a staging volume to hold the archive during download:
   ```bash
   SNAPSHOT_STAGING_VOL_SIZE="5000"  # Size in GiB, ~1.1x compressed archive size
   ```
   This creates a temporary gp3 EBS volume that is automatically deleted after extraction. See [Snapshot Staging Guide](/docs/guides/snapshot-staging) for volume sizing guidance and cost analysis.

4. **Enable Traffic Shaping** (RPC nodes only): Reduces data transfer costs by up to 85%
   ```bash
   TRAFFIC_SHAPING_ENABLED="true"
   TRAFFIC_SHAPING_RATE_MBIT="40"
   TRAFFIC_SHAPING_CHECK_INTERVAL_SEC="60"
   TRAFFIC_SHAPING_MAX_BLOCKS_BEHIND="10"
   ```
   **Important**: Only use on RPC nodes. Do not use on validator/consensus nodes.
   See [Traffic Shaping Guide](/docs/guides/traffic-shaping) for detailed information and cost analysis.

5. **Monitor Performance**: Use CloudWatch metrics
   - CPU utilization
   - Disk I/O
   - Network throughput
   - Protocol-specific metrics
   - Traffic shaping metrics (if enabled): `c1_blocks_behind`

### Cost Optimization

1. **Use Appropriate Instance Types**:
   - Development: t3.medium, t3.large
   - Production: m6a.2xlarge, m6a.4xlarge
   - High-performance: i4i.2xlarge, i4i.4xlarge

2. **Optimize Storage**:
   - Use gp3 instead of io1/io2 when possible
   - Right-size IOPS (don't over-provision)

3. **Use ARM Instances**: Often 20% cheaper
   ```bash
   INSTANCE_TYPE="m6g.2xlarge"
   CPU_TYPE="ARM_64"
   ```

4. **Schedule Non-Production**: Stop instances when not needed
   ```bash
   # Use AWS Instance Scheduler or Lambda
   ```

5. **Monitor Costs**: Set up billing alerts
   ```bash
   aws budgets create-budget \
     --account-id 123456789012 \
     --budget file://budget.json
   ```

### Reliability

1. **Use HA Mode for Production**:
   ```bash
   DEPLOYMENT_MODE="ha-nodes"
   HA_NUMBER_OF_NODES="3"
   ```

2. **Configure Health Checks Properly**:
   - Appropriate grace period for node initialization
   - Reasonable interval and timeout
   - Correct health check endpoint

3. **Set Up Monitoring**:
   - CloudWatch dashboards
   - CloudWatch alarms
   - SNS notifications

4. **Implement Backup Strategy**:
   - Keep `.env` configuration files backed up
   - Document deployment settings
   - Use blockchain snapshot downloads for data recovery

5. **Plan for Updates**:
   - Test updates on testnet first
   - Use rolling updates for HA deployments
   - Have rollback plan

## Post-Deployment

### Verify Deployment

1. **Check Stack Status**:
   ```bash
   aws cloudformation describe-stacks \
     --stack-name YourStackName \
     --query 'Stacks[0].StackStatus'
   ```

2. **Get Outputs**:
   ```bash
   aws cloudformation describe-stacks \
     --stack-name YourStackName \
     --query 'Stacks[0].Outputs'
   ```

3. **Connect to Instance** (single-node):
   ```bash
   # Get instance ID from outputs
   export INSTANCE_ID=$(cat deploy-output.json | jq -r '..|.InstanceId? | select(. != null)')
   echo "INSTANCE_ID=$INSTANCE_ID"
   
   aws ssm start-session --target $INSTANCE_ID --region $AWS_REGION
   ```

4. **Check Node Status**:
   
   **Option 1: View logs in CloudWatch (recommended)**:
   ```bash
   # View node service logs
   aws logs tail /aws/ec2/blockchain-nodes/systemd-services --follow --filter-pattern "node.service"
   
   # View for specific instance
   export INSTANCE_ID=$(cat deploy-output.json | jq -r '..|.InstanceId? | select(. != null)')
   aws logs tail /aws/ec2/blockchain-nodes/systemd-services --follow --log-stream-names $INSTANCE_ID --filter-pattern "node.service"
   ```
   
   **Option 2: Connect via SSM**:
   ```bash
   # Check service status
   sudo systemctl status node
   
   # View logs directly
   sudo journalctl -u node -f
   ```

5. **Test RPC Endpoint**:
   
   **Note**: By default, security groups restrict RPC access to within the VPC IP range. To test the endpoint:
   
   a. **From within the VPC** (recommended - via SSM Session Manager):
   ```bash
   # Get instance ID from deploy outputs
   export INSTANCE_ID=$(cat deploy-output.json | jq -r '..|.InstanceId? | select(. != null)')
   
   # Connect to instance
   aws ssm start-session --target $INSTANCE_ID --region $AWS_REGION
   
   # Test locally
   curl http://localhost:8545
   ```
   
   b. **From outside the VPC** (requires security group modification):
   ```bash
   # Temporarily add your IP to security group
   aws ec2 authorize-security-group-ingress \
     --group-id sg-xxxxx \
     --protocol tcp \
     --port 8545 \
     --cidr your-ip/32
   
   # Test from your machine
   curl http://instance-ip:8545  # Single-node
   curl http://alb-dns-name:8545  # HA
   
   # Remove the rule after testing
   aws ec2 revoke-security-group-ingress \
     --group-id sg-xxxxx \
     --protocol tcp \
     --port 8545 \
     --cidr your-ip/32
   ```

### Configure Monitoring

1. **View CloudWatch Logs**:
   
   **Cloud-init output (deployment logs)**:
   ```bash
   # View deployment logs
   aws logs tail /aws/ec2/blockchain-nodes/cloud-init-output --follow
   
   # View for specific instance
   export INSTANCE_ID=$(cat deploy-output.json | jq -r '..|.InstanceId? | select(. != null)')
   aws logs tail /aws/ec2/blockchain-nodes/cloud-init-output --follow --log-stream-names $INSTANCE_ID
   ```
   
   **Systemd service logs (node.service, syncchecker.service, net-rules.service)**:
   
   **Note**: Ubuntu's rsyslog automatically forwards all systemd service logs to `/var/log/syslog`, which is collected by CloudWatch agent.
   
   ```bash
   # View all systemd service logs
   aws logs tail /aws/ec2/blockchain-nodes/systemd-services --follow
   
   # View specific service logs for specific instance
   export INSTANCE_ID=$(cat deploy-output.json | jq -r '..|.InstanceId? | select(. != null)')
   aws logs tail /aws/ec2/blockchain-nodes/systemd-services --follow --log-stream-names $INSTANCE_ID --filter-pattern "node.service"
   aws logs tail /aws/ec2/blockchain-nodes/systemd-services --follow --log-stream-names $INSTANCE_ID --filter-pattern "syncchecker.service"
   aws logs tail /aws/ec2/blockchain-nodes/systemd-services --follow --log-stream-names $INSTANCE_ID --filter-pattern "net-rules.service"
   
   # View all logs for specific instance (no service filter)
   aws logs tail /aws/ec2/blockchain-nodes/systemd-services --follow --log-stream-names $INSTANCE_ID
   ```
   
   **Note**: All systemd service logs are available in CloudWatch Logs. You can also connect via SSM and use `journalctl` if needed.

2. **Set Up Alarms**:
   ```bash
   aws cloudwatch put-metric-alarm \
     --alarm-name high-cpu \
     --alarm-description "Alert when CPU exceeds 80%" \
     --metric-name CPUUtilization \
     --namespace AWS/EC2 \
     --statistic Average \
     --period 300 \
     --threshold 80 \
     --comparison-operator GreaterThanThreshold \
     --evaluation-periods 2
   ```

## Maintenance

### Updates

1. **Update Node Version** (requires stack replacement):
   ```bash
   # Update .env
   CLIENT_VERSION="v1.15.0"
   
   # Destroy existing stack
   npx cdk destroy
   
   # Deploy new stack with updated version
   npx cdk deploy --json --outputs-file deploy-output.json
   ```
   
   **Note**: Version updates require instance replacement. For single-node deployments, this causes downtime. For HA deployments, use rolling updates (see below).

2. **Update Configuration** (non-instance changes):
   ```bash
   # Modify .env (e.g., HA health check settings)
   # Deploy changes
   npx cdk deploy --json --outputs-file deploy-output.json
   ```
   
   **Note**: Some configuration changes (like health check settings) can be updated without destroying the stack. Instance-level changes require replacement.

3. **Rolling Updates** (HA only):
   - For HA deployments, instance replacements happen automatically as rolling updates
   - New instances launched with updated configuration
   - Health checks verify new instances are healthy
   - Old instances terminated after deregistration delay
   - No downtime during the update process

### Scaling

1. **Vertical Scaling** (change instance type - requires stack replacement):
   ```bash
   # Update .env
   INSTANCE_TYPE="m6a.4xlarge"
   
   # Destroy existing stack
   npx cdk destroy
   
   # Deploy with new instance type
   npx cdk deploy --json --outputs-file deploy-output.json
   ```
   
   **Note**: Changing instance type requires instance replacement. For single-node, this causes downtime. For HA, rolling updates minimize downtime.

2. **Horizontal Scaling** (HA only - no downtime):
   ```bash
   # Update .env
   HA_NUMBER_OF_NODES="5"
   
   # Deploy (no destroy needed)
   npx cdk deploy --json --outputs-file deploy-output.json
   ```
   
   **Note**: Horizontal scaling in HA mode does not require stack destruction and causes no downtime.

3. **Storage Scaling** (live volume expansion):
   ```bash
   # Increase volume size (can be done live)
   aws ec2 modify-volume --volume-id vol-xxxxx --size 8000
   
   # Wait for modification to complete
   aws ec2 describe-volumes-modifications --volume-id vol-xxxxx
   
   # Connect to instance and extend filesystem
   export INSTANCE_ID=$(cat deploy-output.json | jq -r '..|.InstanceId? | select(. != null)')
   aws ssm start-session --target $INSTANCE_ID --region $AWS_REGION
   
   sudo resize2fs /dev/xvdg  # For ext4
   # OR
   sudo xfs_growfs /data  # For xfs
   ```
   
   **Note**: Storage can be expanded without destroying the stack or replacing instances.

### Backup and Recovery

**Note**: EBS snapshots are not recommended for blockchain nodes due to the large data size and slow lazy-loading performance. Instead, use blockchain-specific snapshot downloads from external sources (configured via `SNAPSHOT_DOWNLOAD_URL`).

For disaster recovery:
1. **Re-deploy from Configuration**: Keep your `.env` file backed up
2. **Use Blockchain Snapshots**: Download fresh blockchain data from trusted snapshot providers
3. **Document Configuration**: Maintain documentation of your deployment settings

### Monitoring and Alerting

1. **Regular Health Checks**:
   - Review CloudWatch dashboards daily
   - Check alarm status
   - Review logs for errors

2. **Performance Monitoring**:
   - Track sync status
   - Monitor resource utilization
   - Identify bottlenecks

3. **Cost Monitoring**:
   - Review AWS Cost Explorer
   - Check for unexpected charges
   - Optimize resource usage

## Destroying a Stack

To remove a deployed node and all associated AWS resources:

```bash
npx cdk destroy <stack-name>
```

The AI-driven workflow (`@deploy`) covers teardown as part of the session. Use the command above if you've exited the AI session and want to clean up manually.

## Troubleshooting

See [Troubleshooting Guide](/docs/guides/troubleshooting) for detailed troubleshooting steps.

## See Also

- [Configuration Reference](/docs/guides/configuration-reference) - Complete configuration documentation
- [Troubleshooting](/docs/guides/troubleshooting) - Common issues and solutions
- [Snapshot Staging](/docs/guides/snapshot-staging) - Staging volume for large snapshot downloads
- [Testing](/docs/guides/testing) - Testing guide
- [Adding New Protocols](/docs/ai-prompts/add-protocol-with-ai) - Protocol addition guide
- [Design Document](https://github.com/aws-samples/aws-blockchain-node-runners/blob/main/.kiro/specs/universal-blockchain-node-runner/design.md) - System architecture and design decisions
