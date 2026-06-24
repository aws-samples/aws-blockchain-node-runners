---
sidebar_label: Why Node Runners
sidebar_position: 2
---

# Why Node Runners?

If you need to run blockchain nodes on AWS, you have several options. This page explains when Node Runners is the right choice — and when it isn't.

## The Problem

Running blockchain nodes looks simple until you try it at scale:

- **Each protocol is different.** Solana needs 512 GB RAM and NVMe RAID. Ethereum needs separate execution and consensus clients. Bitcoin is CPU-light but storage-heavy. There's no universal "just deploy a node" button.
- **Instance selection is non-obvious.** The wrong EC2 instance type means either overpaying 2–3× or nodes that can't keep up with chain tip. Figuring out the optimal configuration requires protocol-specific benchmarking that few teams have time for.
- **Operational burden compounds.** Disk growth, snapshot management, client upgrades, healthchecks, key rotation — each node type has its own failure modes. Multiply by 5+ protocols and it becomes a full-time job.
- **AI assistants can't help without structure.** LLMs have general knowledge about blockchain nodes, but without a well-defined infrastructure framework, they can't reliably generate correct CDK code or make cost-aware recommendations.

## How Node Runners Compares

| | Node Runners | Managed RPC | DIY on EC2 | Docker Compose / K8s |
|---|---|---|---|---|
| **Cost control** | Full — you own the EC2, pay only compute + storage | Per-request pricing, opaque at scale | Full, but manual optimisation | Full, but cluster overhead |
| **Data sovereignty** | Runs in your VPC, your account | Third-party infrastructure | Your account | Your account |
| **Protocol coverage** | 6 built-in (5 protocols + Dummy reference) + community blueprints | Broad (20+ chains) | Any (manual effort per chain) | Any (manual effort per chain) |
| **Time to deploy** | Minutes to provision infra, AI-guided or CLI (chain sync time varies by protocol) | Minutes (API key) | Hours to days | Hours |
| **Customisation** | Full — modify blueprints, instance types, networking | Limited | Unlimited but unstructured | Unlimited but complex |
| **AI-assisted operations** | Built-in — deploy, healthcheck, cost estimate via natural language | Not applicable | Not available | Not available |
| **Operational automation** | CloudWatch agent pre-configured for logs and metrics; alarms and snapshots are documented but user-configured | Managed by provider | Build it yourself | Build it yourself |
| **Multi-protocol consistency** | Same CDK framework, same commands, same monitoring for all chains | N/A — different API per provider | Different scripts per chain | Different charts per chain |
| **Cost visibility** | Static per-protocol cost tables, with optional real-time AWS Pricing API breakdown | Invoice after the fact | Manual calculation | Manual calculation |

## When to Use Node Runners

✅ **Use Node Runners when you:**
- Need self-hosted nodes in your own AWS account (compliance, data sovereignty, latency control)
- Want to experiment with multiple protocols without rebuilding infrastructure from scratch
- Prefer AI-guided workflows over reading protocol-specific documentation
- Care about cost optimisation and want pre-deployment cost estimates
- Need production-like HA setups for evaluation or staging environments
- Want a repeatable, version-controlled infrastructure (CDK) rather than click-ops

## When NOT to Use Node Runners

❌ **Consider alternatives when you:**
- Just need RPC access and don't care where nodes run → use a **managed provider** (QuickNode, Alchemy, Infura)
- Need 50+ dedicated nodes across 20 protocols with SLA → you likely need a **dedicated infrastructure team** and custom automation
- Are running validators for profit and need sub-second failover → Node Runners is designed for experimentation and evaluation, not for operating commercial validator businesses
- Need a protocol not yet supported and don't want to create a blueprint → check the [community blueprints catalog](/docs/blueprints/community) or request one

## The AI Advantage

What makes Node Runners different from "just CDK code" is the AI-first design:

1. **Describe, don't configure.** Tell the AI assistant "I want to run a Solana RPC node optimised for cost" — it recommends the instance type, storage config, and networking setup.
2. **Cost-aware on request.** Before deployment, the AI shows the per-protocol cost estimate from the blueprint, and on request runs a detailed real-time breakdown via the AWS Pricing API alongside performance trade-offs.
3. **Structured for LLMs.** The blueprint system gives AI assistants a well-defined schema to work with — no hallucinated CDK constructs, no guessing at configuration shapes.
4. **Operational continuity.** After deployment, the same AI workflows help with healthchecks, performance diagnosis, and protocol upgrades.

## Get Started

Ready to try it? Head to the [Quickstart](/docs/getting-started/quickstart) to deploy your first node in under 10 minutes.
