# Troubleshooting Guide

This guide helps you diagnose and resolve common issues with the Universal Blockchain Node Runner.

## CRITICAL: Identify the Correct Deployment

**Before troubleshooting, always identify which deployment you're working with:**

```bash
# List all deployments
ls deploy-output-*.json

# Example output:
# deploy-output-solana-mainnet-beta-agave-rpc-base.json
# deploy-output-solana-mainnet-beta-agave-rpc-extended.json
# deploy-output-ethereum-mainnet-archive.json
```

**For GenAI tools:** Always ask the user which deployment to troubleshoot if multiple files exist. Confirm the stack name and instance ID before proceeding.

**Extract deployment information:**
```bash
# Replace {stack-name} with the actual stack name from the filename
export DEPLOY_FILE="deploy-output-{stack-name}.json"
export INSTANCE_ID=$(cat $DEPLOY_FILE | jq -r '..|.InstanceId? | select(. != null)')
export STACK_NAME=$(cat $DEPLOY_FILE | jq -r 'keys[0]')

echo "Troubleshooting deployment: $STACK_NAME"
echo "Instance ID: $INSTANCE_ID"
```

## Quick Checks

Start with these quick diagnostic commands for common issues:

1. **Deployment Failed**:
   ```bash
   # Use the correct stack name from deploy-output-{stack-name}.json
   aws cloudformation describe-stack-events \
     --stack-name $STACK_NAME \
     --query 'StackEvents[?ResourceStatus==`CREATE_FAILED`]'
   ```

2. **Node Not Starting**:
   ```bash
   # View node service logs in CloudWatch for specific instance
   aws logs tail /aws/ec2/blockchain-nodes/systemd-services \
     --follow \
     --log-stream-names $INSTANCE_ID \
     --filter-pattern "node.service"
   ```

3. **Health Check Failing** (HA deployments):
   ```bash
   # Extract target group ARN from deployment output
   export TG_ARN=$(cat $DEPLOY_FILE | jq -r '..|.TargetGroupArn? | select(. != null)')
   aws elbv2 describe-target-health --target-group-arn $TG_ARN
   ```

For detailed troubleshooting, see the sections below.

## Table of Contents

