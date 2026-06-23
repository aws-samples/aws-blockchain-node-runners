# Update a Blockchain Node Client Version

This workflow helps you keep blockchain node client software up to date. It guides you through the **full upgrade lifecycle**: discovering newer versions, checking compatibility, applying minimal source-code changes, validating locally, and optionally deploying a test node to confirm the upgrade works in practice.

## SCOPE

**Who this is for:**
- **Core maintainers** updating the project's built-in blueprints
- **Node operators** who want to upgrade their deployed node to a newer client version

**Blueprints in scope (version discovery):** ethereum, solana, bnb, base, bitcoin

**Special cases:**
- The `dummy` blueprint is used for LOCAL VALIDATION TESTING only (`cdk synth` uses it). It has no upstream release channel and is SKIPPED during version discovery.
- External/community blueprints can also follow this workflow — as long as their README contains a "Client Release Channels" table, the process is identical.

**Key principles (read before starting):**
- All changes happen to SOURCE CODE, not to a running or deployed node.
- The optional test deployment creates a NEW stack — it does NOT modify existing infrastructure.
- Production upgrades follow a blue-green pattern: deploy a new node with updated code → wait for full sync → route traffic to the new node → delete the old node.
- This is a GenAI agent prompt, not a CI/CD pipeline or scheduled automation.
- The human is always in control — explicit approval is required before any file change and before any destructive action.

## PREREQUISITES CHECK

Before starting, confirm:
1. Dependencies are installed. Check `node_modules/` exists; if missing, run `npm install`. Without it, `node_modules/aws-bnr-blueprint-{protocol}/` paths and CDK commands will fail.
2. (Only if the user wants a test deployment) AWS access is configured:
   - `aws sts get-caller-identity --query Account --output text` → AWS Account ID
   - `aws configure get region` → CLI profile default region
3. Ask the user what they want to update:
   - A specific blueprint and client, or a full scan across all in-scope blueprints?
   - Are they a maintainer updating built-in blueprints, or a node operator upgrading their own node?

## STEP 1: VERSION DISCOVERY

Determine what is currently pinned and what is available upstream.

1a. Enumerate the in-scope built-in blueprints from `blueprints/` (ethereum, solana, bnb, base, bitcoin). SKIP `dummy` — it has no upstream release channel.

1b. For each blueprint, read the current pinned versions from BOTH sources:
- Configuration script filenames and contents in `blueprints/{protocol}/configurations/`
  - Native binary scripts: `{client}-{version}-{type}.sh` (e.g. `bsc-geth-v1.7.2-full.sh`, `agave-3.1.9-rpc-base.sh`)
  - Docker-compose configs: `{client}-{version}-...-{type}.yml` (e.g. `geth-1.16.8-lighthouse-8.1.0-full.yml`)
- The `availableConfigurations` array in `blueprints/{protocol}/package.json` (`aws-blockchain-node-runner` field)

1c. Track EACH client component SEPARATELY. Multi-client protocols have independent version tracks:
- **EVM chains (ethereum, base, bnb):** execution-layer (EL) clients — Geth, Reth, Erigon, Besu, Nethermind — and consensus-layer (CL) clients — Lighthouse, Prysm, Teku, Caplin. Each is an independent version to track.
- **Solana:** Agave and Frankendancer are SEPARATE clients with independent release channels and version tracks. Check and propose updates independently.

1d. For each client component, identify the upstream release channel and find the latest STABLE version.

**Where to find upstream source info:** Each blueprint README contains a "Client Release Channels" table under "Additional Resources". Read it to determine the correct upstream source for every client — do NOT hardcode or guess URLs. This ensures the same process works for both built-in and external/community blueprints. The table is column-structured so the query is deterministic:

- **Repo** — the canonical `owner/repo`. Build the API endpoint as `https://api.github.com/repos/{repo}/releases/latest` (or `https://api.github.com/repos/{repo}/tags?per_page=30`). The link in the cell points to the human-readable releases page.
- **Query method** — how to resolve the latest version. Follow it exactly; do not substitute:
  - `releases/latest` — call `/releases/latest` (newest non-prerelease). Trust the returned `tag_name`.
  - `tags` — list `/tags` and pick the highest matching semver. Use this when `releases/latest` is empty or unreliable. SKIP non-semver tags (e.g. `develop`, `dev`, `canary`) and anything excluded by the Prereleases column.
  - `releases` — list `/releases` and pick the newest entry matching the Prereleases policy. Use this for clients with no stable line.
  - `pinned-file: <file> @ <ref>` — the version is not a release tag; read the named file at the given ref and parse the pinned versions from it.
