# Pre-merge tools

We need your help to achieve better code quality and make sure the blueprints stay secure. Before merging your new commit, please set up and run the following tools on your development machine.

1. [git-secrets](https://github.com/awslabs/git-secrets)

```bash
# Install (Mac OS)
npm run install-git-secrets-mac

# Install on other platforms: https://github.com/awslabs/git-secrets#installing-git-secrets

# Setup
npm run setup-git-secrets

# Scan history
npm run scan-history-git-secrets

# Scan repository
npm run scan-repo-git-secrets
```

2. [semgrep](https://github.com/semgrep/semgrep)

```bash
# Install (Mac OS)
npm run install-semgrep-mac

# Install on other platforms: https://github.com/semgrep/semgrep#option-2-getting-started-from-the-cli

# Scan
npm run scan-semgrep
```

3. [pre-commit](https://pre-commit.com)

```bash
# Install (Mac OS)
npm run install-pre-commit-mac

# Run
npm run run-pre-commit
```

4. Optionally, run [shellcheck](https://github.com/koalaman/shellcheck) to check for common problems in your shell scripts.
