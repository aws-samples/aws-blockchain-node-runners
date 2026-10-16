# Dummy Protocol Node Runner

This is a dummy blockchain protocol implementation for testing and development purposes. It provides a minimal working example that can be used to validate the Universal Blockchain Node Runner infrastructure without requiring actual blockchain software.

**This blueprint also serves as the canonical reference implementation for external blueprint authors.** If you are creating a new blueprint package, use this as your template. See the [Blueprint Package Structure](#blueprint-package-structure) section below.

## Blueprint Package Structure

Every blueprint — built-in or external — is an NPM package with the following structure:

```
aws-bnr-blueprint-<protocol>/
├── package.json          # Standard NPM fields + "aws-blockchain-node-runner" protocol config
├── README.md             # Protocol-specific documentation
├── samples/              # Sample .env files for different deployment scenarios
├── configurations/       # (optional) Node configuration scripts/templates
├── user-data/            # Protocol-specific initialization scripts
│   ├── node.sh           # REQUIRED: Main node initialization script
│   └── syncchecker.sh    # (optional) Sync checker for traffic shaping
└── monitoring/           # (optional) CloudWatch dashboard templates
```

The `package.json` must include:
- Standard NPM fields: `name` (convention: `aws-bnr-blueprint-<protocol>`), `version`, `description`
- `peerDependencies`: `{ "aws-blockchain-node-runners": ">=2.0.0" }`
- `"aws-blockchain-node-runner"` field: Contains all protocol-specific configuration (ports, storage, instance types, etc.)

See this blueprint's [package.json](./package.json) for a complete example.

### Publishing as an External Blueprint

To publish your blueprint as an NPM package:

1. Create your blueprint following this structure
2. Ensure `package.json` has the `"aws-blockchain-node-runner"` field with all required fields
3. Publish to NPM: `npm publish`
4. Users install it: `npm install aws-bnr-blueprint-<protocol>`
5. Users set `BLOCKCHAIN_PROTOCOL="<protocol>"` in their `.env` and deploy

The `ConfigurationLoader` automatically discovers installed blueprints from `node_modules/` — no additional configuration needed.

For the complete `"aws-blockchain-node-runner"` field schema, see [Configuration Reference](../../docs/configuration-reference.md#protocol-configuration-blueprint-packagejson).

## Overview of Deployment Architectures

The Dummy protocol supports two deployment modes:

### Single Node Deployment

A single EC2 instance running the dummy node, suitable for development and testing.

```
┌─────────────────────────────────────────────────────────────┐
│                         VPC (Default)                        │
│  ┌─────────────────────────────────────────────────────────┐│
│  │                    Public Subnet                         ││
│  │  ┌─────────────────────────────────────────────────────┐││
│  │  │              EC2 Instance (Dummy Node)              │││
│  │  │  ┌─────────────┐  ┌─────────────────────────────┐  │││
│  │  │  │ EBS Volume  │  │    CloudWatch Agent         │  │││
│  │  │  │   /data     │  │    (Metrics & Logs)         │  │││
│  │  │  └─────────────┘  └─────────────────────────────┘  │││
│  │  └─────────────────────────────────────────────────────┘││
│  └─────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────┘
```

### High Availability (HA) Deployment

Multiple EC2 instances behind an Application Load Balancer with auto-scaling.

```
┌─────────────────────────────────────────────────────────────┐
│                         VPC (Default)                        │
│  ┌─────────────────────────────────────────────────────────┐│
│  │                Application Load Balancer                 ││
│  └─────────────────────────────────────────────────────────┘│
│                              │                               │
│  ┌───────────────────────────┼───────────────────────────┐  │
│  │                Auto Scaling Group                      │  │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐    │  │
│  │  │   Node 1    │  │   Node 2    │  │   Node N    │    │  │
│  │  │  (Primary)  │  │  (Replica)  │  │  (Replica)  │    │  │
│  │  └─────────────┘  └─────────────┘  └─────────────┘    │  │
│  └───────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

## Supported Configurations

The Dummy protocol provides sample configurations for testing different deployment scenarios:

### Available Configurations

| Configuration | Type | Best For |
|--------------|------|----------|
| dummy-1.0.0-rpc-base.sh | Base RPC | Basic testing and development |
| dummy-1.0.0-rpc-extended.sh | Extended RPC | Testing with additional features |

## Infrastructure Requirements

### Recommended Instance Types

| Network | Deployment | Instance Type | vCPUs | Memory | Storage |
|---------|-----------|---------------|-------|--------|---------|
| Testnet | Single Node | t3.medium | 2 | 4 GB | 100 GB gp3 |
| Testnet | HA (3 nodes) | t3.medium | 2 each | 4 GB each | 100 GB gp3 each |

*For cost estimates, use the [AWS Pricing Calculator](https://calculator.aws/) with your specific region and commitment level.

### Storage Requirements

| Network | Node Type | Current Size | Growth Rate | Recommended | Type | IOPS | Throughput |
|---------|-----------|-------------|-------------|-------------|------|------|------------|
| Testnet | RPC | ~10 GB | ~1 GB/month | 100 GB | gp3 | 3,000 | 125 MB/s |

### Network Traffic

- **P2P Traffic**: Minimal (testing protocol)
- **RPC Traffic**: Varies based on usage
- **Monitoring**: CloudWatch metrics and logs

## Setup Instructions

There are two ways to deploy a Dummy node.

### Option 1: AI-Driven Deployment (Recommended)

Deploy with a single prompt. In Kiro (or your AI assistant of choice), run:

```
@deploy a Dummy testnet node in us-east-1
```

The AI assistant will guide you through infrastructure selection, configuration, deployment, and initial healthcheck. For full setup, see [Getting Started](/docs/getting-started/quickstart).

### Option 2: Manual Deployment

#### Prerequisites

1. AWS CLI configured with appropriate credentials
2. Node.js 18+ and npm installed
3. CDK bootstrapped in your target region

**Tip**: Use [AWS CloudShell](https://docs.aws.amazon.com/cloudshell/latest/userguide/welcome.html) for a pre-configured environment with all tools ready.

#### Step 1: Configure Environment

Copy the appropriate sample configuration:

```bash
# For testnet single node
cp node_modules/aws-bnr-blueprint-dummy/samples/.env-testnet-single-node .env

# For testnet HA deployment
cp node_modules/aws-bnr-blueprint-dummy/samples/.env-testnet-ha-nodes .env
```

Edit `.env` with your AWS account details:

```bash
AWS_ACCOUNT_ID="your-account-id"
AWS_REGION="us-east-1"
```

#### Step 2: Choose Configuration

Select your preferred configuration by setting `CLIENT_CONFIG`:

```bash
# Base RPC configuration
CLIENT_CONFIG="dummy-1.0.0-rpc-base"

# Extended RPC configuration
CLIENT_CONFIG="dummy-1.0.0-rpc-extended"
```

#### Step 3: Deploy

```bash
# Bootstrap CDK (first time only)
npx cdk bootstrap

# Deploy the stack
npx cdk deploy --json --outputs-file deploy-output.json
```

For advanced options (HA mode, multiple stacks, maintenance), see the [Deployment Guide](/docs/guides/deployment-guide).

#### Step 4: Monitor Deployment

Monitor the deployment progress via CloudWatch dashboard:

```bash
# Get dashboard name from deployment output
DASHBOARD_NAME=$(cat deploy-output.json | jq -r '..|.DashboardName? | select(. != null)')
echo "Dashboard: https://console.aws.amazon.com/cloudwatch/home?region=$AWS_REGION#dashboards:name=$DASHBOARD_NAME"
```

Key metrics to watch:
- **c1_block_height**: Current block height
- **c1_blocks_behind**: Blocks behind network (should reach 0)
- **System metrics**: CPU, memory, disk usage

#### Step 5: Verify Node Operation

Once deployed, verify the node is running:

```bash
# Get instance ID
INSTANCE_ID=$(cat deploy-output.json | jq -r '..|.InstanceId? | select(. != null)')

# Connect via SSM
aws ssm start-session --target $INSTANCE_ID --region $AWS_REGION

# Check service status
sudo systemctl status node

# View logs
sudo journalctl -u node -f
```

## Configuration Options

### Dummy Protocol Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `DUMMY_NODE_TYPE` | Node type (validator/rpc) | validator |
| `DUMMY_SYNC_MODE` | Sync mode (fast/full) | fast |
| `DUMMY_LOG_LEVEL` | Log verbosity (debug/info/warn/error) | info |

## Troubleshooting

### Node Not Starting

**Diagnosis**:

1. **View node service logs in CloudWatch**:
   ```bash
   # View recent node.service logs
   aws logs tail /aws/ec2/blockchain-nodes/systemd-services --follow --filter-pattern "node.service"
   
   # View for specific instance
   export INSTANCE_ID=$(cat deploy-output.json | jq -r '..|.InstanceId? | select(. != null)')
   aws logs tail /aws/ec2/blockchain-nodes/systemd-services --follow --log-stream-names $INSTANCE_ID --filter-pattern "node.service"
   ```

2. **Check user data execution**:
   ```bash
   export INSTANCE_ID=$(cat deploy-output.json | jq -r '..|.InstanceId? | select(. != null)')
   aws logs tail /aws/ec2/blockchain-nodes/cloud-init-output --follow --log-stream-names $INSTANCE_ID
   ```

3. **If CloudWatch logs are not available, connect via SSM**:
   ```bash
   export INSTANCE_ID=$(cat deploy-output.json | jq -r '..|.InstanceId? | select(. != null)')
   aws ssm start-session --target $INSTANCE_ID --region $AWS_REGION
   
   # Check service status
   sudo systemctl status node
   
   # View service logs
   sudo journalctl -u node -n 100 --no-pager
   ```

**Solution**: Fix the specific issue and restart service:
```bash
# Connect via SSM
export INSTANCE_ID=$(cat deploy-output.json | jq -r '..|.InstanceId? | select(. != null)')
aws ssm start-session --target $INSTANCE_ID --region $AWS_REGION

# Restart service
sudo systemctl restart node

# Verify service started
sudo systemctl status node
```

### Metrics Not Appearing

Verify CloudWatch agent is running:

```bash
# Check agent status via CloudWatch logs for specific instance
export INSTANCE_ID=$(cat deploy-output.json | jq -r '..|.InstanceId? | select(. != null)')
aws logs tail /aws/ec2/blockchain-nodes/systemd-services --follow --log-stream-names $INSTANCE_ID --filter-pattern "cloudwatch-agent"

# Or connect via SSM to check
export INSTANCE_ID=$(cat deploy-output.json | jq -r '..|.InstanceId? | select(. != null)')
aws ssm start-session --target $INSTANCE_ID --region $AWS_REGION

sudo systemctl status amazon-cloudwatch-agent
sudo cat /opt/aws/amazon-cloudwatch-agent/logs/amazon-cloudwatch-agent.log
```

### Health Check Failures (HA)

Check the health endpoint:

```bash
# Get instance internal IP
export INSTANCE_ID=$(cat deploy-output.json | jq -r '..|.InstanceId? | select(. != null)')
NODE_INTERNAL_IP=$(aws ec2 describe-instances --instance-ids $INSTANCE_ID \
    --query 'Reservations[*].Instances[*].PrivateIpAddress' --output text)

# Test health endpoint (from within VPC)
curl http://$NODE_INTERNAL_IP:8545/health
```

For more detailed troubleshooting, see the [Troubleshooting Guide](../../docs/troubleshooting.md).

## Upgrades

### Upgrading Node Configuration

1. Update configuration variables in `.env` (for a new version, add a configuration script such as `dummy-1.0.1-rpc-base.sh` and point `CLIENT_CONFIG` at it)
2. Redeploy: `npx cdk deploy --json --outputs-file deploy-output.json`

On a single-node stack, the redeploy stops and starts the same instance, and node setup re-runs against the existing chain data on `/data`, so there's no re-sync. `cdk deploy` returns before setup has finished; watch `/var/log/cloud-init-output.log` for `Node deployment completed successfully`. See [How a redeploy applies changes](/docs/guides/deployment-guide#how-a-redeploy-applies-changes-single-node) in the Deployment Guide for the details, including which changes create a new stack instead.

### Re-run Contract for Blueprint Authors

Every blueprint's `user-data/node.sh` runs on first boot **and again whenever the configuration changes** on redeploy. On a re-run, `/etc/cdk_environment` has the new values, the new blueprint files are in `/opt/blueprints`, the data volumes are mounted with their existing data, and `node.service` has been stopped. `node.sh` must:

- install or replace binaries and configuration to match the current `CLIENT_CONFIG`
- guard one-time steps (snapshot download, genesis init, key generation) by checking for existing state, and never delete chain data
- (re)write `node.service` and start it, and exit non-zero on failure (the framework retries setup on the next boot)
- `touch /data/init-completed` when setup has finished

`user-data/node.sh` in this blueprint is the reference implementation. Don't size the client from the hardware in `node.sh`: an `INSTANCE_TYPE` change doesn't re-run it. Compute such values when the service starts instead.

### Rolling Updates (HA Only)

HA instances are replaced one at a time with a rolling update, keeping at least one in service. New instances start with empty data volumes and sync before they pass the ALB health check. See the [Deployment Guide](/docs/guides/deployment-guide#ha-deployments-rolling-updates).

## Cost Optimization

### Storage Optimization

- Use gp3 instead of io2 for most workloads (3x cheaper)
- Right-size storage based on actual usage
- Monitor disk usage and adjust as needed

### Compute Optimization

- Use ARM-based instances (Graviton) for 20% cost savings vs x86
- Use Savings Plans for 30-50% discount on long-term deployments
- Scale down test environments when not in use

### Network Optimization

- Use VPC endpoints for AWS service communication
- Monitor outbound traffic and optimize as needed

## Security Considerations

- RPC endpoints bind to internal IP only (not 0.0.0.0)
- P2P ports allow external connectivity for network participation
- Access control via Security Groups
- No SSH access - use AWS Systems Manager Session Manager
- Encrypted EBS volumes
- IAM roles with least privilege

## FAQ

**Q: Why use the Dummy protocol?**

A: The Dummy protocol is designed for:
- Testing CDK infrastructure without real blockchain software
- Validating monitoring and alerting configurations
- Development and CI/CD pipeline testing
- Learning the Universal Blockchain Node Runner architecture

**Q: Can I use this in production?**

A: No, the Dummy protocol is for testing purposes only. It simulates blockchain behavior but does not run actual blockchain software.

**Q: How do I switch between single-node and HA deployments?**

A: Copy the appropriate sample configuration (`.env-testnet-single-node` or `.env-testnet-ha-nodes`) and redeploy. The stack will be updated with the new deployment mode.

## Additional Resources

- [Configuration Reference](../../docs/configuration-reference.md) - Complete environment variable documentation
- [Troubleshooting Guide](../../docs/troubleshooting.md) - Common issues and solutions
- [Deployment Guide](../../docs/deployment-guide.md) - Detailed deployment scenarios

## Support

For issues and questions:
- Check [Troubleshooting Guide](../../docs/troubleshooting.md)
- Review [Configuration Reference](../../docs/configuration-reference.md)
- Open a GitHub issue
