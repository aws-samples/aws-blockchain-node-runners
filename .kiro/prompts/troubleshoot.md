# Troubleshoot Blockchain Node

Troubleshoot issues with a deployed blockchain node.

## What This Does

This prompt helps diagnose and resolve common issues:
- Node service failures
- Sync problems
- Resource exhaustion (CPU, memory, disk)
- Storage performance issues
- Network connectivity problems
- Configuration errors

## Instructions

1. Ask the user to describe the symptoms or problem they're experiencing
2. Read the document `docs/troubleshooting.md` and guide the user through:
   - Diagnosing the root cause
   - Checking relevant logs and metrics
   - Applying appropriate solutions
   - Verifying the fix

## Prerequisites

- Deployed blockchain node
- AWS CLI configured with appropriate permissions
- Access to CloudWatch Logs and Metrics

## Expected Outcome

- Root cause identified
- Solution applied or recommended
- Verification steps provided
- Prevention guidance for future
