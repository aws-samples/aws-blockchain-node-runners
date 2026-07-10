# Traffic Shaping for Cost Optimization

## Overview

Traffic shaping is a dynamic bandwidth management feature that optimizes outbound data transfer costs for RPC nodes. By intelligently limiting bandwidth when nodes are fully synchronized, traffic shaping can reduce outbound data transfer by up to 85% while maintaining node synchronization.

## How It Works

The traffic shaping system consists of three universal components and one protocol-specific component that work together to dynamically manage network bandwidth:

**Universal Components** (in `assets/common/network/`):
1. **net-rules-start.sh**: Configures nftables and tc (traffic control) to apply bandwidth limits
2. **net-rules-stop.sh**: Removes all traffic shaping rules to restore unrestricted bandwidth
3. **net-rules.service**: Systemd service that manages the traffic shaping lifecycle

**Protocol-Specific Component** (in the blueprint's `user-data/` directory, resolved from `node_modules/`):
4. **syncchecker.sh**: Monitors node synchronization status, controls traffic shaping on/off, and reports metrics to CloudWatch

The system operates in a continuous cycle: when a node is fully synchronized (blocks/slots behind = 0), traffic shaping is automatically enabled to limit outbound bandwidth. If the node falls behind by more than the configured threshold (default: 10 blocks), traffic shaping is automatically disabled until the node catches up. This ensures nodes stay synchronized while minimizing data transfer costs during normal operation.

## Examples of traffic limits

Assuming a sustained transfer at the configured cap over an average month (~730 hours), the maximum outbound volume is roughly **0.3 TiB per Mbit/s** (`Mbit/s × 10⁶ ÷ 8 bytes/s × 2,628,000 s ÷ 2⁴⁰`):

- **20 Mbit/s limit**: up to 6 TiB/month
- **40 Mbit/s limit**: up to 12 TiB/month
- **100 Mbit/s limit**: up to 30 TiB/month

## When to Use Traffic Shaping

**Recommended for**:
- RPC nodes serving read-only queries
- Protocols with fast block times (<10 seconds) like Solana, BSC, Polygon
- Cost-sensitive deployments where data transfer is a significant expense
- High-traffic nodes with many peer connections

**NOT recommended for**:
- Validator or consensus nodes (will compromise performance and rewards)
- Nodes in critical infrastructure where cost is secondary to performance

## See Also

- [Configuration Reference](/docs/guides/configuration-reference) - Traffic shaping environment variables
- [Deployment Guide](/docs/guides/deployment-guide) - Enabling traffic shaping in deployments
- [Troubleshooting](/docs/guides/troubleshooting) - Traffic shaping troubleshooting
- [Adding New Protocols](/docs/ai-prompts/add-protocol-with-ai) - Implementing traffic shaping for new protocols
