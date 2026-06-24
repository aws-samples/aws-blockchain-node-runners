# Git Workflow: Branches, Commits, and Releases

The operational rules for how changes move from a working copy to a release in
this repository. Applies to all changes Kiro makes and to maintainer decisions
about when to open a PR, how to write commits, and when to cut a release.

This is the detailed decision source. `CONTRIBUTING.md` carries a short,
contributor-facing summary that links here.

## Context this is tuned for

- **One maintainer** with push access, plus **occasional community PRs** (mostly
  new blueprints) submitted from forks.
- **Two risk tiers** of change:
  - **Low risk** — the docs website (`website/`) and Markdown docs (`docs/`,
    `README.md`, `CHANGELOG.md`). Cannot break a customer deployment.
  - **High risk** — everything that affects a deployment or the supply chain:
    `lib/`, `blueprints/**` (non-doc), `test/`, root configs (`package.json`,
    `tsconfig.json`, `cdk.json`, `app.ts`), and `.github/**`.
- Keep process light. Trunk-based, not Gitflow. Don't add ceremony that a
  solo/small-team repo doesn't need.

## Branch model

Trunk-based development around a single integration branch.

| Branch | Role | Rules |
|--------|------|-------|
| `main` | Default + integration branch. Always releasable. | Protected. No force-push, no deletion. Website auto-deploys from it. |
| `v1` | Frozen legacy (pre-rewrite). | Protected. No new features. Security-only fixes if ever. Linked from `CHANGELOG.md`. |
| `gh-pages` | Machine-managed Docusaurus build output. | Never hand-edit; written by `website-deploy.yaml`. |
| `feat/*`, `fix/*`, `docs/*`, `chore/*`, `ci/*` | Short-lived working branches for non-trivial work. | Branch from `main`, open a PR, delete after merge. |
| `dependabot/*` | Automated dependency PRs. | Managed by Dependabot; merge or close, don't push to them. |

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

## When to open a PR vs. commit directly to `main`

The deciding factor is **which CI runs**. `build-and-test` and `CodeQL` run on
both push and PR, but the security and lint scanners are **PR-only**:

- `ASH Security Scan` — PR only (advisory, posts a comment)
- `Dependency Review` — PR only (blocks on HIGH/CRITICAL)
- `pre-commit` (ShellCheck, secret/format hooks) — PR only
- `website-test-deployment` — PR only

So **a direct push to `main` skips ASH, dependency review, and pre-commit
entirely.** Anything you'd want those scanners to inspect must go through a PR.

| Change | Path / nature | Route |
|--------|---------------|-------|
| Docs & website content | `website/`, `docs/`, `README.md`, `CHANGELOG.md`, code comments, typo fixes | Maintainer **may commit directly** to `main`. Build still runs on push; website redeploys automatically. |
| Blueprint config or logic | `blueprints/**` (non-doc): user-data, CDK wiring, sample `.env`, `package.json` | **PR required** — affects deployments and is scanned by ASH/dep-review. |
| CDK framework | `lib/`, `app.ts`, `test/`, root configs | **PR required** — core deployment contract; needs full check suite. |
| CI / workflows / scanners | `.github/**`, `.pre-commit-config.yaml`, `dependabot.yml` | **PR required** — so the changed workflow and the security suite run before it lands; lets SHA-pin changes be reviewed. |
| Security-sensitive | IAM, security groups, secrets handling, auth, anything ASH/CodeQL would flag | **PR required, no exceptions** — even for the maintainer. |
| Dependency bumps | `package*.json`, action SHAs | Via **Dependabot PRs** (weekly, grouped). |
| New community blueprint | external contributor | **PR from a fork** (contributors have no push access regardless). |

Rule of thumb: **low-risk docs can go straight to `main`; anything that can
change a deployment, touch the supply chain, or trip a security scanner goes
through a PR.** When unsure, open a PR — it's cheap and runs the full suite.

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

Configure a GitHub **Ruleset** on `main` (and a deletion/force-push block on
`v1`). Tuned so the maintainer keeps low-friction direct docs commits while the
supply chain stays protected:

- **Block force pushes** and **restrict deletion** — the highest-value, zero-cost
  protections. No bypass.
- **Require status checks to pass:** `build-and-test` and `CodeQL` (add
  `website-test-deployment` for website PRs). Keep **ASH** and
  **Dependency Review** advisory for now — promote them to required only after a
  burn-in confirms a low false-positive rate, and distinguish "scan failed to
  run" from "scan found findings" (see `ci-workflows.md`).
- **Require a pull request before merging** for non-bypass actors (this is how
  community/fork PRs are gated), but keep the **maintainer on the bypass list**
  so low-risk docs commits can go directly to `main` per the table above.
- **Required approvals: 0** while solo (you can't approve your own PR). When a
  second maintainer joins, raise to 1 and add a `CODEOWNERS` file.
- **Require linear history** — pairs with squash-merge.
- **Signed commits:** recommended if commit signing is set up (SSH/GPG/gitsign).
  This rule applies per-branch, so enabling it on `main` does not affect the
  `gh-pages` deploy (a separate branch). Dependabot's commits are signed by
  GitHub. Optional while solo; enable once your own signing is configured.

Revisit these when the contributor base grows: require approvals, add
`CODEOWNERS`, and consider promoting ASH to a blocking check.
