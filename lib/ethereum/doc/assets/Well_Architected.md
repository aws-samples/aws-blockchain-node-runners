

| Pillar                  | Control                           | Question                                                  | Remarks          |
|-------------------------|-----------------------------------|-----------------------------------------------------------|------------------|
| Security                | Network protection                | Are there unnecessary open ports in security groups?      | Erigon snap sync port open for non-erigon clients. Port 42069 (TCP/UDP)   |
|                         |                                   | Traffic inspection                                        | WAF could you be implemented. At least provide as prescriptive guidance.  |
|                         | Compute protection                | Reduce attack surface                                     | Provide prescriptive guidance on using hardened OS images.  |
|                         |                                   | Enable people to perform actions at a distance            | Using Systems Manager for terminal session, not using ssh ports.  |
|                         | Data protection at rest           | Use encrypted EBS volumes                                 | Using encrypted EBS volumes  |
|                         |                                   | Use encrypted S3 buckets                                  | Using SSE-S3  |
|                         | Data protection in transit        | Use TLS                                                   | Load balancer currently uses HTTP. Create HTTPS listener with self signed certificate if TLS is desired. |
|                         | Authorization and access control  | Use instance profile with EC2                             | Using IAM role instead of IAM user  |
|                         |                                   | Following principle of least privilege access             | In sync node, root user is not used (using special user "ethereum" instead")  |
|                         | Application security              | Security focused development practices                    | cdk-nag is being used with appropriate suppressions  |
| Cost optimization       | Service selection                 | Use cost effective resources                              | Graviton instances are being used, which are cost effective compared to Intel/AMD instances.  |
|                         | Cost awareness                    | Estimate costs                                            | One sync node with m7g.2xlarge for geth-lighthouse configuration (2048GB ssd) will cost around US$430 per month in the US East (N. Virginia) region. Additional charges will apply if you choose to deploy RPC nodes with load balancer. |
| Reliability             | Resiliency implementation         | Withstand component failures                              | Using Application Load Balancer with RPC nodes for high availability. If sync node fails, S3 backup can be used to reinstate the nodes.  |
|                         | Data backup                       | How is data backed up?                                    | Data is backed up to S3 using s5cmd tool.  |
|                         | Resource monitoring               | How are workload resources monitored?                     | Resources are being monitored using CloudWatch dashboards. CloudWatch custom metrics are being pushed via CW Agent.  |
| Performance efficiency  | Compute selection                 | How is compute solution selected?                         | Compute solution is selected based on best price-performance, i.e. Graviton based instances.  |
|                         | Storage selection                 | How is storage solution selected?                         | Storage solution is selected based on best price-performance, i.e. gp3 volumes with optimal IOPS and throughput.  |
|                         | Architecture selection            | How is the best performance architecture selected?        | s5cmd tool has been chosen for S3 uploads/downloads because it gives better price-performance compared to EBS snapshots (including Fast Snapshot Restore, which is expensive).  |
| Operational excellence  | Workload health                   | How is health of workload determined?                     | Health of workload is determined via Application Load Balancer Target Group Health Checks, on port 8545.  |