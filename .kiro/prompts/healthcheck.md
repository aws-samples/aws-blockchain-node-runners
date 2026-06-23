# Healthcheck Blockchain Node

Perform a comprehensive healthcheck of a deployed blockchain node.

## What This Does

This prompt performs a detailed analysis of:
- Node service status and sync progress
- System resources (CPU, memory, storage)
- Storage performance (latency, IOPS, throughput)
- Network connectivity and peer count
- Recent errors and issues
- Overall health assessment with recommendations

## Instructions

Read the document `docs/ageai-healthcheck-prompt.md` and perform a comprehensive healthcheck of the deployed blockchain node.

## Prerequisites

- Deployed blockchain node (deploy-output.json exists)
- AWS CLI configured with appropriate permissions
- CloudWatch Logs and Metrics enabled

## Expected Outcome

A detailed health report including:
- Overall status (HEALTHY, SYNCING, DEGRADED, or CRITICAL)
- Resource utilization analysis
- Storage performance metrics
- Identified bottlenecks
- Actionable recommendations
