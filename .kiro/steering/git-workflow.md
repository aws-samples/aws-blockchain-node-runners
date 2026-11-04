# Git Workflow: Branches, Commits, and Releases

The operational rules for how changes move from a working copy to a release in
this repository. Applies to all changes Kiro makes and to maintainer decisions
about when to open a PR, how to write commits, and when to cut a release.

This is the detailed decision source. `CONTRIBUTING.md` carries a short,
contributor-facing summary that links here.

## Context this is tuned for

- **One active maintainer**, a pool of organisation collaborators who can
  approve, plus **occasional community PRs** (mostly new blueprints) submitted
  from forks. An agentic **maintenance crew** (`docs/maintenance-crew.md`)
  triages PRs and prepares version-bump branches; it never approves, merges or
  opens a PR, so every write to GitHub is a human's click.
- **Two risk tiers** of change:
  - **Low risk** — the docs website (`website/`) and Markdown docs (`docs/`,
    `README.md`, `CHANGELOG.md`). Cannot break a customer deployment.
  - **High risk** — everything that affects a deployment or the supply chain:
    `lib/`, `blueprints/**` (non-doc), `test/`, root configs (`package.json`,
    `tsconfig.json`, `cdk.json`, `app.ts`), `.github/**`, and the
    **agent-instruction paths** `.kiro/agents/**`, `.kiro/skills/**`,
    `.kiro/prompts/**`, `docs/ageai-*.md`: these are instructions AI agents
    execute, and an agent spec launches MCP servers and grants permissions for
    everyone who runs the crew. They get human review whoever opened the PR
    and are never a crew merge candidate.
- Keep process light. Trunk-based, not Gitflow. Don't add ceremony that a
  solo/small-team repo doesn't need.

## Branch model

Trunk-based development around a single integration branch.

| Branch | Role | Rules |
|--------|------|-------|
| `main` | Default + integration branch. Always releasable. | Protected. No force-push, no deletion. Website auto-deploys from it. |
| `v1` | Frozen legacy (pre-rewrite). | Protected. No new features. Security-only fixes if ever. Linked from `CHANGELOG.md`. |
| `gh-pages` | **Legacy** Docusaurus deploy branch (pre-first-party-Pages). | No longer written — the site now deploys via the first-party Pages artifact model in `website-deploy.yaml`. Delete once the first-party deploy is verified. |
| `feat/*`, `fix/*`, `docs/*`, `chore/*`, `ci/*` | Short-lived working branches for non-trivial work. | Branch from `main`, open a PR, delete after merge. |
| `dependabot/*` | Automated dependency PRs. | Managed by Dependabot; merge or close, don't push to them. |
| `chore/<protocol>-<client>-<version>` | Client version bumps prepared by the maintenance crew. | Pushed by Version Scout after approval; the maintainer opens the PR; squash-merge, delete after merge. |

- Community contributors work from **forks** and target `main`.
- Keep working branches short-lived; rebase or merge `main` in to stay current.
- The many stale per-protocol branches from the v1 era (`solana`, `polygon`,
  `sui`, `vechain`, …) are **not** part of the v2 model — new protocols are
  external NPM blueprints, not branches. Prune them when convenient; do not add
  new ones.
- No long-lived `develop` branch. `main` is the trunk; the value a `develop`
  buffer would add is already covered by PR checks plus the low/high risk split.

**Merge policy:** squash-and-merge PRs into `main`, then delete the branch. This
keeps history linear (one commit per logical change) and makes the PR title the
permanent commit subject — so the PR title must be a valid Conventional Commit.
Reserve merge commits for the rare case where preserving individual commits
matters (e.g. importing external history).

## Commit conventions

