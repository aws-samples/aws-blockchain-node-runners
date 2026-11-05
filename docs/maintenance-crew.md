# Agentic maintenance crew

A small team of [Kiro Crew](https://github.com/kirodotdev/KiroCrew) agents that does the recurring maintenance of this repository, or of your fork of it: triages dependency pull requests, discovers and risk-rates new blockchain client releases, prepares version-bump branches, and smoke-tests risky upgrades on a test AWS account. Every change to AWS or the repository waits for the maintainer's explicit approval, and every change on GitHub (approve, merge, close, open a PR) is the maintainer's own click, prepared and recorded by the crew. The crew reads and analyses on its own; it never decides.

The crew reuses the GenAI workflows this repository already ships (`docs/ageai-*.md`). It adds four agent definitions, four skills and this document. Nothing else: no scripts, no new dependencies, no state in the repository.

## What a maintenance round looks like

You open the Maintainer Lead's chat (a Kiro Crew chat on the `bnr-maintainer-lead` agent template, approval mode Normal) and send `@maintenance-round`, optionally followed by a scope (`PRs only`, `versions only`, a blueprint name, or `shadow`); "run a maintenance round" in plain words does the same. The Lead:

1. **Collects**, in two parallel worker sessions: PR Triage classifies every open pull request; Version Scout compares each blueprint's pinned client versions with upstream releases and rates each possible bump Low, Medium or High risk.
2. **Presents one Decision Table** as a multi-select card. Each row is a recommendation with its reason: merge this Dependabot PR, close that failing one, open a PR for this patch bump, open a draft PR and smoke-test that major bump, redirect this community blueprint PR to the Community Catalog, destroy that leftover test stack. You tick what you approve. Unticked is rejected; so is any answer that is not a clear yes.
3. **Executes only ticked rows**, one at a time. Repository and AWS work runs in worker sessions: prepare a bump branch and validate it locally, push it (Low risk in one step; Medium and High after a second confirmation with the changed-file list in front of you), deploy a test stack. Each push, deploy and destroy raises its own approval prompt in the worker session, so even a misread card cannot write without a second click. **GitHub actions are yours**: for each ticked PR row the Lead re-checks the PR, posts the link with the action and any drafted text, and you approve, merge, close or comment in the GitHub UI; for a pushed bump branch it posts the compare link and you open the PR. The Lead reads the result back and records it.
4. **Hands long waits to a cron**: a smoke test can take hours (snapshot downloads for Base, BNB and Bitcoin). After the deploy worker reports, the Lead registers a read-only Check-In from its own chat (one prompt there, the schedule you agreed at Gate C). It wakes every 30 minutes, runs the healthcheck, and reports back into the Lead's chat only when the verdict changes or the test ends. On a terminal verdict the Lead proposes the stack's destruction (Gate D), removes the Check-In job itself and, for a passed test, asks you to mark the draft PR ready. Keep the Lead's chat open while a smoke test runs; a result that finds no chat goes to the dashboard notification bell instead, and you paste it in.
5. **Writes a private Round Report** in the directory you chose at setup: every recommendation, your decision, what was executed, links to PRs, stacks still running. Reports never go into the repository: they describe unapplied security releases, failed upgrades and your test infrastructure.

Rounds start only when you ask. Nothing is scheduled except the Check-In after a deploy you approved.

## The crew

| Agent | Agent spec | Skill | Does | Writes (always after a prompt) |
|---|---|---|---|---|
| Maintainer Lead | `.kiro/agents/bnr-maintainer-lead.json` | `bnr-maintenance-round` | Runs the round, dispatches workers, presents the Decision Table, hands GitHub actions to you, receives Check-In results | The Round Report file; the Check-In cron job (register after a prompt, remove after Gate D) |
| PR Triage | `.kiro/agents/bnr-pr-triage.json` | `bnr-pr-triage` | Classifies PRs, writes review briefs and drafted replies | Nothing |
| Version Scout | `.kiro/agents/bnr-version-scout.json` | `bnr-version-scout` | Runs `docs/ageai-version-update-prompt.md` Steps 1–5 | Files under `blueprints/<protocol>/` and `CHANGELOG.md` in its own worktree; `git push` of the bump branch |
| Smoke Tester | `.kiro/agents/bnr-smoke-tester.json` | `bnr-smoke-test` | Deploys a bump to the test account, polls health as the Check-In, troubleshoots | `cdk deploy`; destroy a stack by name. The Check-In job itself is registered and removed by the Lead |

**The crew does not write to GitHub.** Every agent's GitHub MCP server runs with `--read-only`; the one GitHub write in the whole crew is Version Scout's `git push` of a bump branch, and it prompts. Approving, merging, closing and commenting on pull requests, opening a PR from a pushed branch and marking a draft ready are your clicks in the GitHub UI, proposed by the Lead and recorded by it afterwards. The reason is the branch rule on `main`: it requires a human approval, and an approval produced by a program running under your token would be that rule defeated by its own owner. (Organisation token policies, OAuth App restrictions and SSO enforcement among them, block such writes in many organisations in any case; the upstream `aws-samples` organisation does.) The crew also never runs code from a fork on your machine: CI is the sandbox.

### How a PR is classified

- **Dependabot**, both required checks green, no failed check, mergeable: merge candidate (you approve and squash-merge; the brief gives the commit subject). One under `.github/workflows/` carries a note that it changes CI itself.
- **Dependabot** with a failing check: the failing step and probable cause, plus a proposal (close with a drafted comment, wait for upstream, or a fix you make).
- **A collaborator's PR**: never a merge candidate; checks, mergeability, risk tier and sensitive-path flags.
- **A community PR**: never a merge candidate; a review brief (author association, template checklist, linked issue, Conventional Commit title, checks, sensitive paths) and a drafted reply. A PR that adds a directory under `blueprints/` is recommended for redirection to the Community Catalog, per `CONTRIBUTING.md`.
- **Anything touching `.kiro/agents/`, `.kiro/skills/`, `.kiro/prompts/` or `docs/ageai-*.md`**: human review whoever opened it. These files are instructions to AI agents, and an agent spec can launch MCP servers for everyone who runs the crew.

### How a version bump is rated

| Risk | When | Recommendation |
|---|---|---|
| Low | patch release, no flag/config/storage change | push the branch in one step (your Decision Table tick is the approval); you open the PR |
| Medium | minor release, changed flags or defaults, linked execution/consensus client bump | prepare, then a second confirmation before the push; PR; smoke test optional, run against `main` after you merge |
| High | major release, release-line change, database migration, "new node required", hard-fork deadline, any compatibility concern | as Medium, with a smoke test. Default flow **"PR, then smoke"**: you merge, the crew smokes `main`. For a change you would not want on `main` untested, the crew recommends **"Draft PR + smoke"**: the branch is smoked first and you mark the draft ready after it passes |

Security releases are flagged urgent whatever their risk. A pinned pre-release or release candidate in a shipped configuration is flagged for review.

## How approval is enforced

Telling an agent to ask is one layer. The crew stacks seven:

| Layer | What it stops |
|---|---|
| Instructions and the Decision Table | ordinary mistakes |
| Kiro permission rules in each agent spec: reads allowed, every write `ask`, file writes scoped to each role's directories, every GitHub write tool, `gh` and the commands a role never needs denied outright | unintended writes, including from a prompt injection in a PR or release note |
| `--read-only` on every agent's GitHub MCP server | any GitHub write through MCP, whatever a rule or a prompt says |
| Denied commands on your machine: `gh pr merge|review|close|ready`, `gh api -X` | the crew acting under your own `gh` login |
| The GitHub token: read-only, one repository | the token being worth stealing |
| Branch protection on `main`: pull request required, one approval, required status checks, linear history; merges are your clicks | unreviewed or red merges |
| A separate test AWS account, checked by account ID before every deploy | impact on anything that matters |

**Where the rules are enforced matters.** The four agents are plain Kiro agent templates, and Kiro Crew applies a template's permission rules only in sessions that run the template itself: a chat you open on the template from the agent picker (**Custom agents**), the sessions the Lead dispatches by template name, and the headless Check-In cron. Do **not** turn them into Kiro Crew crewmates: since Kiro Crew 0.11 a crewmate's chat runs on a shared conductor and its hand-offs on a shared worker, both of which ignore the template's permission rules, and the Lead could then no longer dispatch the other three at all. Keep `agent.session_control` at its default (`true`).

**Which backend, and what it costs in prompts.** Kiro Crew runs templates on one of two Kiro backends, set by `agent.acp_backend`. Empty (the default since 0.11) means **KAS**; `kiro` means **kiro-cli**. The crew works on both and requires neither. `deny` rules refuse and `ask` rules prompt on both; the difference is the `allow` rules for shell commands and file writes: kiro-cli honours them (local git, npm and in-scope writes run silently), KAS withholds them (each such call prompts in the worker's tab, with the command or path shown). On KAS a bump costs roughly 10 to 15 prompts instead of 1 or 2; a smoke test a handful more. Every security layer in the table above holds on both. The other difference is attendance: on KAS a round cannot continue while you are away, because every worker call waits for your click and expires after the approval timeout (round 4 paused for 15 hours for that reason); on kiro-cli a round runs by itself up to the next gate or push prompt. Start on the default for a first try; for regular rounds `kirocrew config set agent.acp_backend kiro` and a restart switch to kiro-cli, and back again the same way. Nothing in the package changes. Do not switch the Lead's chat to Trust or YOLO to get past the prompts: that would auto-approve deploys and destroys as well.

**The Lead's chat must run in Normal mode, never Trust.** A dispatched session inherits the approval posture of the chat that dispatched it. In `Trust` or `YOLO` every `ask` rule is answered "yes" silently, in every worker, and the gates below become decoration. (Reads mode is harmless but, on KAS, does not treat shell commands as reads, so it saves nothing here.) The Lead asks you to confirm the mode at the start of each round and dispatches no write item without that confirmation.

**Answer worker prompts with Allow or Reject, never Trust.** Each prompt in a worker tab also offers a Trust (always allow) option. Pressing it switches that worker to auto-approve for the rest of its work: in testing, one Trust click on a harmless file write let the following out-of-scope write and a push dry run go through with no further prompt. The Lead repeats this with every worker link it posts.

**Approval prompts appear in the worker session, not in the Lead's chat**, and expire after `agent.tool_approval_timeout_secs` (600 s by default). The Lead opens each write item as a visible session (`session_create`) and posts its link; keep that session open during Phases 3 and 4 of a round, or raise the timeout for the day.

**Git credentials.** A dispatched session cannot open Git Credential Manager's sign-in dialog, so `git push` fails there unless a credential for `github.com` is already stored. Setup step 9 signs GCM in once as the crew's identity and sets `credential.interactive=false`, so a missing credential fails fast with `could not read Username` instead of hanging.

**Prompt budget**, so it is a choice and not a surprise: PR actions cost one card and no prompts; the clicks are yours in GitHub, where you would have made them anyway. On kiro-cli a Low-risk bump costs the card, one push prompt and opening the PR yourself; a Medium or High bump adds one Gate B confirmation; a smoke test the card, one Gate C confirmation, one deploy prompt in the worker, one Check-In registration prompt in the Lead's chat, and later Gate D plus one destroy prompt. On KAS add one prompt per shell command and per local write in the worker (each `git` call, each file write, each `npm` or `cdk` run; Reads mode does not remove these). If that proves unworkable, switch the backend (above) before dropping any gate.

## The GitHub identity

Two identities are involved, and only one of them belongs to the crew.

**The crew's identity** is the token behind its read-only GitHub MCP server and the Git credential behind Version Scout's `git push`. Because the crew never approves, merges or opens pull requests, this can be your own account without weakening anything: `crew_identity: maintainer` in the steering file. A dedicated machine account (`crew_identity: bot`) works too and gives a separate audit trail for the pushed branches; it needs a seat and may be restricted by your organisation. Either way the branches it pushes are opened as PRs by you, so a bump PR carries your name as author and needs another collaborator's approval, which is the branch rule doing its job.

**The approving identity** is you, in the GitHub UI. Nothing in the crew can approve or merge, so **Do not allow bypassing the above settings** on `main` costs nothing to enable and the upstream repository runs with it on.

### The token

A read-only token is all the crew needs. Fine-grained personal access token, resource owner the repository's owner, repository access this repository only, expiry 90 days or less, permissions **Metadata: Read, Contents: Read, Pull requests: Read, Actions: Read, Commit statuses: Read**, nothing else. If your organisation has not enabled fine-grained tokens for its repositories, a classic token with the `public_repo` scope (or `repo` for a private fork) does the same job; the `--read-only` server flag and the denied write tools mean a broader scope cannot be used for writes by the crew. Do not use a token produced by `gh auth token` or Git Credential Manager: those are OAuth App tokens, and organisations with OAuth App access restrictions (the upstream `aws-samples` among them) reject them for anything but public reads.

Store it in Kiro Crew's secrets vault (Settings → Secrets) under the name **`BNR_CREW_GITHUB_TOKEN`**. The agent specs reference it as `secret://BNR_CREW_GITHUB_TOKEN` in the GitHub MCP server's environment; the gateway resolves it when it starts the server, and no agent, file or chat ever sees the value. Never authenticate `gh` with it.

## Prerequisites

- **Kiro Crew** 0.11 or later, with `kirocrew` on `PATH` serving the data home your dashboard uses (if the CLI refuses the home, set `KIROCREW_HOME` to it explicitly). Project skills enabled in Settings → Developer → Feature Previews. Crewmates are not used.
- **Kiro CLI** installed (both Kiro backends run through it).
- **Node.js 20+**, **AWS CLI v2** and **git** on `PATH`, including the gateway's `PATH` if the gateway runs as a service.
- **[github-mcp-server](https://github.com/github/github-mcp-server)** v2.0.3 native binary on `PATH`. Download the release asset for your platform and verify it against the release's `github-mcp-server_<version>_checksums.txt` before placing it. The agent specs invoke it by name.
- **A test AWS account** with a named CLI profile, CDK-bootstrapped in the region you deploy to. An AWS Budgets alarm on it is strongly recommended.
- **Branch protection on `main`**: pull request required, one approving review, required status checks `Build, test, and validate CDK synthesis` and `Analyze TypeScript` (GitHub names them by job), linear history. Neither workflow has a `paths:` filter; adding one would deadlock website-only PRs.
- The clone and the two worktrees below must lie under a directory listed in Kiro Crew's `agent.subagent_cwd_allowed_roots` (default `~/workspace`, `~/workspaces`, `~/workplace`, `~/workplaces`), or the Lead cannot dispatch sessions into them.

## Setup

The `@setup-maintenance-crew` prompt (`.kiro/prompts/setup-maintenance-crew.md`) walks you through all of this interactively, detects what is already done, verifies the result and can tear it down again. The steps, for reference:

1. **Token** in the vault as `BNR_CREW_GITHUB_TOKEN` (above).
2. **github-mcp-server** on `PATH` (above).
3. **Agent specs and skills copy.** `cp .kiro/agents/bnr-*.json ~/.kiro/agents/` and `cp -r .kiro/skills/bnr-* ~/.kiro/skills/`. The Lead dispatches the other three by name, and Kiro Crew resolves names against `~/.kiro/agents/`; the headless Check-In has no project directory and needs the copy too. The specs name their skills as `skill://~/.kiro/skills/...`, which is why the skills travel with them. (On Windows, Kiro Crew does not load a checkout's own `.kiro/skills/` and never shows the project-trust prompt for skills; the home copy is the only route there.) Re-copy both after a `git pull` that changes `.kiro/agents/` or `.kiro/skills/`. Do not create crewmates from these specs; if an earlier setup did, delete them (Crewmates page, or `kirocrew agent delete <name>`) along with their files under `~/.kiro/mates/agents/`.
4. **Kiro Crew settings.** `agent.session_control` at its default (`true`), and the clone plus both worktrees below under a directory in `agent.subagent_cwd_allowed_roots`. Read `agent.acp_backend` (`kirocrew config get agent.acp_backend`) so you know which backend the crew runs on: empty is KAS (prompt per command and write), `kiro` is kiro-cli (silent allows). Either works; see "Which backend" above.
5. **Worktrees.** From the clone: `git worktree add --detach ../bnr-scout origin/main` and `git worktree add --detach ../bnr-smoke origin/main`, then `npm ci` in each. Version Scout and the Smoke Tester work there, never in your clone. On Windows also set `*.sh text eol=lf` in the clone's `.git/info/attributes` and re-check out the shell scripts in the two worktrees only (`git rm --cached -r -q -- '*.sh'` then `git checkout -- '*.sh'`, both clean); never `git checkout -- .` in your clone, which would discard your uncommitted work. A CRLF shell script makes a deployed instance's bootstrap fail.
6. **Trust.** Grant **project-skill trust** and **project MCP trust** for the clone, `bnr-scout` and `bnr-smoke` when the dashboard asks: two gates times three checkouts, so up to six prompts, and do not stop after the first three. On Windows the skill-trust prompt never appears (see step 3); only the MCP-trust prompts do.
7. **Route the GitHub MCP server** through Kiro Crew's MCP gateway if the dashboard asks for it (Developer → MCP Management). The `secret://` reference is resolved only by the gateway; a server it does not manage refuses to start.
8. **Denied commands** (Settings → Security): one rule, `gh\s+(pr\s+(merge|review|close|ready)|api\s+.*(-X|--method)\b)`, with a note that contains no colon.
9. **Git credentials.** `git credential-manager github login` once, as the crew's GitHub identity, then `git config --global credential.interactive false`. Check with `git credential-manager github list`.
10. **Steering file** `~/.kiro/steering/bnr-crew.md`:
   ```markdown
   ---
   inclusion: always
   name: bnr-crew
   description: Local settings for the AWS Blockchain Node Runners maintenance crew
   ---
   - aws_profile: <your test-account profile>
   - test_account_id: <12-digit account id>
   - crew_identity: bot | maintainer
   - clone_path: <absolute path of the clone>
   - scout_worktree_path: <absolute path of bnr-scout>
   - smoke_worktree_path: <absolute path of bnr-smoke>
   - round_reports_path: <absolute path of a directory outside every checkout>
   - clone_folder: bnr-clone
   - scout_folder: bnr-scout
   - smoke_folder: bnr-smoke
   ```
   It is user-level so every session loads it, the headless Check-In included. It also reaches unrelated Kiro sessions on the same machine, which is harmless: it holds no secret. `round_reports_path` is where Round Reports go; `<Kiro Crew data home>/workspace/maintenance/rounds` is a sensible default. The three `*_folder` names are the sidebar folders of step 11.
11. **Three sidebar folders.** In the sessions sidebar, **More create options → New folder**, three times; in each folder's **Folder settings** set the project directory: `bnr-clone` → the clone, `bnr-scout` → the scout worktree, `bnr-smoke` → the smoke worktree. A worker session the Lead opens takes its working directory from the folder it is filed into; the Lead can create folders but cannot set their project directory, so this step is yours. Without it a worker starts in the default workspace and stops at its own directory check.
12. **The Lead's chat.** New chat → agent picker → **Custom agents** → `bnr-maintainer-lead`; set the project directory to the clone; set the approval mode to **Normal** (never Trust or YOLO). Every round starts in this chat with `@maintenance-round` (`.kiro/prompts/maintenance-round.md`). If `bnr-maintainer-lead` is missing from the picker, step 3 was not done.

### Verify

- In the Lead's chat: ask it to call `get_me`; the login must be the crew's account. One success proves the gateway found `github-mcp-server` on its own `PATH`, the vault reference resolved, and the token authenticates.
- Ask it to load its skill with `skill_search`; `bnr-maintenance-round` must be found.
- `aws sts get-caller-identity --profile <aws_profile>` returns `test_account_id`.
- `git credential-manager github list` names the crew's account.
- Try `gh pr merge` in any chat: it must be refused.

### Teardown

`kirocrew cron remove` any `bnr-smoke-*` job; `git worktree remove ../bnr-scout ../bnr-smoke`; delete `~/.kiro/agents/bnr-*.json`, `~/.kiro/skills/bnr-*/` and `~/.kiro/steering/bnr-crew.md`; `git credential-manager github logout`; delete the vault entry; remove the denied-command rule and any MCP routing; delete the Round Reports directory if you no longer want the history. If an older setup created crewmates, delete them and their `~/.kiro/mates/agents/` files too.

## The first rounds

Run two **shadow rounds** first: the crew produces Decision Tables, you act by hand, and the Round Report records where you agreed. Every report shows the running agreement rate. When you are satisfied, run full rounds: the difference is only that bumps and smoke tests are dispatched after your tick; PR actions are your clicks in both kinds of round.

## Round Report format

One file per round in `round_reports_path`, `<YYYY-MM-DD>-<short-sha>.md`: base commit, scope, a table of every item with recommendation, your decision, what was executed and the resulting link; smoke tests still running; crew stacks still present; rejected items; notes for the next round. No secrets, account IDs or local paths.

## Relation to the interactive workflows

`docs/ageai-version-update-prompt.md` says it is not a CI pipeline and that the human is always in control. The crew keeps both promises: it starts only when you ask, it runs the workflow's discovery and analysis unattended inside a round, and it stops at the workflow's own approval gate, which the Decision Table replaces. The deploy, healthcheck and troubleshooting workflows are used unchanged.
