---
inclusion: fileMatch
fileMatchPattern: '**/*.sh'
---

# Shell Script Conventions

Applies to shell scripts, including the EC2 provisioning scripts under
`assets/**` and `blueprints/**/user-data/**`.

## Standards

- Keep scripts clean at `shellcheck --severity=warning`. ShellCheck runs in CI
  via the pre-commit hook on changed scripts.
- Many of these scripts run as root via EC2 user-data at instance boot. Prefer
  behavior-preserving fixes (e.g. split `export VAR=$(cmd)` into an assignment
  plus a separate `export`). Never change runtime behavior just to satisfy a
  linter.
- Suppress a finding only with an inline `# shellcheck disable=SCxxxx` plus a
  one-line reason. Do not delete variables that may be consumed by sourced
  scripts or exported for other processes.
- Do not rely on the trailing-whitespace pre-commit hook: these scripts use
  heredocs where whitespace can be significant, so it is intentionally not
  enabled.