Use [Conventional Commits](https://www.conventionalcommits.org/).

```
<type>(<optional scope>): <subject>

<optional body — what and why, wrapped ~72 cols>

<optional footer — e.g. Fixes #123, BREAKING CHANGE: ...>
```

**Types:** `feat`, `fix`, `docs`, `refactor`, `perf`, `test`, `build`, `ci`,
`chore`, `revert`.

**Scope** (optional) is the blueprint or area touched: `feat(solana):`,
`fix(base):`, `docs(website):`, `ci:`, `chore(deps):`, `feat(core):`.

**Subject:** imperative mood ("add", not "added"), capitalized, no trailing
period, keep the whole header under ~72 characters.

**Granularity:** one logical change per commit. Don't mix a refactor with a
feature, or a dependency bump with a behavior change. Because PRs are
squash-merged, the **PR title** is what lands on `main` — make it the
Conventional Commit subject, and the body is the squash commit body.

**Footers:** link issues with GitHub keywords (`Fixes #123`, `Closes #123`, or
`Refs #123`). Mark incompatible changes with a `BREAKING CHANGE:` footer (or a
`!` after the type, e.g. `feat!:`) — this is what flags a MAJOR bump.

**Breaking-change discipline:** any commit that changes a `.env` variable name,
a blueprint `package.json` `"aws-blockchain-node-runner"` field, the deployment
workflow, or anything that forces users to change config or redeploy MUST carry
`BREAKING CHANGE:` and a `CHANGELOG.md` entry.

## Everything reaches `main` through a PR

Since November 2026 the branch rule on `main` has **no bypass** ("Do not allow
bypassing the above settings" is on), so nobody, the maintainer included, can
push to `main` directly. Every change is a PR with one approval from a
collaborator who is not its author and green required checks. The risk tiers
below now decide how much review a PR gets, not whether it needs one.

Which CI runs is still worth knowing: `build-and-test` and `CodeQL` run on both
push and PR; the security and lint scanners are **PR-only** and therefore run on
every change now:

- `ASH Security Scan` — advisory, posts a comment (read the run log too: a scan
  that failed to run also reports "no findings", see `ci-workflows.md`)
- `Dependency Review` — blocks on HIGH/CRITICAL
- `pre-commit` (ShellCheck, secret/format hooks)
- `website-test-deployment`

| Change | Path / nature | Review |
|--------|---------------|--------|
| Docs & website content | `website/`, `docs/`, `README.md`, `CHANGELOG.md`, code comments, typo fixes | **PR required**; a light review is enough. Website redeploys on merge. |
| Blueprint config or logic | `blueprints/**` (non-doc): user-data, CDK wiring, sample `.env`, `package.json` | **PR required** — affects deployments and is scanned by ASH/dep-review. |
| CDK framework | `lib/`, `app.ts`, `test/`, root configs | **PR required** — core deployment contract; needs full check suite. |
| CI / workflows / scanners | `.github/**`, `.pre-commit-config.yaml`, `dependabot.yml` | **PR required** — so the changed workflow and the security suite run before it lands; lets SHA-pin changes be reviewed. |
| Agent instructions | `.kiro/agents/**`, `.kiro/skills/**`, `.kiro/prompts/**`, `docs/ageai-*.md` | **PR required, human review whoever opened it** — call out any change to `mcpServers`, `command`, `args`, `env` or `permissions` in an agent spec. |
| Security-sensitive | IAM, security groups, secrets handling, auth, anything ASH/CodeQL would flag | **PR required, careful review** — even for the maintainer. |
| Dependency bumps | `package*.json`, action SHAs | Via **Dependabot PRs** (weekly, grouped). The maintenance crew classifies them; the maintainer approves and squash-merges in the GitHub UI. |
| Client version bumps | `blueprints/<protocol>/**` configs, `CHANGELOG.md` | Branch pushed by the crew's Version Scout after approval; the maintainer opens the PR; another collaborator approves. |
| New community blueprint | external contributor | **PR from a fork**; redirected to the Community Catalog per `CONTRIBUTING.md` unless adopted as built-in. |

Rule of thumb: **everything goes through a PR; the tier decides how hard to
look.** When unsure, ask for a second reviewer.

## Versioning

[Semantic Versioning 2.0.0](https://semver.org/). The repo version in the root
`package.json` is the source of truth.

| Bump | When |
|------|------|
| **MAJOR** | Breaking change to the universal app contract: `.env` variable rename/removal, blueprint interface change, deployment workflow change, anything needing teardown/redeploy or config edits. (The v1 → v2 rewrite was a MAJOR.) |
| **MINOR** | Backwards-compatible additions: a new built-in blueprint, a new optional config variable, a new AI prompt/workflow, a new deployment mode, additive construct features. |
| **PATCH** | Backwards-compatible fixes: bug fixes, security patches, behavior-neutral dependency bumps. |

**Blueprints version independently.** Each blueprint has its own `version` in
its `package.json`. Built-in blueprints currently move with the repo; external
blueprints published to NPM carry their own SemVer. Bumping a blockchain client
version inside a blueprint (via the `@version-update` workflow) is that
blueprint's MINOR/PATCH and does not by itself require a repo release.

**Tag format:** annotated `vMAJOR.MINOR.PATCH` (e.g. `v2.1.0`) on the release
commit. This is a different namespace from the automated
`daily-YYYY.MM.DD` snapshot tags created by `daily-tag.yml` — those are dated
checkpoints, **not** releases, and the two coexist.

**Backfill needed:** `2.0.0` exists in `package.json` and `CHANGELOG.md` but was
never cut as a git tag or GitHub Release. Create the `v2.0.0` tag and Release
against the v2 baseline commit to establish the starting point before the next
release.

## Release calendar and process

**Cadence: milestone / ad-hoc, not fixed-time.** Don't force a release when
nothing shipped. Cut a release when one of these is true:

- a new blueprint or user-facing feature has landed on `main`, or
- enough fixes/patches have accumulated to be worth packaging, or
- a security fix needs to go out — cut a PATCH immediately.

Keep a lightweight guardrail: about **once a month**, review whether the
`## [Unreleased]` section of `CHANGELOG.md` justifies a release. Docs and the
website are **decoupled** from this — they deploy continuously on every push to
`main` and are never gated by the release calendar.

**Release steps** (manual; no release-automation workflow exists yet):

1. Confirm `main` is green (`build-and-test`, `CodeQL`).
2. Bump `version` in the root `package.json` (and any blueprint `package.json`
   that changed).
3. In `CHANGELOG.md`, rename `## [Unreleased]` to `## [X.Y.Z] — YYYY-MM-DD` and
   start a fresh empty `## [Unreleased]` above it.
4. Open a PR titled `chore(release): vX.Y.Z` so the full check suite runs, then
   squash-merge it (a version bump is a high-risk, version-bearing change).
5. Tag the merge commit: `git tag -a vX.Y.Z -m "vX.Y.Z"` and push the tag.
6. Create the GitHub Release from the tag
   (`gh release create vX.Y.Z --notes-file <changelog-section>`); the release
   body is that version's changelog section.

Automating this later (e.g. release-please or a tag-triggered release workflow)
is reasonable, but keep it manual and simple while the repo is solo-maintained.

## Branch protection (`main`)

What is configured on `main` (classic branch protection; `v1` has a
deletion/force-push block only):

- **Block force pushes** and **restrict deletion.**
- **Require a pull request before merging** with **one approving review**.
  GitHub never counts the author's own approval, so every PR, the maintainer's
  included, needs a second collaborator.
- **Require status checks to pass:** `Build, test, and validate CDK synthesis`
  (the `build-and-test` job) and `Analyze TypeScript` (the `CodeQL` job).
  GitHub names required checks by **job**, not workflow. Neither workflow has a
  `paths:` filter; adding one would deadlock PRs that touch nothing it watches.
  **ASH** and **Dependency Review** stay advisory until a burn-in confirms a low
  false-positive rate and "scan failed to run" is distinguishable from "scan
  found findings" (see `ci-workflows.md`).
- **Require linear history** — pairs with squash-merge.
- **Do not allow bypassing the above settings: on.** Administrators are bound
  by the rule like everyone else. The maintenance crew cannot merge anyway (its
  GitHub access is read-only), so this setting costs nothing and keeps the
  maintainer's own clicks under the same rule.
- **Signed commits:** optional. Dependabot's commits are signed by GitHub; the
  first-party Pages deploy publishes an artifact, so a signed-commits rule
  would not interfere with it.

**Maintenance crew and identities.** The crew's GitHub token is read-only and
the crew holds no GitHub write tool; its only GitHub write is `git push` of a
bump branch, which prompts the maintainer first. The maintainer approves and
merges Dependabot PRs in the GitHub UI after the crew's Decision Table, opens
bump PRs from crew-pushed branches (so another collaborator approves them), and
posts any drafted comment. See `docs/maintenance-crew.md`.

Revisit when the contributor base grows: add `CODEOWNERS` for the
agent-instruction paths, and consider promoting ASH to a blocking check.
