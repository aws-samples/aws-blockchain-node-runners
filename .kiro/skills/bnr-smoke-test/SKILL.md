---
name: bnr-smoke-test
description: How the Smoke Tester deploys an approved client version bump to the test AWS account from its own worktree, hands the long wait to a read-only Check-In cron, health-checks, troubleshoots, and destroys the stack by name - following the deploy, healthcheck and troubleshooting workflows in docs/. GitHub access is read-only.
---

# Smoke test

You prove that an approved client version bump starts and syncs on a fresh node in the **test AWS account**, and nowhere else. You reuse `docs/ageai-deploy-prompt.md` (deploy), `docs/ageai-healthcheck-prompt.md` (healthcheck) and `docs/troubleshooting.md` (when the healthcheck fails); read them before the step that needs them, together with `docs/deployment-guide.md`, `docs/configuration-reference.md` (`STACK_NAME_PREFIX`, `CLIENT_CONFIG`, `BC_NETWORK`, deployment mode, `AWS_AZ`) and, for base, bnb and bitcoin, `docs/snapshot-staging.md`.

## Where you work

- Your project directory is the **smoke worktree** (`smoke_worktree_path` in `~/.kiro/steering/bnr-crew.md`), a second checkout of the clone with its own `node_modules` (`npm ci`). `.env`, `cdk.out/` and `deploy-output.json` are written there and nowhere else. Never write into the main clone.
- `~/.aws/` is never read. Credentials reach the AWS CLI through `--profile <aws_profile>` only. The test account's region must be CDK-bootstrapped; if `cdk deploy` fails on a missing bootstrap stack, report that rather than bootstrapping.
- GitHub is reached only through the GitHub MCP server, which runs read-only (you read the PR under test). Marking a draft PR ready after a passed test is the maintainer's click; the Lead proposes it.

## Account check, every time

```
aws sts get-caller-identity --profile <aws_profile> --query Account --output text
```
must equal `test_account_id` from the steering file. Anything else stops all AWS work and is reported. No exceptions, no "it is probably fine".

## Two dispatches per smoke test

A dispatched session cannot wait while the maintainer reads Gate C, so the Lead dispatches you twice: once to propose, once to deploy.

### Dispatch 1: propose (Gate C material)

Input: blueprint, client, new configuration file, branch, PR URL, round id.

1. `git fetch origin` and check out the bump **detached**: `git checkout --detach origin/<branch>`. Never the local branch name; git refuses a branch another worktree holds.
2. Choose the network. Prefer a **testnet sample** in `blueprints/<protocol>/samples/` that already uses this client (`.env-hoodi-*`, `.env-sepolia-*`, `.env-testnet-*`, `.env-chapel-*`, `.env-devnet-*`). Testnet samples exist only for some clients, so fall back in this order and say which path you took:
   - a testnet sample for the same client and configuration type: use it;
   - no testnet sample, but the blueprint's `package.json` `BC_NETWORKS` lists a testnet: take the mainnet sample for this client and change `BC_NETWORK` to that testnet, then check the configuration file and the sample for network-specific settings that must follow (for example `ETH_CONSENSUS_CHECKPOINT_SYNC_URL`, snapshot URLs, `SNAPSHOT_ENABLED`) and take their values from an existing testnet sample of the same blueprint where one exists; if a value has no testnet counterpart you can source from the repository, do not invent one: fall back to mainnet;
   - otherwise propose **mainnet** and say so plainly. An archive configuration on mainnet is expensive and slow to sync; flag the cost and the expected sync time.
   A testnet run proves startup and sync, not mainnet-only behaviour; say that in the proposal. The maintainer may choose mainnet in the Decision Table.
3. Derive `.env` from the chosen sample, changing only `AWS_ACCOUNT_ID=<test_account_id>` and `AWS_REGION=<the profile's region>` (samples ship placeholders), `STACK_NAME_PREFIX=bnr-crew-<round-id>`, `CLIENT_CONFIG=<the new configuration file>`, and whatever step 2 required. No other edits.
4. Tagging is done by the CDK CLI, not by `.env`: the deploy command will be `npx cdk deploy --tags bnr:crew-round=<round-id>`. There is no tag variable in the configuration loader.
5. Read the cost estimate from the blueprint README's cost table (deploy workflow Step 4).
6. Report the proposal to the Lead and stop: stack name (as the deployment guide derives it from `STACK_NAME_PREFIX`, protocol and `CLIENT_CONFIG`), blueprint, network and which fallback path produced it, client config, instance type, volumes, hourly cost estimate, expected sync time, the exact deploy command, and the proposed deadline (default 12 h; snapshot-based blueprints may need more, say so). Leave the `.env` in place for dispatch 2.

### Dispatch 2: deploy and hand off

Input: the approved proposal.

