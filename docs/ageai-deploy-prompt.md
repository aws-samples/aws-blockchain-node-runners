# Deploy a Blockchain Node

## STEP 1: GATHER REQUIREMENTS

Before asking the user anything, auto-detect their AWS environment:
- Run: `aws sts get-caller-identity --query Account --output text` → AWS Account ID
- Run: `aws configure get region` → CLI profile default region
- Run: `aws cloudformation describe-stacks --stack-name CDKToolkit` → CDK bootstrap status

Present what you found, for example:
> "Detected AWS Account: 123456789012, CLI profile region: us-east-1, CDK bootstrap: present"

Note: the deployment region is set in the .env file (AWS_REGION) and always takes precedence over the CLI profile default — so the user can deploy to any region regardless of their profile.

Then ask for the remaining information:
1. Which blockchain protocol? (ethereum, solana, etc.)
2. Which network? (mainnet, testnet, devnet)
3. What type of node? (RPC, archive, pruned)
4. Is this for production or development?
5. Do you need high availability (HA)?

## STEP 1.5: ENSURE DEPENDENCIES ARE INSTALLED

Before reading protocol documentation or running any CDK commands, verify that dependencies are installed:

1. Check if `node_modules/` exists and contains the protocol blueprint:
   ```bash
   ls node_modules/aws-bnr-blueprint-{protocol}/package.json 2>/dev/null
   ```

2. If the directory is missing or the check fails, install dependencies:
   ```bash
   npm install
   ```

3. Verify the installation succeeded:
   ```bash
   ls node_modules/aws-bnr-blueprint-{protocol}/package.json
   ```

**Why this matters**: Protocol blueprints are installed as local `file:` dependencies. Without `npm install`, the `node_modules/aws-bnr-blueprint-{protocol}/` paths referenced throughout this workflow will not exist, and CDK commands (`npx cdk synth`, `npx cdk deploy`) will fail.

## STEP 2: READ PROTOCOL DOCUMENTATION

Before making recommendations, read these files:
- `node_modules/aws-bnr-blueprint-{protocol}/README.md` — Protocol requirements and cost estimates
- `node_modules/aws-bnr-blueprint-{protocol}/package.json` — Available configurations (in `"aws-blockchain-node-runner"` field)
- `node_modules/aws-bnr-blueprint-{protocol}/samples/` — Sample .env templates
- `docs/configuration-reference.md` — Environment variable reference

## STEP 2.5: SECURITY REVIEW FOR EXTERNAL BLUEPRINTS

IMPORTANT: If the selected protocol is from an EXTERNAL blueprint (not ethereum, solana, bnb, base, or dummy), you MUST perform a security review before proceeding:
1. Read `docs/ageai-blueprint-security-review.md`
2. Follow the complete security review workflow
3. Do NOT proceed to Step 3 until the user acknowledges the review

Built-in blueprints (ethereum, solana, bnb, base, dummy) skip this step.

## STEP 3: ANALYZE AND RECOMMEND

Based on the requirements and the protocol documentation:
1. Identify the best configuration from availableConfigurations
2. Recommend infrastructure (instance type, storage, deployment mode)
3. Present your recommendation with clear rationale
4. Explain why you chose this configuration

## STEP 4: COST ESTIMATION (MANDATORY)

CRITICAL: You MUST present cost information before proceeding. Never skip this step.

4a. Always extract and present the cost estimates from the protocol README (`node_modules/aws-bnr-blueprint-{protocol}/README.md`). Every protocol README contains a cost table or cost section — find it and show it to the user. This is the MINIMUM cost information that must be shown.

4b. Then ask if the user wants a detailed, real-time cost breakdown using AWS Pricing API. If yes:
- `aws pricing get-products` cli option is preferred method for all cost estimations, use it unless the user refuses to configure it
- Calculate: compute, storage, network, CloudWatch logs
- Present cost breakdown with optimization suggestions

4c. If network costs > $100/month, mention traffic shaping (`docs/traffic-shaping.md`)

4d. If `SNAPSHOT_STAGING_VOL_SIZE` is configured (> 0), include the one-time staging volume cost in the estimate:
- Storage: SNAPSHOT_STAGING_VOL_SIZE (GiB) × $0.08/GiB/mo × (estimated_download_days / 30)
- Provisioned throughput (1000 MB/s): $0.04/provisioned-MB/s/mo × 1000 × (days / 30)
- Present as a one-time cost (volume is deleted after extraction)
- Example: 5 TB staging volume for ~2 days ≈ $29

4e. Present the final cost summary clearly. This summary will be required in Step 6.

Do NOT proceed to Step 5 until cost information has been presented to the user.

## STEP 5: GENERATE CONFIGURATION

Once the user approves the recommendation:
1. Read `docs/configuration-reference.md` for configuration options
2. Use the appropriate sample from `node_modules/aws-bnr-blueprint-{protocol}/samples/` as template
3. Customize with the user's AWS Account ID, region, and approved settings
4. If SNAPSHOT_ENABLED=true, check whether the protocol needs a staging volume:
   - Look at the snapshot archive size (from protocol README or sample .env comments)
   - Compare: compressed_archive_size + extracted_data_size vs available /data space
   - If the sum exceeds available disk (common with instance-store volumes and multi-TB archives), set SNAPSHOT_STAGING_VOL_SIZE to ~1.1x the compressed archive size (in GiB)
   - If the sample .env already includes SNAPSHOT_STAGING_VOL_SIZE, keep that value
   - See `docs/snapshot-staging.md` for per-protocol sizing guidance
5. Save as `.env` in repository root
6. Show the user the key settings

## STEP 6: GET DEPLOYMENT CONFIRMATION

CRITICAL: You MUST get explicit confirmation before deploying. You MUST NOT skip or abbreviate this step under any circumstances.