- [Quick Checks](#quick-checks)
- [Configuration Issues](#configuration-issues)
- [Deployment Issues](#deployment-issues)
- [Node Operation Issues](#node-operation-issues)
- [Networking Issues](#networking-issues)
- [Storage Issues](#storage-issues)
- [Monitoring Issues](#monitoring-issues)
- [Performance Issues](#performance-issues)
- [Traffic Shaping Issues](#traffic-shaping-issues)
- [Security Issues](#security-issues)

## Configuration Issues

### Protocol Not Found

**Symptom**: Error message "Protocol 'xyz' not found" or "No installed dependency declares protocol 'xyz'"

**Cause**: The specified protocol doesn't have an installed blueprint package, or is misspelled

**Solution**:
1. Check available protocols (installed blueprint packages):
   ```bash
   # List installed blueprint packages
   node -e "
     const pkg = require('./package.json');
     Object.entries(pkg.dependencies || {}).forEach(([name, ver]) => {
       try {
         const bp = require(name + '/package.json');
         if (bp['aws-blockchain-node-runner']) {
           console.log(bp['aws-blockchain-node-runner'].BLOCKCHAIN_PROTOCOL + ' -> ' + name);
         }
       } catch(e) {}
     });
   "
   ```
2. Verify `BLOCKCHAIN_PROTOCOL` in `.env` matches a protocol declared by an installed blueprint
3. Ensure protocol name is lowercase
4. If using an external blueprint, ensure it is listed in root `package.json` dependencies and `npm install` has been run

**Example**:
```bash
# Wrong
BLOCKCHAIN_PROTOCOL="Ethereum"

# Correct
BLOCKCHAIN_PROTOCOL="ethereum"
```

### Invalid package.json blueprint configuration

**Symptom**: Error parsing protocol configuration

**Cause**: Malformed JSON or missing `"aws-blockchain-node-runner"` field in the blueprint's `package.json` (resolved from `node_modules/`)

**Solution**:
1. Validate JSON syntax of the installed blueprint:
   ```bash
   cat node_modules/aws-bnr-blueprint-mychain/package.json | jq .
   ```
2. Check for:
   - Missing commas
   - Trailing commas
   - Unquoted strings
   - Mismatched brackets
   - Missing `"aws-blockchain-node-runner"` field

### Missing Required Environment Variables

**Symptom**: "Required environment variable X is not set"

**Cause**: `.env` file is missing required variables

**Solution**:
1. Check which variables are required:
   ```bash
   # Required for all deployments
   AWS_ACCOUNT_ID
   AWS_REGION
   BLOCKCHAIN_PROTOCOL
   DEPLOYMENT_MODE
   INSTANCE_TYPE
   CPU_TYPE
   BC_NETWORK
   CLIENT_CONFIG
   DATA_VOLUMES_COUNT
   ```
2. Copy from sample configuration:
   ```bash
   cp node_modules/aws-bnr-blueprint-{protocol}/samples/.env-mainnet .env
   ```
3. Fill in your values

### Invalid Storage Configuration

**Symptom**: "Storage configuration validation failed"

**Cause**: IOPS or throughput exceeds limits for volume type

**Solution**:
1. Check volume type limits:
   - gp3: 3,000-80,000 IOPS, 125-2,000 MB/s throughput
   - io1: 100-64,000 IOPS
   - io2: 100-64,000 IOPS
2. Adjust values in `.env`:
   ```bash
   DATA_VOL_1_IOPS="80000"  # Within new gp3 limit
   DATA_VOL_1_THROUGHPUT="2000"  # Within new gp3 limit
   ```

### HA Configuration Incomplete

**Symptom**: "HA configuration is incomplete"

**Cause**: `DEPLOYMENT_MODE="ha-nodes"` but HA variables not set

**Solution**:
1. Add all required HA variables:
   ```bash
   HA_NUMBER_OF_NODES="3"
   HA_ALB_HEALTHCHECK_PORT="8545"  # Use protocol's RPC port (8545 for Ethereum, 8899 for Solana)
   HA_ALB_HEALTHCHECK_PATH="/health"
   HA_ALB_HEALTHCHECK_GRACE_PERIOD_MIN="60"
   HA_ALB_HEALTHCHECK_INTERVAL_SEC="30"
   HA_ALB_HEALTHCHECK_TIMEOUT_SEC="5"
   HA_ALB_HEALTHCHECK_HEALTHY_THRESHOLD="3"
   HA_ALB_HEALTHCHECK_UNHEALTHY_THRESHOLD="2"
   HA_NODES_HEARTBEAT_DELAY_MIN="10"
   HA_ALB_DEREGISTRATION_DELAY_SEC="30"
   ```
2. Or use a sample HA configuration:
   ```bash
   cp node_modules/aws-bnr-blueprint-{protocol}/samples/.env-ha .env
   ```

## Deployment Issues

### CDK Bootstrap Required

**Symptom**: "This stack uses assets, so the toolkit stack must be deployed"

**Cause**: CDK not bootstrapped in the account/region

**Solution**:
```bash
npx cdk bootstrap aws://ACCOUNT-ID/REGION
```

**Example**:
```bash
npx cdk bootstrap aws://123456789012/us-east-1
```

### Insufficient IAM Permissions

**Symptom**: "User is not authorized to perform: iam:CreateRole"

**Cause**: AWS credentials lack necessary permissions

**Solution**:
1. Ensure your IAM user/role has permissions for:
   - CloudFormation
   - EC2
   - IAM
   - S3
   - CloudWatch
   - Auto Scaling (for HA)
   - Elastic Load Balancing (for HA)
2. Use AdministratorAccess for initial testing
3. Create custom policy for production:
   ```json
   {
     "Version": "2012-10-17",
     "Statement": [
       {
         "Effect": "Allow",
         "Action": [
           "cloudformation:*",
           "ec2:*",
           "iam:*",
           "s3:*",
           "cloudwatch:*",
           "autoscaling:*",
           "elasticloadbalancing:*"
         ],
         "Resource": "*"
       }
     ]
   }
   ```

### Region Mismatch Between .env and AWS Profile

**Symptom**: You expect deployment to one region but resources appear in another.

**Cause**: Previously, CDK would use the AWS CLI profile region (`CDK_DEFAULT_REGION`) instead of `AWS_REGION` from your `.env` file. This is no longer an issue — the app now enforces the `.env` region at startup.

**Current behavior**: `AWS_REGION` in your `.env` always determines the deployment region. If it differs from your CLI profile default, a note is printed at synth time:
```
Note: deploying to us-east-1 (from .env), AWS CLI profile default is us-west-2
```

**If you're still seeing unexpected regions**, verify `AWS_REGION` is correctly set in your `.env` file:
```bash
grep AWS_REGION .env
```

### Stack Already Exists

**Symptom**: "Stack [name] already exists"

**Cause**: Attempting to deploy with same stack name. Stack names are automatically generated from `BLOCKCHAIN_PROTOCOL`, `BC_NETWORK`, and `CLIENT_CONFIG` (e.g., `ethereum-mainnet-geth-1-14-0-lighthouse-2-5-1-full`).

**Solution**:
1. Update existing stack:
   ```bash
   npx cdk deploy --json --outputs-file deploy-output.json
   ```
2. Or destroy and redeploy:
   ```bash
   npx cdk destroy
   npx cdk deploy --json --outputs-file deploy-output.json
   ```
3. To deploy a different configuration alongside the existing one, change `BC_NETWORK` or `CLIENT_CONFIG` in your `.env` file to generate a unique stack name.

### Resource Limit Exceeded

**Symptom**: "You have exceeded the limit for X"

**Cause**: AWS service limits reached

**Solution**:
1. Check current limits:
   ```bash
   aws service-quotas list-service-quotas \
     --service-code ec2 \
     --query 'Quotas[?QuotaName==`Running On-Demand Standard instances`]'
   ```
2. Request limit increase via AWS Support
3. Or use different instance type/region

### Instance Type Not Available in Availability Zone

**Symptom**: Deployment fails with an error indicating the requested instance type is not available in the selected availability zone (e.g., "Your requested instance type is not supported in your requested Availability Zone")

**Cause**: The automatically selected availability zone does not support the configured EC2 instance type. Not all instance types are available in every AZ within a region.

**Solution**:

1. **Check which AZs support your instance type**:
   ```bash
   aws ec2 describe-instance-type-offerings \
     --location-type availability-zone \
     --filters Name=instance-type,Values=<type> \
     --region <region>
   ```
   Replace `<type>` with your instance type (e.g., `m6a.2xlarge`) and `<region>` with your AWS region.

2. **Set `AWS_AZ` in your `.env` file** to an AZ from the output above:
   ```bash
   AWS_AZ="us-east-1a"
   ```

3. **Redeploy**:
   ```bash
   npx cdk deploy --json --outputs-file deploy-output.json
   ```

**Notes**:
- `AWS_AZ` is only used for single-node deployments. HA deployments use the Auto Scaling Group's multi-AZ placement and ignore this setting.
- The AZ must belong to the configured `AWS_REGION` (e.g., `us-east-1a` for region `us-east-1`).
- See [Configuration Reference](/docs/guides/configuration-reference) for full details on the `AWS_AZ` variable.

### CloudFormation Rollback

**Symptom**: Stack creation failed and rolled back

**Cause**: Various - check CloudFormation events

**Solution**:
1. View stack events:
   ```bash
   aws cloudformation describe-stack-events \
     --stack-name YourStackName \
     --query 'StackEvents[?ResourceStatus==`CREATE_FAILED`]'
   ```
2. Check specific error messages
3. Fix configuration and redeploy
4. Common causes:
   - Invalid instance type for region
   - Insufficient capacity
   - Security group rule conflicts
   - IAM permission issues

## Node Operation Issues

### Node Not Starting

**Symptom**: Instance launches but node service fails to start

**Diagnosis**:

1. **View node service logs in CloudWatch**:
   ```bash
   # View recent node.service logs
   aws logs tail /aws/ec2/blockchain-nodes/systemd-services --follow --filter-pattern "node.service"
   
   # View for specific instance
   export INSTANCE_ID=$(cat deploy-output.json | jq -r '..|.InstanceId? | select(. != null)')
   aws logs tail /aws/ec2/blockchain-nodes/systemd-services --follow --log-stream-names $INSTANCE_ID --filter-pattern "node.service"
   ```

2. **Check service status via CloudWatch Logs Insights**:
   
   Navigate to CloudWatch Logs Insights and use this query to check for service failures:
   ```sql
   fields @timestamp, @message
   | filter @message like /node.service/ and @message like /error|failed|fatal/i
   | sort @timestamp desc
   | limit 50
   ```

3. **Check user data execution**:
   ```bash
   export INSTANCE_ID=$(cat deploy-output.json | jq -r '..|.InstanceId? | select(. != null)')
   aws logs tail /aws/ec2/blockchain-nodes/cloud-init-output --follow --log-stream-names $INSTANCE_ID
   ```

4. **If CloudWatch logs are not available, connect via SSM**:
   ```bash
   export INSTANCE_ID=$(cat deploy-output.json | jq -r '..|.InstanceId? | select(. != null)')
   aws ssm start-session --target $INSTANCE_ID --region $AWS_REGION
   
   # Check service status
   sudo systemctl status node
   
   # View service logs
   sudo journalctl -u node -n 100 --no-pager
   ```

**Common Causes**:

1. **Missing Dependencies**:
   ```bash
   # View dependency errors in CloudWatch for specific instance
   export INSTANCE_ID=$(cat deploy-output.json | jq -r '..|.InstanceId? | select(. != null)')
   aws logs tail /aws/ec2/blockchain-nodes/systemd-services --follow --log-stream-names $INSTANCE_ID --filter-pattern "node.service" | grep -i "error\|failed"
   
   # Or connect via SSM to check
   export INSTANCE_ID=$(cat deploy-output.json | jq -r '..|.InstanceId? | select(. != null)')
   aws ssm start-session --target $INSTANCE_ID --region $AWS_REGION
   dpkg -l | grep {package-name}
   ```

2. **Insufficient Disk Space**:
   ```bash
   # Connect via SSM to check disk space
   export INSTANCE_ID=$(cat deploy-output.json | jq -r '..|.InstanceId? | select(. != null)')
   aws ssm start-session --target $INSTANCE_ID --region $AWS_REGION
   df -h
   ```

3. **Port Already in Use**:
   ```bash
   # View port conflict errors in CloudWatch for specific instance
   export INSTANCE_ID=$(cat deploy-output.json | jq -r '..|.InstanceId? | select(. != null)')
   aws logs tail /aws/ec2/blockchain-nodes/systemd-services --follow --log-stream-names $INSTANCE_ID --filter-pattern "node.service" | grep -i "port\|address"
   
   # Or connect via SSM to check
   export INSTANCE_ID=$(cat deploy-output.json | jq -r '..|.InstanceId? | select(. != null)')
   aws ssm start-session --target $INSTANCE_ID --region $AWS_REGION
   sudo netstat -tulpn | grep {port}
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

Then verify in CloudWatch:
```bash
# Check for "Started" message for specific instance
export INSTANCE_ID=$(cat deploy-output.json | jq -r '..|.InstanceId? | select(. != null)')
aws logs tail /aws/ec2/blockchain-nodes/systemd-services --follow --log-stream-names $INSTANCE_ID --filter-pattern "node.service" | grep -i "started"
```

### Node Syncing Slowly

**Symptom**: Block height increasing very slowly

**Diagnosis**:
1. Check sync status:
   ```bash
   # Protocol-specific command (example for Ethereum)
   curl http://localhost:8545 -X POST \
     -H "Content-Type: application/json" \
     -d '{"jsonrpc":"2.0","method":"eth_syncing","params":[],"id":1}'
   
   # For Solana (port 8899)
   curl http://localhost:8899 -X POST \
     -H "Content-Type: application/json" \
     -d '{"jsonrpc":"2.0","method":"getHealth","params":[],"id":1}'
   ```

2. **Check CloudWatch Dashboard** (single-node deployments):
   - Review the "Volume Read/Write latency (ms/op)" widgets
   - High latency (>10ms for reads, >5ms for writes) indicates storage bottleneck
   - Check "Volume Read/Write (IO/sec)" for IOPS saturation
   - Review "Disk Used (%)" to ensure sufficient free space

3. Check network connectivity:
   ```bash
   ping -c 5 8.8.8.8
   ```

4. Check peer count:
   ```bash
   # Protocol-specific command (example for Ethereum)
   curl http://localhost:8545 -X POST \
     -H "Content-Type: application/json" \
     -d '{"jsonrpc":"2.0","method":"net_peerCount","params":[],"id":1}'
   
   # For Solana (port 8899)
   curl http://localhost:8899 -X POST \
     -H "Content-Type: application/json" \
     -d '{"jsonrpc":"2.0","method":"getClusterNodes","params":[],"id":1}'
   ```

**Solutions**:

1. **Enable Blockchain Snapshot**: Significantly reduces sync time
   ```bash
   SNAPSHOT_ENABLED="true"
   SNAPSHOT_DOWNLOAD_URL="https://snapshots.example.com/latest.tar.gz"
   ```

2. **Optimize Storage** (if high latency detected):
   
   a. Switch to io2 volumes for lower latency:
   ```bash
   DATA_VOL_1_TYPE="io2"
   DATA_VOL_1_IOPS="64000"
   ```
   
   b. Or use Instance Store for lowest latency (data is ephemeral):
   ```bash
   DATA_VOL_1_TYPE="instance-store"
   # Note: Data is lost on instance stop/termination
   # Requires instance types with instance store (i3, i4i, i4g, etc.)
   ```
   
   **Note**: Storage type changes require stack destruction and redeployment.

3. **Increase Instance Size**: More CPU/memory for faster processing
   ```bash
   INSTANCE_TYPE="m6a.4xlarge"  # Upgrade from 2xlarge
   ```

4. **Check Peers**: Ensure sufficient peer connections
   - Verify security group allows P2P ports
   - Verify network connectivity

### Node Crashed

**Symptom**: Node service stopped unexpectedly

**Diagnosis**:

1. **View crash logs in CloudWatch**:
   ```bash
   # View recent node.service errors for specific instance
   export INSTANCE_ID=$(cat deploy-output.json | jq -r '..|.InstanceId? | select(. != null)')
   aws logs tail /aws/ec2/blockchain-nodes/systemd-services --follow --log-stream-names $INSTANCE_ID --filter-pattern "node.service" | grep -i "error\|failed\|stopped"
   ```

2. **Check for OOM (Out of Memory) events**:
   ```bash
   # Connect via SSM to check system logs
   export INSTANCE_ID=$(cat deploy-output.json | jq -r '..|.InstanceId? | select(. != null)')
   aws ssm start-session --target $INSTANCE_ID --region $AWS_REGION
   
   sudo dmesg | grep -i "out of memory"
   sudo journalctl -xe | grep -i "oom"
   ```

3. **Check disk space**:
   ```bash
   # Connect via SSM
   export INSTANCE_ID=$(cat deploy-output.json | jq -r '..|.InstanceId? | select(. != null)')
   aws ssm start-session --target $INSTANCE_ID --region $AWS_REGION
   df -h
   ```

4. **View detailed service logs**:
   ```bash
   # View last 200 lines of node.service logs for specific instance
   export INSTANCE_ID=$(cat deploy-output.json | jq -r '..|.InstanceId? | select(. != null)')
   aws logs tail /aws/ec2/blockchain-nodes/systemd-services --follow --log-stream-names $INSTANCE_ID --filter-pattern "node.service" | tail -200
   ```

**Solutions**:

1. **Out of Memory**: Increase instance size
   ```bash
   INSTANCE_TYPE="m6a.4xlarge"  # More memory
   ```

2. **Disk Full**: Increase volume size
   ```bash
   # Modify volume size
   aws ec2 modify-volume --volume-id vol-xxxxx --size 4000
   
   # Connect via SSM to extend filesystem
   export INSTANCE_ID=$(cat deploy-output.json | jq -r '..|.InstanceId? | select(. != null)')
   aws ssm start-session --target $INSTANCE_ID --region $AWS_REGION
   sudo resize2fs /dev/xvdg
   ```

3. **Corrupted Data**: Restore from blockchain snapshot or resync
   ```bash
   # Connect via SSM
   export INSTANCE_ID=$(cat deploy-output.json | jq -r '..|.InstanceId? | select(. != null)')
   aws ssm start-session --target $INSTANCE_ID --region $AWS_REGION
   
   sudo systemctl stop node
   sudo rm -rf /data/blockchain/chaindata
   # Re-download blockchain snapshot or resync
   ```

4. **Verify service restarted**:
   ```bash
   # Check CloudWatch logs for "Started" message for specific instance
   export INSTANCE_ID=$(cat deploy-output.json | jq -r '..|.InstanceId? | select(. != null)')
   aws logs tail /aws/ec2/blockchain-nodes/systemd-services --follow --log-stream-names $INSTANCE_ID --filter-pattern "node.service" | grep -i "started"
   ```

## Networking Issues

### Cannot Connect to RPC Endpoint

**Symptom**: Connection refused when accessing RPC endpoint

**Diagnosis**:
1. Check if service is listening:
   ```bash
   # Check for RPC port (varies by protocol)
   sudo netstat -tulpn | grep LISTEN
   # Ethereum: 8545, Solana: 8899, Bitcoin: 8332
   ```
2. Check security group rules:
   ```bash
   aws ec2 describe-security-groups \
     --group-ids sg-xxxxx \
     --query 'SecurityGroups[0].IpPermissions'
   ```
3. Test locally on instance:
   ```bash
   # Use protocol-specific RPC port
   curl http://localhost:{rpc-port}
   # Ethereum: 8545, Solana: 8899, Bitcoin: 8332
   ```

**Solutions**:

1. **Service Not Running**: Start the service
   ```bash
   sudo systemctl start node
   ```

2. **Security Group**: Verify port is open
   - Check `requiredPorts` in protocol's `package.json` `"aws-blockchain-node-runner"` field
   - Ensure security group includes the port
   - For testing, temporarily allow from your IP

3. **Binding Address**: Ensure RPC service binds to internal IP address (security best practice)
   ```bash
   # Check configuration
   cat /data/blockchain/config/* | grep -i "listen\|bind\|rpc"
   
   # RPC should bind to internal IP for security
   # Correct: listen_addr = "172.31.x.x:8545" (internal IP)
   # Incorrect: listen_addr = "0.0.0.0:8545" (all interfaces - security risk)
   
   # Get internal IP
   TOKEN=$(curl -s -X PUT "http://169.254.169.254/latest/api/token" -H "X-aws-ec2-metadata-token-ttl-seconds: 21600")
   EC2_INTERNAL_IP=$(curl -H "X-aws-ec2-metadata-token: $TOKEN" -s http://169.254.169.254/latest/meta-data/local-ipv4)
   echo "Internal IP: $EC2_INTERNAL_IP"
   
   # Update configuration to use internal IP
   # Example: sed -i "s/0.0.0.0:8545/$EC2_INTERNAL_IP:8545/g" /data/blockchain/config/config.toml
   ```
   
   **Security Note**: 
   - **RPC endpoints**: Should bind to internal IP (e.g., `172.31.x.x:8545`)
   - **P2P endpoints**: Can bind to `0.0.0.0` (needs external connectivity)
   - Access control is managed via Security Groups, not binding addresses
   - Binding to internal IP provides defense-in-depth security

### Health Check Failing (HA)

**Symptom**: ALB marks targets as unhealthy

**Diagnosis**:
1. Check target health:
   ```bash
   aws elbv2 describe-target-health \
     --target-group-arn arn:aws:elasticloadbalancing:...
   ```
2. Test health check endpoint:
   ```bash
   # Use protocol-specific health check port and path
   curl http://instance-ip:{health-port}{health-path}
   # Example: curl http://instance-ip:8545/health (Ethereum)
   # Example: curl http://instance-ip:8899/health (Solana)
   ```
3. Check ALB logs (if enabled)

**Solutions**:

1. **Wrong Health Check Path**: Update configuration
   ```bash
   HA_ALB_HEALTHCHECK_PATH="/health"  # Correct path
   ```

2. **Node Not Ready**: Increase grace period
   ```bash
   HA_ALB_HEALTHCHECK_GRACE_PERIOD_MIN="90"  # More time to initialize
   ```

3. **Health Check Too Strict**: Adjust thresholds
   ```bash
   HA_ALB_HEALTHCHECK_HEALTHY_THRESHOLD="2"  # Reduce from 3
   HA_ALB_HEALTHCHECK_INTERVAL_SEC="60"  # Increase interval
   ```

4. **Port Mismatch**: Verify health check port matches protocol
   ```bash
   # Set to protocol's RPC port
   HA_ALB_HEALTHCHECK_PORT="8545"  # Ethereum
   HA_ALB_HEALTHCHECK_PORT="8899"  # Solana
   HA_ALB_HEALTHCHECK_PORT="8332"  # Bitcoin
   ```

### Peer Connection Issues

**Symptom**: Node has no peers or very few peers

**Diagnosis**:
1. Check peer count:
   ```bash
   # Protocol-specific command
   ```
2. Check P2P port accessibility:
   ```bash
   # Check for P2P ports (varies by protocol)
   sudo netstat -tulpn | grep LISTEN
   # Ethereum: 30303, Solana: 8001-8020 range, Bitcoin: 8333
   ```
3. Verify security group allows P2P ports

**Solutions**:

1. **Security Group**: Ensure P2P ports are open
   - Check both TCP and UDP
   - Allow from 0.0.0.0/0 for P2P ports

2. **Network Configuration**: Check node configuration
   - Verify external IP is correct
   - Check NAT traversal settings

## Storage Issues

### Disk Full

**Symptom**: "No space left on device"

**Diagnosis**:
```bash
df -h
du -sh /data/* | sort -h
```

**Solutions**:

1. **Increase Volume Size**:
   ```bash
   # Modify volume
   aws ec2 modify-volume --volume-id vol-xxxxx --size 4000
   
   # Wait for modification to complete
   aws ec2 describe-volumes-modifications --volume-id vol-xxxxx
   
   # Extend filesystem
   sudo resize2fs /dev/xvdg  # For ext4
   # OR
   sudo xfs_growfs /data  # For xfs
   ```

2. **Clean Up Old Data**:
   ```bash
   # Protocol-specific cleanup commands
   # Be careful - may require resync
   ```

3. **Add Additional Volume**:
   - Update `.env` with new volume
   - Redeploy stack
   - Migrate data if needed

### Disk Fills During Snapshot Download

**Symptom**: Disk fills to 100% during snapshot download or extraction, node never starts. CloudWatch logs show download stopping at ~60-70% or extraction failing with "No space left on device".

**Cause**: The compressed snapshot archive and extracted data both reside on the same `/data` volume. Peak disk usage = `compressed_archive_size + extracted_data_size`, which exceeds available space for large snapshots.

**Diagnosis**:
```bash
# Connect via SSM
export INSTANCE_ID=$(cat $DEPLOY_FILE | jq -r '..|.InstanceId? | select(. != null)')
aws ssm start-session --target $INSTANCE_ID --region $AWS_REGION

# Check disk usage
df -h /data

# Check if snapshot archive exists alongside extracted data
ls -lh /data/snapshot-archive 2>/dev/null || ls -lh /data/snapshot.tar.zst 2>/dev/null
```

**Solution**: Configure a snapshot staging volume to hold the compressed archive on a separate temporary EBS volume:

1. **Destroy the failed stack**:
   ```bash
   npx cdk destroy
   ```

2. **Add staging volume to `.env`** (set to ~1.1x the compressed archive size):
   ```bash
   # Example for Base mainnet op-reth (~4.86 TB archive)
   SNAPSHOT_STAGING_VOL_SIZE="5000"
   
   # Example for BNB mainnet bsc-reth (~9.7 TB archive)
   SNAPSHOT_STAGING_VOL_SIZE="10000"
   ```

3. **Redeploy**:
   ```bash
   npx cdk deploy --json --outputs-file deploy-output-$STACK_NAME.json
   ```

The staging volume is a temporary gp3 EBS volume that is automatically deleted after successful extraction. Cost is minimal (~$29 for a 5 TB volume over 2 days) compared to the cost of a failed deployment.

See [Snapshot Staging Guide](/docs/guides/snapshot-staging) for detailed volume sizing guidance per protocol.

### Orphaned Snapshot Staging Volume

**Symptom**: A gp3 EBS volume tagged `Purpose=snapshot-staging` remains in the account (and keeps incurring cost) after a deployment, even though the snapshot finished downloading.

**Cause**: The in-instance cleanup could not confirm the staging volume was deleted — for example a missing `ec2:DetachVolume`/`ec2:DeleteVolume` permission, a stalled detach, an unreachable metadata service, or the volume ID being lost after a mid-download reboot. Cleanup now logs this rather than swallowing it.

**Diagnosis**:
```bash
# Look for the cleanup error in cloud-init-output for the instance
export INSTANCE_ID=$(cat $DEPLOY_FILE | jq -r '..|.InstanceId? | select(. != null)')
aws logs tail /aws/ec2/blockchain-nodes/cloud-init-output \
  --log-stream-names $INSTANCE_ID \
  --filter-pattern "staging cleanup"

# List any staging volumes still present in the region
aws ec2 describe-volumes \
  --filters "Name=tag:Purpose,Values=snapshot-staging" \
  --query 'Volumes[].{Id:VolumeId,State:State,AZ:AvailabilityZone}' \
  --output table
```

**Solution**:
1. If the stack is still deployed, `npx cdk destroy` removes the volume via CloudFormation (`RemovalPolicy.DESTROY`).
2. If the volume is orphaned (its instance/stack is gone), delete it manually after confirming it is not in use:
   ```bash
   aws ec2 detach-volume --volume-id vol-xxxxxxxx 2>/dev/null || true
   aws ec2 wait volume-available --volume-ids vol-xxxxxxxx
   aws ec2 delete-volume --volume-id vol-xxxxxxxx
   ```
3. If cleanup failed due to missing permissions, confirm the instance role grants `ec2:DetachVolume` and `ec2:DeleteVolume` (single-node) or the HA self-management actions, then redeploy.

To validate the staging cleanup lifecycle cheaply, use the dummy debug path documented in [Snapshot Staging Guide](/docs/guides/snapshot-staging#testing-the-staging-lifecycle-dummy-blueprint) and look for the `STAGING DEBUG: PASS` line in `cloud-init-output`.

### Volume Not Mounting

**Symptom**: Volume exists but not mounted

**Diagnosis**:
```bash
lsblk
sudo blkid
mount | grep /data
```

**Solutions**:

1. **Check /etc/fstab**:
   ```bash
   cat /etc/fstab
   ```

2. **Mount Manually**:
   ```bash
   sudo mount /dev/xvdg /data
   ```

3. **Check setup-storage.sh Logs**:
   ```bash
   sudo cat /var/log/cloud-init-output.log | grep -A 20 "setup-storage"
   ```

4. **Verify Device Name**:
   ```bash
   # Device names may differ
   lsblk
   # Update mount command accordingly
   ```

### Poor I/O Performance

**Symptom**: High disk latency, slow read/write

**Diagnosis**:
1. Check I/O metrics:
   ```bash
   iostat -x 5
   ```
2. Check CloudWatch metrics:
   - VolumeReadOps
   - VolumeWriteOps
   - VolumeThroughputPercentage
   - VolumeQueueLength

**Solutions**:

1. **Increase IOPS**:
   ```bash
   DATA_VOL_1_IOPS="80000"  # New gp3 maximum
   ```

2. **Increase Throughput** (gp3 only):
   ```bash
   DATA_VOL_1_THROUGHPUT="2000"  # New gp3 maximum
   ```

3. **Use io2 Volumes**:
   ```bash
   DATA_VOL_1_TYPE="io2"
   DATA_VOL_1_IOPS="64000"
   ```

4. **Use Instance Store** (if available):
   ```bash
   DATA_VOL_1_TYPE="instance-store"
   # Note: Data is ephemeral
   ```

5. **Verify Instance Store Volume Selection**:
   ```bash
   # List all NVMe devices
   lsblk | grep nvme
   
   # Check which volumes are mounted
   df -h | grep nvme
   
   # View instance store setup logs
   sudo cat /var/log/cloud-init-output.log | grep -A 30 "setup-storage"
   ```

## Monitoring Issues

### CloudWatch Log Groups

The CloudWatch agent is configured to send the following logs to CloudWatch Logs:

| Log Group | Description | Retention | Source |
|-----------|-------------|-----------|--------|
| `/aws/ec2/blockchain-nodes/cloud-init-output` | Cloud-init output | 7 days | `/var/log/cloud-init-output.log` |
| `/aws/ec2/blockchain-nodes/systemd-services` | Systemd service logs | 7 days | `/var/log/syslog` |

**Note**: Ubuntu's rsyslog automatically forwards all systemd service logs to `/var/log/syslog`, which is then collected by the CloudWatch agent.

**Viewing Logs**:

```bash
# View cloud-init output (most useful for troubleshooting deployment)
aws logs tail /aws/ec2/blockchain-nodes/cloud-init-output --follow

# View systemd service logs (node.service, syncchecker.service, net-rules.service)
aws logs tail /aws/ec2/blockchain-nodes/systemd-services --follow

# View logs for specific instance
export INSTANCE_ID=$(cat deploy-output.json | jq -r '..|.InstanceId? | select(. != null)')
aws logs tail /aws/ec2/blockchain-nodes/cloud-init-output --follow --log-stream-names $INSTANCE_ID
aws logs tail /aws/ec2/blockchain-nodes/systemd-services --follow --log-stream-names $INSTANCE_ID

# Filter logs by service name for specific instance
aws logs tail /aws/ec2/blockchain-nodes/systemd-services --follow --log-stream-names $INSTANCE_ID --filter-pattern "node.service"
aws logs tail /aws/ec2/blockchain-nodes/systemd-services --follow --log-stream-names $INSTANCE_ID --filter-pattern "syncchecker.service"
aws logs tail /aws/ec2/blockchain-nodes/systemd-services --follow --log-stream-names $INSTANCE_ID --filter-pattern "net-rules.service"
```

**CloudWatch Logs Insights Queries**:

Use CloudWatch Logs Insights for advanced log analysis. Example query to check node.service errors:

```sql
-- View node.service errors
fields @timestamp, @message
| filter @message like /node.service/ and @message like /error|failed|fatal/i
| sort @timestamp desc
| limit 50
```

**Accessing Logs via Console**:

1. Open the [CloudWatch Logs Console](https://console.aws.amazon.com/cloudwatch/home#logsV2:log-groups)
2. Navigate to log group: `/aws/ec2/blockchain-nodes/systemd-services`
3. Select the log stream for your instance (instance ID)
4. Use the filter box to search for specific services:
   - `node.service` - Main blockchain node service
   - `syncchecker.service` - Sync checker and traffic shaping control
   - `net-rules.service` - Traffic shaping network rules
5. Click "Actions" → "View in Logs Insights" for advanced queries

### Metrics Not Appearing

**Symptom**: CloudWatch dashboard shows no data

**Diagnosis**:
1. Check CloudWatch agent status:
   ```bash
   sudo systemctl status amazon-cloudwatch-agent
   ```
2. Check agent logs:
   ```bash
   sudo cat /opt/aws/amazon-cloudwatch-agent/logs/amazon-cloudwatch-agent.log
   ```
3. Check agent logs in CloudWatch (if available):
   ```bash
   export INSTANCE_ID=$(cat deploy-output.json | jq -r '..|.InstanceId? | select(. != null)')
   aws logs tail /aws/ec2/blockchain-nodes/systemd-services --follow --log-stream-names $INSTANCE_ID --filter-pattern "cloudwatch-agent"
   ```
4. Or check agent logs directly on instance:
   ```bash
   export INSTANCE_ID=$(cat deploy-output.json | jq -r '..|.InstanceId? | select(. != null)')
   aws ssm start-session --target $INSTANCE_ID --region $AWS_REGION
   
   sudo cat /opt/aws/amazon-cloudwatch-agent/logs/amazon-cloudwatch-agent.log
   ```
5. Verify IAM permissions:
   ```bash
   aws sts get-caller-identity
   ```

**Solutions**:

1. **Restart CloudWatch Agent**:
   ```bash
   # Connect via SSM
   export INSTANCE_ID=$(cat deploy-output.json | jq -r '..|.InstanceId? | select(. != null)')
   aws ssm start-session --target $INSTANCE_ID --region $AWS_REGION
   
   sudo systemctl restart amazon-cloudwatch-agent
   ```

2. **Check IAM Role**: Ensure instance has CloudWatch permissions
   - CloudWatchAgentServerPolicy
   - Custom metrics permissions

3. **Verify Configuration**:
   ```bash
   # Connect via SSM
   export INSTANCE_ID=$(cat deploy-output.json | jq -r '..|.InstanceId? | select(. != null)')
   aws ssm start-session --target $INSTANCE_ID --region $AWS_REGION
   
   sudo cat /opt/aws/amazon-cloudwatch-agent/etc/custom-amazon-cloudwatch-agent.json
   ```

4. **Check Region**: Ensure metrics sent to correct region

### Dashboard Not Created

**Symptom**: CloudWatch dashboard doesn't exist after deployment

**Diagnosis**:
1. Check CloudFormation stack outputs
2. Check CDK synthesis output

**Solutions**:

1. **Single-Node Only**: Dashboards only created for single-node deployments
   - HA deployments don't include default dashboard
   - Create custom dashboard for HA

## Performance Issues

### High CPU Usage

**Symptom**: CPU consistently above 80%

**Diagnosis**:
```bash
top
htop  # If installed
```

**Solutions**:

1. **Increase Instance Size**:
   ```bash
   INSTANCE_TYPE="m6a.4xlarge"  # More vCPUs
   ```

2. **Optimize Node Configuration**:
   - Reduce cache size
   - Adjust thread count
   - Disable unnecessary features

3. **Check for Runaway Processes**:
   ```bash
   ps aux --sort=-%cpu | head -10
   ```

### High Memory Usage

**Symptom**: Memory consistently above 80%, potential OOM

**Diagnosis**:
```bash
free -h
sudo dmesg | grep -i "out of memory"
```

**Solutions**:

1. **Increase Instance Size**:
   ```bash
   INSTANCE_TYPE="m6a.4xlarge"  # More memory
   ```

2. **Optimize Node Configuration**:
   - Reduce cache size
   - Adjust memory limits
   - Enable swap (temporary solution)

3. **Add Swap** (temporary only as it puts more pressure on storage):
   ```bash
   sudo fallocate -l 8G /swapfile
   sudo chmod 600 /swapfile
   sudo mkswap /swapfile
   sudo swapon /swapfile
   ```

### Slow Deployment

**Symptom**: CDK deployment takes very long

**Causes**:
- Slow instance initialization
- Snapshot download

**Solutions**:

1. **Faster Instance**: Use larger instance type temporarily

2. **Optimize Snapshot**: Use compressed snapshots

3. **Parallel Deployment**: Deploy multiple stacks in parallel (only if stacks deploy different protocols)

## Traffic Shaping Issues

### Traffic Shaping Not Working

**Symptom**: Traffic shaping enabled but bandwidth not limited

**Diagnosis**:

1. **Check net-rules service status in CloudWatch**:
   ```bash
   # View net-rules.service logs for specific instance
   export INSTANCE_ID=$(cat deploy-output.json | jq -r '..|.InstanceId? | select(. != null)')
   aws logs tail /aws/ec2/blockchain-nodes/systemd-services --follow --log-stream-names $INSTANCE_ID --filter-pattern "net-rules.service"
   
   # Check for service start/stop events
   aws logs tail /aws/ec2/blockchain-nodes/systemd-services --follow --log-stream-names $INSTANCE_ID --filter-pattern "net-rules.service" | grep -i "started\|stopped"
   ```

2. **Check sync checker status in CloudWatch**:
   ```bash
   # View syncchecker.service logs for specific instance
   aws logs tail /aws/ec2/blockchain-nodes/systemd-services --follow --log-stream-names $INSTANCE_ID --filter-pattern "syncchecker.service"
   ```

3. **Verify traffic shaping configuration**:
   ```bash
   # Connect via SSM to check configuration
   export INSTANCE_ID=$(cat deploy-output.json | jq -r '..|.InstanceId? | select(. != null)')
   aws ssm start-session --target $INSTANCE_ID --region $AWS_REGION
   
   cat /etc/cdk_environment | grep TRAFFIC_SHAPING
   sudo systemctl status net-rules.service
   sudo systemctl status syncchecker.timer
   ```

**Solutions**:

1. **Service Not Running**: Start the service
   ```bash
   # Connect via SSM
   export INSTANCE_ID=$(cat deploy-output.json | jq -r '..|.InstanceId? | select(. != null)')
   aws ssm start-session --target $INSTANCE_ID --region $AWS_REGION
   
   sudo systemctl start net-rules.service
   sudo systemctl status net-rules.service
   ```
   
   Then verify in CloudWatch:
   ```bash
   aws logs tail /aws/ec2/blockchain-nodes/systemd-services --follow --log-stream-names $INSTANCE_ID --filter-pattern "net-rules.service" | grep -i "started"
   ```

2. **Sync Checker Not Running**: Start the timer
   ```bash
   # Connect via SSM
   export INSTANCE_ID=$(cat deploy-output.json | jq -r '..|.InstanceId? | select(. != null)')
   aws ssm start-session --target $INSTANCE_ID --region $AWS_REGION
   
   sudo systemctl start syncchecker.timer
   sudo systemctl status syncchecker.timer
   ```
   
   Then verify in CloudWatch:
   ```bash
   aws logs tail /aws/ec2/blockchain-nodes/systemd-services --follow --log-stream-names $INSTANCE_ID --filter-pattern "syncchecker.service"
   ```

3. **Node Not Fully Synced**: Traffic shaping only activates when node is fully synchronized
   - Check node sync status using protocol-specific commands
   - Wait for initial sync to complete
   - Check `c1_blocks_behind` metric in CloudWatch
   - View sync status in CloudWatch logs:
     ```bash
     export INSTANCE_ID=$(cat deploy-output.json | jq -r '..|.InstanceId? | select(. != null)')
     aws logs tail /aws/ec2/blockchain-nodes/systemd-services --follow --log-stream-names $INSTANCE_ID --filter-pattern "syncchecker.service" | grep -i "blocks behind\|slots behind"
     ```

4. **Configuration Error**: Verify environment variables
   ```bash
   # Connect via SSM
   export INSTANCE_ID=$(cat deploy-output.json | jq -r '..|.InstanceId? | select(. != null)')
   aws ssm start-session --target $INSTANCE_ID --region $AWS_REGION
   
   # Should show true
   echo $TRAFFIC_SHAPING_ENABLED
   
   # Should show configured rate
   echo $TRAFFIC_SHAPING_RATE_MBIT
   ```

### Traffic Shaping Causing Sync Issues

**Symptom**: Node falling behind after traffic shaping enabled

**Diagnosis**:

1. **Check blocks behind metric in CloudWatch**:
   ```bash
   export INSTANCE_ID=$(cat deploy-output.json | jq -r '..|.InstanceId? | select(. != null)')
   aws cloudwatch get-metric-statistics \
       --namespace CWAgent \
       --metric-name c1_blocks_behind \
       --dimensions Name=InstanceId,Value=$INSTANCE_ID \
       --start-time $(date -u -d '1 hour ago' +%Y-%m-%dT%H:%M:%S) \
       --end-time $(date -u +%Y-%m-%dT%H:%M:%S) \
       --period 60 \
       --statistics Average \
       --region $AWS_REGION
   ```

2. **Check if traffic shaping is active in CloudWatch**:
   ```bash
   # View net-rules service status for specific instance
   export INSTANCE_ID=$(cat deploy-output.json | jq -r '..|.InstanceId? | select(. != null)')
   aws logs tail /aws/ec2/blockchain-nodes/systemd-services --follow --log-stream-names $INSTANCE_ID --filter-pattern "net-rules.service"
   ```

3. **Check sync checker logs in CloudWatch**:
   ```bash
   # View sync checker activity for specific instance
   aws logs tail /aws/ec2/blockchain-nodes/systemd-services --follow --log-stream-names $INSTANCE_ID --filter-pattern "syncchecker.service"
   ```

**Solutions**:

1. **Rate Too Low**: Increase bandwidth limit
   ```bash
   # Update .env
   TRAFFIC_SHAPING_RATE_MBIT="50"  # Increase from 40
   
   # Redeploy
   npx cdk deploy --json --outputs-file deploy-output.json
   ```

2. **Threshold Too High**: Reduce max blocks behind threshold
   ```bash
   # Update .env
   TRAFFIC_SHAPING_MAX_BLOCKS_BEHIND="5"  # Reduce from 10
   
   # Redeploy
   npx cdk deploy --json --outputs-file deploy-output.json
   ```

3. **Disable Traffic Shaping**: If issues persist
   ```bash
   # Update .env
   TRAFFIC_SHAPING_ENABLED="false"
   
   # Redeploy
   npx cdk deploy --json --outputs-file deploy-output.json
   ```

4. **Manual Override**: Temporarily disable traffic shaping
   ```bash
   # Connect via SSM
   export INSTANCE_ID=$(cat deploy-output.json | jq -r '..|.InstanceId? | select(. != null)')
   aws ssm start-session --target $INSTANCE_ID --region $AWS_REGION
   
   # Stop traffic shaping
   sudo systemctl stop net-rules.service
   
   # Stop sync checker
   sudo systemctl stop syncchecker.timer
   ```
   
   Then verify in CloudWatch:
   ```bash
   aws logs tail /aws/ec2/blockchain-nodes/systemd-services --follow --log-stream-names $INSTANCE_ID --filter-pattern "net-rules.service" | grep -i "stopped"
   ```

### Traffic Shaping Metrics Not Appearing

**Symptom**: `c1_blocks_behind` metric not showing in CloudWatch

**Diagnosis**:

1. **Check sync checker logs in CloudWatch**:
   ```bash
   # View syncchecker.service logs for specific instance
   export INSTANCE_ID=$(cat deploy-output.json | jq -r '..|.InstanceId? | select(. != null)')
   aws logs tail /aws/ec2/blockchain-nodes/systemd-services --follow --log-stream-names $INSTANCE_ID --filter-pattern "syncchecker.service"
   ```

2. **Check CloudWatch agent status**:
   ```bash
   # Connect via SSM
   export INSTANCE_ID=$(cat deploy-output.json | jq -r '..|.InstanceId? | select(. != null)')
   aws ssm start-session --target $INSTANCE_ID --region $AWS_REGION
   
   sudo systemctl status amazon-cloudwatch-agent
   ```

3. **Verify IAM permissions**:
   ```bash
   # Instance should have CloudWatch PutMetricData permission
   aws sts get-caller-identity
   ```

**Solutions**:

1. **Sync Checker Not Running**: Start the service
   ```bash
   # Connect via SSM
   export INSTANCE_ID=$(cat deploy-output.json | jq -r '..|.InstanceId? | select(. != null)')
   aws ssm start-session --target $INSTANCE_ID --region $AWS_REGION
   
   sudo systemctl start syncchecker.timer
   sudo systemctl status syncchecker.timer
   ```
   
   Then verify in CloudWatch:
   ```bash
   aws logs tail /aws/ec2/blockchain-nodes/systemd-services --follow --log-stream-names $INSTANCE_ID --filter-pattern "syncchecker.service"
   ```

2. **CloudWatch Agent Issue**: Restart the agent
   ```bash
   # Connect via SSM
   export INSTANCE_ID=$(cat deploy-output.json | jq -r '..|.InstanceId? | select(. != null)')
   aws ssm start-session --target $INSTANCE_ID --region $AWS_REGION
   
   sudo systemctl restart amazon-cloudwatch-agent
   ```

3. **Script Error**: Check for errors in sync checker
   ```bash
   # View errors in CloudWatch for specific instance
   export INSTANCE_ID=$(cat deploy-output.json | jq -r '..|.InstanceId? | select(. != null)')
   aws logs tail /aws/ec2/blockchain-nodes/systemd-services --follow --log-stream-names $INSTANCE_ID --filter-pattern "syncchecker.service" | grep -i "error\|failed"
   
   # Or run manually via SSM to see errors
   export INSTANCE_ID=$(cat deploy-output.json | jq -r '..|.InstanceId? | select(. != null)')
   aws ssm start-session --target $INSTANCE_ID --region $AWS_REGION
   sudo /opt/blueprints/user-data/syncchecker.sh
   ```

4. **Node Not Ready**: Sync checker only runs after initial sync
   - Check for `/data/data/init-completed` file
   - Wait for node to complete initial synchronization
   - View initialization progress in CloudWatch:
     ```bash
     export INSTANCE_ID=$(cat deploy-output.json | jq -r '..|.InstanceId? | select(. != null)')
     aws logs tail /aws/ec2/blockchain-nodes/cloud-init-output --follow --log-stream-names $INSTANCE_ID | grep -i "init-completed"
     ```

### Traffic Shaping Scripts Missing

**Symptom**: Traffic shaping scripts not found on instance

**Diagnosis**:

1. **Check if scripts exist**:
   ```bash
   # Connect via SSM
   export INSTANCE_ID=$(cat deploy-output.json | jq -r '..|.InstanceId? | select(. != null)')
   aws ssm start-session --target $INSTANCE_ID --region $AWS_REGION
   
   ls -la /opt/network/
   ls -la /opt/common/network/
   ```

2. **Check asset download in CloudWatch**:
   ```bash
   # View cloud-init logs for asset download for specific instance
   export INSTANCE_ID=$(cat deploy-output.json | jq -r '..|.InstanceId? | select(. != null)')
   aws logs tail /aws/ec2/blockchain-nodes/cloud-init-output --follow --log-stream-names $INSTANCE_ID | grep -i "traffic shaping\|network"
   ```

**Solutions**:

1. **Assets Not Downloaded**: Check asset download
   ```bash
   # Check cloud-init logs in CloudWatch for specific instance
   export INSTANCE_ID=$(cat deploy-output.json | jq -r '..|.InstanceId? | select(. != null)')
   aws logs tail /aws/ec2/blockchain-nodes/cloud-init-output --follow --log-stream-names $INSTANCE_ID | grep -A 10 "traffic shaping"
   ```

2. **Redeploy Stack**: If assets missing
   ```bash
   npx cdk destroy
   npx cdk deploy --json --outputs-file deploy-output.json
   ```

3. **Manual Copy**: Temporarily copy scripts
   ```bash
   # Connect via SSM
   export INSTANCE_ID=$(cat deploy-output.json | jq -r '..|.InstanceId? | select(. != null)')
   aws ssm start-session --target $INSTANCE_ID --region $AWS_REGION
   
   # If common assets exist but not copied
   sudo mkdir -p /opt/network
   sudo cp /opt/common/network/*.sh /opt/network/
   sudo chmod +x /opt/network/*.sh
   ```

## Security Issues

### Cannot Access Instance

**Symptom**: Cannot connect via SSM Session Manager

**Diagnosis**:
1. Verify IAM role has SSM permissions
2. Check VPC endpoints (if using private subnets)

**Solutions**:

1. **Check IAM Role**: Ensure AmazonSSMManagedInstanceCore policy attached

2. **VPC Endpoints**: Create SSM endpoints for private subnets

### Secrets Not Accessible

**Symptom**: Cannot retrieve secrets from Secrets Manager

**Diagnosis**:
```bash
aws secretsmanager get-secret-value --secret-id my-secret
```

**Solutions**:

1. **Verify Secret ARN**: Ensure ARN is correct in configuration

2. **Check Region**: Secret must be in same region as deployment

3. **Check Secret Exists**: Verify the secret was created
   ```bash
   aws secretsmanager describe-secret --secret-id my-secret
   ```

4. **Test from Instance**: Connect to instance and test access
   ```bash
   export INSTANCE_ID=$(cat deploy-output.json | jq -r '..|.InstanceId? | select(. != null)')
   aws ssm start-session --target $INSTANCE_ID --region $AWS_REGION
   
   aws secretsmanager get-secret-value --secret-id my-secret --region $AWS_REGION
   ```

**Note**: The default IAM role includes `secretsmanager:GetSecretValue` and `secretsmanager:DescribeSecret` permissions for all secrets. If you need to restrict access to specific secrets, you can modify the IAM role after deployment.

## Getting Additional Help

### Collect Diagnostic Information

Before requesting help, collect:

1. **Configuration**:
   ```bash
   cat .env | grep -v "SECRET\|PASSWORD" > .env-support  # Redact sensitive data
   # Inspect the installed blueprint's package.json
   cat node_modules/aws-bnr-blueprint-{protocol}/package.json | jq '."aws-blockchain-node-runner"' > protocol-config-support.json
   ```

2. **Logs**:
   ```bash
   sudo cat /var/log/cloud-init-output.log
   sudo journalctl -u node -n 200
   ```

3. **System Info**:
   ```bash
   uname -a
   df -h
   free -h
   ```

4. **CloudFormation Events**:
   ```bash
   aws cloudformation describe-stack-events --stack-name YourStack
   ```

### Support Channels

- **GitHub Issues**: Report bugs and request features
- **Documentation**: Check [docs/](https://github.com/aws-samples/aws-blockchain-node-runners/tree/main/docs) for guides
- **AWS Support**: For AWS-specific issues

### Useful Commands Reference

```bash
# CDK Commands
npx cdk synth                    # Synthesize CloudFormation template
npx cdk deploy --json --outputs-file deploy-output.json  # Deploy stack
npx cdk destroy                  # Destroy stack
npx cdk diff                     # Show differences

# Get Instance ID from deployment outputs
export INSTANCE_ID=$(cat deploy-output.json | jq -r '..|.InstanceId? | select(. != null)')
echo "INSTANCE_ID=$INSTANCE_ID"

# AWS CLI Commands
aws ssm start-session --target $INSTANCE_ID --region $AWS_REGION  # Connect to instance
aws logs tail /aws/ec2/blockchain-nodes/cloud-init-output --follow --log-stream-names $INSTANCE_ID  # View deployment logs
aws logs tail /aws/ec2/blockchain-nodes/systemd-services --follow --log-stream-names $INSTANCE_ID  # View systemd service logs
aws cloudformation describe-stacks --stack-name YourStack  # Stack info

# CloudWatch Logs Commands
# View specific service logs for specific instance
aws logs tail /aws/ec2/blockchain-nodes/systemd-services --follow --log-stream-names $INSTANCE_ID --filter-pattern "node.service"
# Check on Ethereum execution client like Geth, Reth, Erigon, or Hyperledger Besu
aws logs tail /aws/ec2/blockchain-nodes/systemd-services --follow --log-stream-names $INSTANCE_ID --filter-pattern "execution"
# Check on Ethereum consensus client like Lighthouse, Prysm, or Teku 
aws logs tail /aws/ec2/blockchain-nodes/systemd-services --follow --log-stream-names $INSTANCE_ID --filter-pattern "consensus"
# Check on Syncchecker
aws logs tail /aws/ec2/blockchain-nodes/systemd-services --follow --log-stream-names $INSTANCE_ID --filter-pattern "syncchecker.service"
aws logs tail /aws/ec2/blockchain-nodes/systemd-services --follow --log-stream-names $INSTANCE_ID --filter-pattern "net-rules.service"

# View logs for specific instance (alternative without filter)
aws logs tail /aws/ec2/blockchain-nodes/systemd-services --follow --log-stream-names $INSTANCE_ID

# Instance Commands (via SSM)
sudo systemctl status node  # Check service status
sudo journalctl -u node -f  # Follow service logs (if CloudWatch not available)
df -h                           # Disk usage
free -h                         # Memory usage
top                             # Process monitor
```

## Prevention Best Practices

1. **Use Sample Configurations**: Start with provided sample .env files

2. **Monitor from Day One**: Set up CloudWatch alarms immediately

4. **Document Changes**: Keep notes on configuration changes

5. **Stay Updated**: Keep protocol clients and CDK updated

6. **Review Logs**: Regularly check logs for warnings

7. **Capacity Planning**: Monitor growth and plan for scaling

## See Also

- [Configuration Reference](/docs/guides/configuration-reference) - Complete configuration documentation
- [Deployment Guide](/docs/guides/deployment-guide) - Deployment best practices
- [Snapshot Staging](/docs/guides/snapshot-staging) - Staging volume for large snapshot downloads
- [Adding New Protocols](/docs/ai-prompts/add-protocol-with-ai) - Protocol addition guide
- [Design Document](https://github.com/aws-samples/aws-blockchain-node-runners/blob/main/.kiro/specs/universal-blockchain-node-runner/design.md) - System architecture and design decisions