- **Version line** — constrain the candidate to this release line (e.g. Agave `3.1.x`). `*` = any line. If a newer version exists only on a DIFFERENT major line than the one pinned, treat it as the "multiple release lines" ambiguous case (see ERROR HANDLING) — do NOT auto-jump lines.
- **Prereleases** — whether beta/RC tags are eligible. `stable only` = skip pre-releases/RCs (default). `beta allowed (no stable line)` = the newest beta IS the effective stable channel. Regardless of this column, never propose a pre-release/RC as a routine upgrade unless the user explicitly asks (except where `beta allowed` makes beta the only channel).

If the table lacks these columns, has only a plain `Releases` URL column, or is missing entirely, ask the user for the repo / query method before proceeding. For Docker-image-based configs, also confirm the registry image tag matches the resolved version.

1e. **Security advisories:** If upstream release notes mention CVE fixes, security vulnerabilities, or are tagged as a security release, classify the update as `security` type and present it with a ⚠️ urgency flag. Recommend the user prioritize this update.

1f. Present findings as a structured table:

```
protocol | client | current version | latest stable | severity | security? | release notes link
```

Where `severity` is patch / minor / major and `security?` is yes / no (⚠️ if yes).

If no updates are available for a blueprint/client, record "up to date" and move on.

## STEP 2: COMPATIBILITY CHECK (BEFORE ANY CHANGES)

If an upgrade is warranted, check compatibility BEFORE proposing any file modification.

2a. **OS/package conflicts:** Does the new version require packages or an OS version incompatible with Ubuntu 24.04 LTS or with packages installed during node initialization (user-data scripts in `blueprints/{protocol}/user-data/`)?

2b. **EVM client compatibility matrices:** For EVM chains, check EL/CL client version compatibility. Example: does Geth v1.17 require a minimum Lighthouse version? If a cascading dependency exists, propose BOTH updates together as a single linked change.

2c. **Breaking config changes:** Check release notes for CLI flags renamed, config file format changes, deprecated options removed, or new required flags. These affect the configuration script contents.

2d. Report any compatibility concerns to the user BEFORE proceeding. If the check finds conflicts, do NOT proceed without a user decision.

## STEP 3: CHANGE NOTIFICATION + APPROVAL GATE

Present a structured Change Notification for each warranted update:

```
📋 CHANGE NOTIFICATION
──────────────────────
Blueprint:        {protocol}
Client:           {client component}
Version:          {current version} → {proposed version}
Severity:         {patch | minor | major}
Type:             {security ⚠️ | routine}
Release notes:    {link}
Compatibility:    {pass | concerns: <details>}

Affected artifacts:
  - configurations/{client}-{old}-{type}.{ext} → {client}-{new}-{type}.{ext}
  - blueprints/{protocol}/package.json (availableConfigurations)
  - samples/.env-* (CLIENT_CONFIG)
  - blueprints/{protocol}/README.md (version references)

Affected configurations (multi-config clients):
  - {list ALL configurations that use this client, e.g. geth-lighthouse-full, geth-lighthouse-archive — both will be updated}

⚠️  Breaking changes / risks:
  - {from release notes, if any — otherwise "none identified"}
```

**MANDATORY APPROVAL GATE:**
- Wait for EXPLICIT user approval before proceeding.
- Do NOT modify any file or run any test without approval.
- If the user rejects the update, make NO changes and record the rejection.
- If the user's response is anything other than a clear approval, ask for clarification and treat the update as NOT approved.

## STEP 4: MINIMAL SOURCE CODE CHANGES

After approval, update ONLY what's necessary. Keep changes minimal — no refactoring, no new features, no unrelated changes.

4a. **Rename the configuration script:** `{client}-{old_version}-{type}.{ext}` → `{client}-{new_version}-{type}.{ext}` (preserve the extension).

4b. **Update version references inside the script:**
- Native binary scripts (`.sh`): update download URLs, version variables (e.g. `BSC_VERSION="v1.7.2"`), and binary names.
- Docker-compose configs (`.yml`): update the Docker image tag(s) (e.g. `ethereum/client-go:v1.16.8`, `sigp/lighthouse:v8.1.0`).

4c. **Checksums:** Where the script verifies a checksum (e.g. `sha256sum`), update the expected hash from the upstream release artifacts. If no checksum is currently verified and upstream provides one, ADD verification.

4d. **Update `availableConfigurations`** in `blueprints/{protocol}/package.json` (both the `name` and `version` fields). Update `defaultConfiguration` if it pointed at the renamed file.

4e. **Update sample `.env` files:** change the `CLIENT_CONFIG` value (and any header comments referencing the configuration filename) in affected `blueprints/{protocol}/samples/.env-*` files.

4f. **Update the blueprint `README.md`:** version references in tables and example commands.

4g. **Update ALL configurations that use the changed client.** If Geth is updated, update `geth-lighthouse-full` AND any other `geth-*` configs.