Present a clear deployment summary with ALL of the following items:

```
📋 DEPLOYMENT SUMMARY
─────────────────────
Protocol:       {protocol}
Network:        {network}
Client:         {client software and version}
Instance type:  {instance type}
Storage:        {storage size and type}
Deployment mode:{single-node or HA}
Region:         {AWS region}
Staging volume: {SNAPSHOT_STAGING_VOL_SIZE GiB, or "none" if 0/omitted}

💰 ESTIMATED MONTHLY COST
─────────────────────────
{cost summary from Step 4 — if Step 4 was somehow skipped, go back and do it NOW}
{if staging volume configured, include one-time staging cost as a separate line}

⚠️  AWS charges begin IMMEDIATELY upon deployment.
🗑️  To destroy later: npx cdk destroy

Type "yes" to deploy, or "no" to cancel.
```

RULES:
- You MUST show the cost summary. If you don't have cost data, go back to Step 4.
- You MUST wait for the user to type "yes" before proceeding to Step 7.
- If the user says "no", cancel and save the .env file for later.
- If the user says anything other than a clear "yes", ask for clarification. Do NOT assume consent.

## STEP 7: DEPLOY

Once the user confirms with "yes":

7a. Check if CDK bootstrap is needed (run if required)

7b. Resolve the stack name BEFORE deploying:
- Run: `npx cdk synth --quiet 2>&1 | head -20`
- Or look at the CDK app output to identify the exact stack name.
- Store the stack name in a variable, e.g.: `STACK_NAME="solana-mainnet-beta-frankendancer-rpc-base"`
- You MUST know the exact stack name before proceeding. Do NOT use a generic name.

7c. Backup the .env file using the resolved stack name:
```bash
cp .env .env-$STACK_NAME
```

7d. Deploy using the resolved stack name in the output filename:
```bash
npx cdk deploy --json --outputs-file deploy-output-$STACK_NAME.json
```
CRITICAL: The outputs file MUST be named `deploy-output-{stack-name}.json`
- WRONG: `deploy-output.json`
- CORRECT: `deploy-output-solana-mainnet-beta-agave-rpc-base.json`

This naming convention prevents confusion when managing multiple deployments.

7e. Monitor progress and report status

7f. Extract outputs (instance ID, IPs, endpoints)

7g. Report success with key information and the output filename

7h. Confirm both files were created:
- `.env-{stack-name}` (configuration backup)
- `deploy-output-{stack-name}.json` (deployment outputs)

## STEP 8: WAIT FOR INITIALIZATION

After successful deployment:
1. Inform the user that the node is initializing
2. Explain that initial setup takes 3-5 minutes
3. Tell the user you'll perform a healthcheck in 5 minutes
4. Wait 5 minutes before proceeding to next step

## STEP 9: PERFORM HEALTHCHECK

After waiting 5 minutes:
1. Read `docs/ageai-healthcheck-prompt.md`
2. Identify the correct deployment output file: `deploy-output-{stack-name}.json`
3. Follow the comprehensive healthcheck instructions using the correct deployment file
4. Report the healthcheck results
5. If issues found, provide troubleshooting guidance

IMPORTANT: If multiple deployments exist (multiple `deploy-output-*.json` files):
- List all available deployment files
- Ask the user to confirm which deployment to check
- Use the correct `deploy-output-{stack-name}.json` file for that specific node

## STEP 10: PROVIDE MONITORING GUIDANCE

Guide the user on monitoring sync progress:

For Single-Node:
- CloudWatch Dashboard URL and key metrics
- CLI commands to check service status
- CloudWatch Logs viewing commands
- Expected sync time

For HA:
- ALB DNS and RPC endpoint
- Target health check commands
- Note about custom dashboard creation

## STEP 11: PROVIDE CONNECTION GUIDANCE

Explain how to connect applications:
- RPC endpoint (single-node vs HA)
- Security group requirements
- Protocol-specific connection examples
- Best practices

## STEP 12: OFFER ONGOING ASSISTANCE

Let the user know you can help with:
- Monitoring sync progress
- Troubleshooting (refer to `docs/troubleshooting.md`)
- Setting up CloudWatch alarms
- Performance optimization
- Scaling to HA
- Cost optimization

## ERROR HANDLING

- If deployment fails: Check CloudFormation events, review logs, refer to `docs/troubleshooting.md`
- If deployment fails with disk full during snapshot download: Set `SNAPSHOT_STAGING_VOL_SIZE` in `.env` to ~1.1x the compressed archive size (in GiB), destroy the stack, and redeploy. This creates a temporary EBS volume to hold the archive during download. See `docs/snapshot-staging.md` for sizing guidance.
- If the user cancels: Confirm cancellation, save .env file, offer alternatives

## GUIDELINES

DO:
- Always ensure `npm install` has been run before reading protocol docs or deploying
- Always read protocol README first
- Use protocol samples as templates
- Always show cost estimates from protocol README (Step 4 is mandatory)
- Always show the full deployment summary in Step 6 including costs
- Get explicit "yes" confirmation before deploying
- Perform security review for external blueprints (see `docs/ageai-blueprint-security-review.md`)
- Wait 5 minutes after deployment before healthcheck
- Provide monitoring and connection guidance
- Refer to `docs/troubleshooting.md` for issues

DO NOT:
- Never run CDK commands without first verifying `npm install` has been completed
- Never deploy without explicit "yes" confirmation
- Never guess configuration values
- Never skip cost estimation (Step 4) — it is mandatory
- Never skip the deployment summary (Step 6) — it is mandatory
- Never proceed to deployment without showing costs
- Never skip security review for external blueprints
- Never proceed if the user seems uncertain
- Never skip the 5-minute wait before healthcheck
