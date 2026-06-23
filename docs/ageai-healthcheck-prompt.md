# Healthcheck a Deployed Blockchain Node

Perform a comprehensive healthcheck using AWS CLI commands to query CloudWatch Logs and Metrics. Provide a detailed report with timestamps and specific values.

## CRITICAL: Identify Correct Deployment

- List all deployment output files: `ls deploy-output-*.json`
- If multiple files exist, ask the user which deployment to check
- Confirm the deployment before proceeding:
  - Show stack name from filename
  - Show instance ID from the file
  - Ask: "I found deployment {stack-name} with instance {instance-id}. Is this correct?"
- Wait for confirmation before proceeding
- Use the confirmed `deploy-output-{stack-name}.json` file for all subsequent checks

## Deployment Information

- Read the confirmed `deploy-output-{stack-name}.json` file
- Extract instance ID, region, and stack name
- Parse protocol and configuration from stack name (format: `{protocol}-{network}-{config}`)
- OPTIONAL: If `.env-{stack-name}` file exists, read it for additional context (traffic shaping settings, instance type, storage configuration)
- If .env file not available, extract configuration from CloudWatch logs and stack name

## Node Service Status

- Check systemd service logs in CloudWatch for the "node" service
- Command: `aws logs tail /aws/ec2/blockchain-nodes/systemd-services --log-stream-names $INSTANCE_ID --filter-pattern "node.service"`
- Look for recent errors, failures, or crashes
- Verify the service is running and not restarting repeatedly
- For EVM-compatible chains (Ethereum): also filter by "execution" and "consensus"
- For non-EVM chains (Solana, etc.): use "node.service" filter

## Synchronization Status

- Check node sync status from logs
- For Ethereum-like chains:
  - Execution client: Current block height, blocks behind, throughput (Mgas/second)
  - Consensus client: Current slot/epoch, sync distance, optimistic status
- For Solana:
  - Current slot, slots behind, catchup status
- For other protocols: Check protocol-specific sync indicators
- Check syncchecker logs for reported metrics

## Network Connectivity

- Peer count from node logs
- Network connectivity issues
- P2P port accessibility

## System Resources — CPU

- Check CloudWatch metrics for CPU utilization
- Command: `aws cloudwatch get-metric-statistics --namespace CWAgent --metric-name cpu_usage_idle`
- Report CPU idle percentage (higher is better, >20% idle is healthy)
- Identify if CPU is bottleneck (consistently <10% idle)
- Check for CPU throttling or saturation

## System Resources — Memory

- Check CloudWatch metrics for memory usage
- Command: `aws cloudwatch get-metric-statistics --namespace CWAgent --metric-name mem_used_percent`
- Report memory consumption percentage
- Check for memory pressure (>90% is concerning)
- Look for OOM (Out of Memory) events in logs
- Report RSS (Resident Set Size) from node logs if available

## Block Storage Health

Check CloudWatch metrics for ALL data volumes (DATA_VOL_1, DATA_VOL_2, etc.). All metrics are in CWAgent namespace with dimensions: InstanceId and name (device name like nvme1n1).

For EACH volume, report:

**Read Latency (ms/operation):**
- Calculate: `diskio_read_time / diskio_reads` (both from CWAgent namespace)
- Use Sum statistic for both metrics, then divide
- Healthy: <5ms | Warning: 5-10ms | Critical: >10ms

**Write Latency (ms/operation):**
- Calculate: `diskio_write_time / diskio_writes` (both from CWAgent namespace)
- Use Sum statistic for both metrics, then divide
- Healthy: <10ms | Warning: 10-20ms | Critical: >20ms

**IOPS:**
- Metrics: `diskio_reads`, `diskio_writes` (CWAgent namespace)
- Calculate: Sum of metric / PERIOD (e.g., Sum over 60s / 60 = IOPS)
- Report current IOPS vs provisioned IOPS
- Check if hitting IOPS limits (>90% utilization)

**Throughput (bytes/sec):**
- Metrics: `diskio_read_bytes`, `diskio_write_bytes` (CWAgent namespace)
- Calculate: Sum of metric / PERIOD (e.g., Sum over 60s / 60 = bytes/sec)
- Report current throughput vs provisioned throughput
- Check if hitting throughput limits (>90% utilization)

**Queue Length:**
- Metric: `diskio_iops_in_progress` (CWAgent namespace)
- Healthy: <5 | Warning: 5-10 | Critical: >10

**Disk Space:**
- Metric: `disk_used_percent` (CWAgent namespace)
- Dimensions: InstanceId and path (mount path like /data)
- Warning: >80% full | Critical: >90% full

## Storage Performance Analysis