4h. **Atomicity:** If updating multiple configurations for the same client and ANY of them fails validation (Step 5), revert ALL changes for that client — not just the failed one. Version updates are all-or-nothing per client component.

Keep version variable names and configuration variable names consistent across `.env` files, CDK code, and `.sh`/`.yml` files (per project documentation-consistency guidelines).

## STEP 5: LOCAL VALIDATION

Run the project's build and test cycle:

```bash
npm run build
npm run test
npx cdk synth
```

- Report results for each step.
- `cdk synth` validation uses the dummy protocol per the project's testing patterns.
- If ANY step fails, report the error and help the user debug. Do NOT proceed to deployment if local validation fails.
- Do NOT add new dependencies — use only the project's existing tooling.

When all three steps pass, report the update as locally validated.

## STEP 6: TEST DEPLOYMENT (OPTIONAL — USER DECIDES)

After local validation passes, offer an optional test deployment. The user decides whether to proceed.

6a. If the user wants to verify the upgrade in practice, follow the deploy flow from `docs/ageai-deploy-prompt.md` (generate `.env`, `npx cdk deploy`, wait).

6b. **This creates a NEW stack — it does NOT modify existing infrastructure.**

6c. **Snapshot-based nodes (base, bnb, bitcoin):** Snapshot download can take hours. You MUST wait for download completion before assessing whether the node starts at all. Report progress periodically. Do NOT declare failure during the download phase.

6d. **Solana:** Does not use snapshot download the same way — Agave and Frankendancer sync from the cluster directly. Monitor sync progress (slot advancement) instead.

## STEP 7: SMOKE TEST / HEALTHCHECK

Once the node shows signs of life (started syncing or serving RPC):

7a. Run a healthcheck following `docs/ageai-healthcheck-prompt.md`.

7b. Check:
- Node process is running
- RPC is responding
- Sync progress is advancing
- No error loops in the logs
- No crash-restart cycles

7c. Report the results clearly.

## STEP 8: REPORT OUTCOME + TEST CLEANUP

**If successful:**
- Confirm the version update works in practice.
- Remind the user: "All changes are to source code. To upgrade production: deploy a new node with the updated code → wait for full sync → route traffic to the new node → delete the old node. This is a blue-green deployment pattern."
- Offer to destroy the test stack (`npx cdk destroy <test-stack>`) to save costs, OR let the user keep it for extended evaluation (note it consumes AWS resources).
- Offer to commit the source code changes.

**If failed:**
- Report the specific failure (build error, deploy error, node not starting, sync stalled, healthcheck issues).
- Help debug: check logs, CloudWatch metrics, suggest fixes.
- Offer to create a bug report (protocol, client, version, error, reproduction steps).
- Offer to revert ALL source code changes (restore original filenames and contents).
- Destroy the failed test stack.

Require EXPLICIT user confirmation before any destructive action (destroying a stack, reverting source changes).

## ERROR HANDLING

- **Upstream source unreachable:** skip that client, report it, and continue with the others.
- **Version ambiguous (multiple release lines):** present the options and let the user decide. Do NOT choose autonomously.
- **Compatibility check finds conflicts:** report clearly and do NOT proceed without a user decision.
- **Local validation fails:** report the error, help debug, and do NOT proceed to deployment.
- **Deploy fails:** do NOT mark the update as successful. Help debug or revert.
- **Healthcheck shows issues after a successful deploy:** report as "deploys but has issues — not ready for production".
- **User abandons mid-workflow:** offer to revert any source code changes already made.

## GUIDELINES

DO:
- Track each client component separately, with its own version and release channel.
- Skip the dummy blueprint during version discovery (no upstream channel).
- Skip pre-releases/RCs by default; flag security advisories with urgency.
- Run the compatibility check BEFORE proposing file changes.
- Present a full Change Notification and wait for explicit approval before any change.
- Keep source changes minimal and consistent across all affected artifacts.
- Run `npm run build`, `npm run test`, and `npx cdk synth` before any deployment.
- Treat the test deployment as a NEW stack that never touches existing infrastructure.
- Wait for snapshot download completion (base, bnb, bitcoin) before judging node startup.
- Require explicit confirmation before destroying a stack or reverting changes.

DO NOT:
- Never modify a running or deployed node — all changes are to source code.
- Never modify existing infrastructure; the test deployment is always a new stack.
- Never modify files or run tests before explicit approval at the Approval Gate.
- Never propose a pre-release/RC as a routine upgrade without the user asking.
- Never proceed past a compatibility conflict without a user decision.
- Never proceed to deployment if local validation fails.
- Never mark an update successful if the deploy or healthcheck failed.
- Never add new dependencies or create new package.json files.
- Never run destructive actions (cdk destroy, source revert) without explicit confirmation.
- Never treat this workflow as unattended CI/CD or scheduled automation.
