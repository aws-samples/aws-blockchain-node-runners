# Blueprint Discovery and Security Review

## STEP 1: LIST INSTALLED BLUEPRINTS

Read the root `package.json` to identify installed blueprints:
- Look for dependencies whose packages contain an `"aws-blockchain-node-runner"` field
- Built-in blueprints are referenced via `file:blueprints/` paths (e.g., `"aws-bnr-blueprint-ethereum": "file:blueprints/ethereum"`)
- External blueprints are installed from NPM or GitHub URLs

Present the results clearly:

```
Built-in blueprints (maintained by this repository):
  - ethereum  (aws-bnr-blueprint-ethereum v1.0.0)
  - solana    (aws-bnr-blueprint-solana v1.0.0)
  - dummy     (aws-bnr-blueprint-dummy v1.0.0)

External blueprints (installed by user):
  - polygon   (aws-bnr-blueprint-polygon v1.1.0)
```

## STEP 2: SEARCH COMMUNITY BLUEPRINTS (OPTIONAL)

If the user asks to discover community blueprints:
1. Run: `npm search aws-bnr-blueprint`
2. Present results with package name, description, and version
3. Show the install command for any blueprint they want to add: `npm install aws-bnr-blueprint-<protocol>`

Present this disclaimer: Community blueprints are NOT reviewed or verified by the core repository maintainers. The user assumes full responsibility for any external blueprint they install and deploy. Always perform a security review before deploying an external blueprint.

## STEP 3: SECURITY REVIEW FOR EXTERNAL BLUEPRINTS

When an external blueprint is installed, proactively offer to run a security review BEFORE proceeding to deployment.

### Step 3a — Identify the package root

Resolve the installed package path: `node_modules/<package-name>/`

### Step 3b — Review package.json declaration

Read the `"aws-blockchain-node-runner"` field in the blueprint's package.json and check:

- [ ] `BLOCKCHAIN_PROTOCOL` is a reasonable identifier for the stated protocol
- [ ] `requiredPorts` only includes ports consistent with the stated protocol. Flag any ports marked `"public": true` that are not standard for the protocol.
- [ ] `customEnvVars` does not request credentials, secrets, or external URLs unrelated to the protocol's operation
- [ ] `supportedDeploymentModes` contains only valid values ("single-node", "ha-nodes")
- [ ] `defaultInstanceTypes` references reasonable EC2 instance types
- [ ] `storage` configuration requests reasonable volume sizes for the protocol

### Step 3c — Review user-data scripts

Read ALL files in `user-data/` and `user-data/common/` (if present), AND all files in `configurations/` (the protocol-specific setup scripts that run on the instance). Flag any of the following:

> **Important:** Configuration scripts in `configurations/` (e.g., `bsc-geth-v1.7.2-full.sh`) are the primary execution scripts that install and start the node software. They must be reviewed with the same scrutiny as user-data scripts.

**Data exfiltration risks:**
- Outbound `curl`, `wget`, or `nc` calls to non-standard endpoints (NOT AWS APIs and NOT the blockchain network itself)
- Commands that pipe data to external servers

**Credential access risks:**
- Commands that read from `~/.aws/`, `/etc/shadow`, or other sensitive paths
- Instance metadata access beyond standard IMDS calls for region/instance-id
- Access to AWS Secrets Manager and AWS KMS secrets not documented in the blueprint

**Unexpected AWS API calls:**
- `aws` CLI calls beyond these expected operations:
  - `cloudwatch put-metric-data` (metrics reporting)
  - `s3 cp` (asset download)
  - `autoscaling complete-lifecycle-action` (HA lifecycle)
  - `ssm` (Systems Manager)
- Any IAM, EC2, or other service API calls that could modify infrastructure

**Obfuscated execution:**
- `base64 -d | bash` or similar decode-and-execute patterns
- `eval` with dynamically constructed strings
- Downloads of scripts that are then executed (`curl ... | bash`)

**Destructive commands:**
- `rm -rf /` or broad deletion patterns outside expected data directories
- `dd` or `mkfs` on non-data volumes
- Commands that modify system files outside `/opt`, `/data`, or `/var/log`

### Step 3d — Summarize findings

**If no concerns found:**

> Security review complete — no concerns found. The blueprint's port configuration, scripts, and permissions appear consistent with its stated purpose. Would you like to proceed with deployment?

**If concerns found:**

> Security review found the following concerns:
>
> 1. [file: user-data/node.sh, line ~42] Outbound curl to https://unknown-server.example.com — purpose unclear
> 2. [file: package.json, requiredPorts] Port 4444 marked as public — not standard for this protocol
>
> Please review each concern. Do NOT proceed with deployment until you have reviewed and acknowledged each item. Type "acknowledged" to confirm you have reviewed the concerns and want to proceed anyway, or "cancel" to stop.

### Step 3e — Gate before deployment

- Do NOT provide deployment commands for an external blueprint until the user has explicitly acknowledged the security review summary
- Do NOT generate a .env file for an external blueprint until the security review is acknowledged
- Built-in blueprints (ethereum, solana, bnb, base, bitcoin, dummy) do NOT require a security review

## GUIDELINES

DO:
- Always distinguish built-in vs external blueprints
- Always show the community disclaimer for external blueprints
- Always offer security review when a new external blueprint is installed
- Always gate deployment behind security review acknowledgment
- Always flag unexpected ports, scripts, and API calls

DO NOT:
- Never skip the security review for external blueprints
- Never proceed to deployment without explicit acknowledgment
- Never present community blueprints as verified or endorsed
- Never ignore red flags in user-data scripts

## WHEN THIS APPLIES

| Blueprint Type | Security Review Required? |
|---|---|
| Built-in (ethereum, solana, bnb, base, bitcoin, dummy) | No — maintained by core repository |
| External (NPM registry) | Yes — always before first deployment |
| External (GitHub URL) | Yes — always before first deployment |