- Identify if storage is the bottleneck for sync performance
- Compare current IOPS/throughput against provisioned limits
- Recommend storage optimizations if needed:
  - Increase IOPS (for gp3: up to 80,000 IOPS)
  - Increase throughput (for gp3: up to 2,000 MB/s)
  - Switch to io2 or Instance Store for lower latency
  - Consider instance store for lowest latency (ephemeral)

## Traffic Shaping (if enabled)

- Check if traffic shaping is active
- Verify net-rules service status
- Check if node is falling behind due to bandwidth limits

## Recent Issues

- Search for error patterns in logs (last 30 minutes)
- Identify any warnings or critical messages
- Check for common issues: disk full, memory exhaustion, network problems, I/O bottlenecks

## Overall Health Assessment

- Provide a summary: HEALTHY, SYNCING, DEGRADED, or CRITICAL
- List any issues found with severity (HIGH, MEDIUM, LOW)
- Identify bottlenecks: CPU, Memory, Storage I/O, Network
- Recommend actions if issues detected

---

## CloudWatch Query Reference

**Date Command Compatibility** (works on both Linux and macOS):
```bash
START_TIME=$(date -u -d '1 hour ago' +%Y-%m-%dT%H:%M:%S 2>/dev/null || date -u -v-1H +%Y-%m-%dT%H:%M:%S)
END_TIME=$(date -u +%Y-%m-%dT%H:%M:%S)
```

**CloudWatch Datapoint Limits** — maximum 1,440 datapoints per query:
- 60-second periods: Maximum 24-hour time range
- 300-second periods: Maximum 5-day time range
- 3600-second periods: Maximum 60-day time range

**Storage Latency**: Use 3600-second (1 hour) periods for reliable averages. 60-second periods often have zero operations, making calculations unreliable.

**Log Query Tips**:
- Use specific time ranges with `--start-time` (epoch milliseconds)
- Limit output with `| tail -N`
- Query recent data first (last 30 minutes) before expanding range
- Use filter patterns to reduce data transfer

**Instance Store Volumes**:
- Device names: nvme1n1, nvme2n1, etc. (not EBS volume IDs)
- No provisioned IOPS/throughput limits (hardware-limited)
- Expected latency: <1ms reads, <2ms writes (NVMe performance)

**Discovering Custom Metrics**:
```bash
aws cloudwatch list-metrics \
  --namespace CWAgent \
  --dimensions Name=InstanceId,Value=$INSTANCE_ID \
  --region $REGION | jq -r '.Metrics[] | select(.MetricName | startswith("c1_") or startswith("c2_")) | .MetricName' | sort -u
```

**Disk Space Troubleshooting** — if `disk_used_percent` returns no data:
```bash
# List available mount paths:
aws cloudwatch list-metrics --namespace CWAgent --dimensions Name=InstanceId,Value=$INSTANCE_ID --metric-name disk_used_percent --region $REGION | jq -r '.Metrics[] | .Dimensions[] | select(.Name == "path") | .Value' | sort -u
```
Then try longer time ranges (6-24 hours). For instance store volumes, metrics may not be immediately available.

## Storage Performance Thresholds

| Metric | Excellent | Good | Acceptable | Poor (bottleneck) |
|--------|-----------|------|------------|-------------------|
| Read Latency | <2ms | <5ms | 5-10ms | >10ms |
| Write Latency | <5ms | <10ms | 10-20ms | >20ms |
| IOPS Utilization | <50% | <70% | 70-90% | >90% |
| Throughput Utilization | <50% | <70% | 70-90% | >90% |
| Queue Length | <2 | <5 | 5-10 | >10 |

## Protocol-Specific Considerations

**Ethereum (EVM-compatible):**
- Two services: execution client and consensus client
- Filter by "execution" or "consensus" for specific logs
- Metrics: block height, Mgas/second, slot numbers
- Storage: Heavy write load during sync, read-heavy when synced

**Solana:**
- Single validator service
- Filter by "node.service" only
- Metrics: slot height, catchup status, vote credits
- Storage: Very high IOPS requirements (recommend io2 or instance store)

**Other Protocols:**
- Use "node.service" as the universal filter
- Check protocol-specific sync indicators in logs
- Storage requirements vary by protocol

## Variant Healthchecks

For a **quick status check**, focus only on: service running, sync status, critical errors (last 10 minutes), CPU idle %, memory used %.

For a **performance analysis**, focus on: sync throughput, detailed storage analysis, CPU/memory, peer connectivity, bottleneck identification.

For a **storage deep dive**, focus on: all data volumes (latency, IOPS, throughput), current vs provisioned limits, queue lengths, disk space, specific optimization recommendations.

For **troubleshooting**, focus on: all errors/warnings in the last hour, failure patterns, resource exhaustion, traffic shaping impact, detailed remediation steps.
