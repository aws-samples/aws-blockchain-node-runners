---
inclusion: fileMatch
fileMatchPattern: '.github/**'
---

# CI Workflow Conventions

Applies when editing GitHub Actions workflows, Dependabot config, or scanner
rule files under `.github/`.

## GitHub Actions

### Action pinning (tiered policy)

This repo is maintained by one person plus AI agents, so the pinning rule is
tiered to put effort where the supply-chain risk actually is, while minimizing
review churn:

- **Third-party actions (anything not `actions/*` or `github/*`): MUST be pinned
  to a full commit SHA** with a trailing `# vX.Y.Z` comment. This is where the
  real risk lives — tag-repointing supply-chain attacks (e.g. the
  `tj-actions/changed-files` compromise, CVE-2025-30066) target third-party
  actions. There are only a handful in this repo, so the cost is small.
  Especially mandatory for any third-party action that runs with a `write`
  permission scope or receives a token. (The website deploy previously used
  `peaceiris/actions-gh-pages` with `contents: write`; it now uses GitHub's
  first-party Pages actions with OIDC, so no third-party action holds repository
  write access.)
- **First-party actions (`actions/*`, `github/*`): a major-version tag (e.g.
  `@v4`) is acceptable.** These are GitHub-owned and carry a much lower
  tag-repointing risk. Allowing major tags here removes most Dependabot review
  noise for a solo maintainer. SHA-pinning them is still welcome but not
  required.
- `.github/dependabot.yml` keeps SHA pins current via a weekly grouped PR, so
  pinned third-party actions stay up to date without manual SHA lookups.

Rationale: this is intentionally a *relaxation* of a blanket "pin everything"
rule. It trades a negligible increase in first-party risk for materially less
maintenance, and concentrates strict pinning on the third-party actions that
have historically been the attack vector.
- Give every workflow an explicit, least-privilege `permissions:` block. Grant
  `write` scopes only on the specific job that needs them.
- Never interpolate PR-controlled values (`${{ github.event.* }}`, changed-file
  lists, branch names) directly into `run:` or `script:` bodies. Pass them via
  `env:` and reference `$VAR` / `process.env` to prevent script injection.
- Scope PR checks to the files changed in the PR, not the whole repo, so
  pre-existing findings in untouched files don't block unrelated changes.
- Introduce a new security gate as advisory first (non-blocking, results in a
  PR comment). Only make it a required/blocking check after a burn-in period
  confirms a low false-positive rate, and distinguish "scan failed to run" from
  "scan found findings."

## Security scanning

- ASH is the umbrella scanner. Add custom rules (e.g. Semgrep) to ASH's config
  rather than standing up parallel scanner workflows.
- Keep pre-commit fast: do not duplicate ASH's heavy scanners
  (Semgrep/Checkov/Grype) there.

## Single source of truth

- Exact action SHAs, the pre-commit hook list, and tool versions live in the
  config files themselves — do not restate them here.