1. Account check. Confirm the worktree is at `origin/<branch>` and the `.env` matches the proposal.
2. Before deploying on Windows, confirm no tracked shell script is checked out with CRLF: `git ls-files --eol -- '*.sh'` must show no `w/crlf`. If it does, stop and report: the instance bootstrap re-executes these scripts and fails with `cannot execute: required file not found`, the stack rolls back after 15 minutes, and CDK reuses the already-uploaded asset on the next deploy because the asset hash ignores line endings. The fix is a `*.sh text eol=lf` attribute (repository `.gitattributes`, or `.git/info/attributes` locally) followed by re-checking out the scripts **in this worktree only** (`git rm --cached -r -q -- '*.sh'` then `git checkout -- '*.sh'`); the maintainer applies it. Never run `git checkout -- .`, `git restore .` or any checkout in the maintainer's clone: it discards their uncommitted work.
3. `npx cdk deploy --tags bnr:crew-round=<round-id> --require-approval never --outputs-file deploy-output.json --profile <aws_profile>` from the worktree (raises the one deploy prompt in this session; the `.env` names the account and region but the CDK CLI still needs the profile for credentials). Record stack name and region from the output.
4. Register the Check-In with the cron tool:
   - name `bnr-smoke-<round-id>-<stack>`; agent `bnr-smoke-tester` (the agent template by name, so the wake runs with your rules applied); **`approval_mode: "auto"`**, without which the wake's first `aws` call raises a prompt nobody can answer and the job never produces a verdict (seen in the first smoke test; on the default KAS backend even the `allow`-listed reads prompt). `auto` also auto-approves the `ask` rules, so the wake's safety rests on the `deny` rules, the host's denied commands and the wake procedure in your prompt being read-only; the procedure must never call `delete-stack`, `cdk`, or anything that changes state. Then: every 1800 s; persistent session on (a wake remembers what it already reported); minimal context on; hidden from the chat list; **silent** on, so a wake that finds no change delivers nothing and only a wake that calls the notify tool reaches the maintainer.
   - After registering, confirm the job record shows `approval_mode: auto` (`cron_list` with `verbose`); if the tool refused the parameter, report it as a setup problem rather than leaving a job that cannot run. Report the job id to the Lead. The wake cannot remove the job itself (`cron_remove` from the wake answers "job not found", because the job is owned by this registering session), so the **Lead** removes it with `kirocrew cron remove <job id>` when it records the terminal verdict and raises Gate D; the wake's notification repeats that command.
   - The wake has **no project directory** and loads none of this repository, so the **procedure lives in the agent's own prompt** and the **message carries only parameters**, one per line: `stack=`, `region=`, `aws_profile=`, `test_account_id=`, `round_id=`, `pr_url=`, `blueprint=`, `client=`, `deadline=<absolute ISO time>`, `healthcheck_doc=<absolute path of docs/ageai-healthcheck-prompt.md in the clone>`, and the first line `BNR CHECK-IN`.
5. Report to the Lead: deployed, stack name, region, Check-In job id, deadline. The round ends with the test "running".

## Check-In wake

The wake procedure (account check, read-only healthcheck, the four verdicts, notify only on change or terminal state, the `delete-stack` command on failure or deadline, self-removal of the cron job) is in the `bnr-smoke-tester` agent prompt, because a headless wake cannot read this file. If you are reading this in a wake, the project directory was unexpectedly present; follow the agent prompt regardless.

## After the test (dispatched by the Lead)

You have no chat of your own. When the Check-In has reported a terminal verdict, the Lead raises the follow-up in its own chat (Gate D at the start of the next round, or sooner if the maintainer asks) and dispatches you with the verdict and the approved action:

- **Passed:** the Lead proposes destroying the stack (Gate D). Dispatched after approval:
  `aws cloudformation delete-stack --stack-name <stack> --profile <aws_profile> --region <region>` (prompts), then `aws cloudformation wait stack-delete-complete --stack-name <stack> --profile <aws_profile> --region <region>` and confirm. In your report, recommend marking the draft PR ready; the Lead passes that to the maintainer, who does it in the GitHub UI.
- **Failed:** dispatched first for diagnosis: run the troubleshooting workflow (`docs/troubleshooting.md`) read-only against the stack, report root cause and evidence, leave the PR a draft, and suggest whether the bump should be closed or fixed; the Lead then raises destroy (Gate D) and dispatches you again for it.
- **Not verified:** report; the Lead raises destroy; the PR stays a draft.
- Remove the Check-In cron job if the wake could not remove it itself.

Destroy is always by stack name through CloudFormation, never `cdk destroy`: hours later the worktree may hold a different checkout, and the stack must still go.

## Reporting

Everything you report names the stack, the round id and the PR URL, and never an account ID or a local path.
