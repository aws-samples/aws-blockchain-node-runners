# Contributing Guidelines

Thank you for your interest in contributing to our project. Whether it's a bug report, new feature, correction, or additional
documentation, we greatly value feedback and contributions from our community.

Please read through this document before submitting any issues or pull requests to ensure we have all the necessary
information to effectively respond to your bug report or contribution.


## Reporting Bugs/Feature Requests

We welcome you to use the GitHub issue tracker to report bugs or suggest features.

When filing an issue, please check existing open, or recently closed, issues to make sure somebody else hasn't already
reported the issue. Please try to include as much information as you can. Details like these are incredibly useful:

* A reproducible test case or series of steps
* The version of our code being used
* Any modifications you've made relevant to the bug
* Anything unusual about your environment or deployment


## Contributing via Pull Requests
Contributions via pull requests are much appreciated. Before sending us a pull request, please ensure that:

1. You are working against the latest source on the *main* branch.
2. You check existing open, and recently merged, pull requests to make sure someone else hasn't addressed the problem already.
3. You open an issue to discuss any significant work - we would hate for your time to be wasted.

To send us a pull request, please:

1. Fork the repository.
2. Modify the source; please focus on the specific change you are contributing. If you also reformat all the code, it will be hard for us to focus on your change.
3. Ensure local tests pass.
4. Run local validation: `npm run build && npm run test && npm run run-pre-commit`
5. Commit to your fork using clear commit messages.
6. Send us a pull request, answering any default questions in the pull request interface.
7. Pay attention to any automated CI failures reported in the pull request, and stay involved in the conversation.

GitHub provides additional document on [forking a repository](https://help.github.com/articles/fork-a-repo/) and
[creating a pull request](https://help.github.com/articles/creating-a-pull-request/).

Your PR will be checked by automated CI workflows including security scanning (ASH), CodeQL analysis, dependency review, and ShellCheck for shell scripts. Address any findings before requesting review.

Most ASH findings are advisory (reported as a PR comment). The exception: prompt-injection findings on AI prompt files (`docs/ageai-*.md`, `.kiro/prompts/*.md`) are **blocking** — the scan fails and the PR cannot merge until resolved. If a match is a genuine false positive (for example, security-review wording that legitimately describes an attack pattern), suppress it with an inline `nosemgrep: <rule-id>` comment on the offending line and a short justification. Suppressions are version-controlled and reviewed in the diff.


## Branching, Commits, and Releases

This project uses a lightweight, trunk-based workflow.

**Branches**
- `main` is the default, always-releasable integration branch. The docs website deploys from it automatically.
- `v1` is the frozen legacy branch (pre-v2 rewrite) — no new features.
- Do your work on a short-lived branch in your fork, then open a PR against `main`. Branch names like `feat/...`, `fix/...`, or `docs/...` are encouraged.

**Commits** follow [Conventional Commits](https://www.conventionalcommits.org/):

```
<type>(<optional scope>): <subject>
```

- Types: `feat`, `fix`, `docs`, `refactor`, `perf`, `test`, `build`, `ci`, `chore`, `revert`.
- Scope is the blueprint or area, e.g. `feat(solana):`, `fix(base):`, `docs(website):`.
- Use the imperative mood, capitalize the subject, no trailing period, keep the header under ~72 characters.
- One logical change per commit. Link issues in the footer (`Fixes #123`), and flag incompatible changes with a `BREAKING CHANGE:` footer.

PRs are **squash-merged**, so your PR title becomes the commit on `main` — make it a valid Conventional Commit subject.

**Pull requests** are required for all code, blueprint, configuration, and CI changes (and are the only path for external contributors, who work from forks). Trivial docs-only edits are the exception. Every PR runs build, tests, CDK synth, CodeQL, dependency review, ShellCheck, and the ASH security scan — resolve findings before requesting review.

**Releases** use [Semantic Versioning](https://semver.org/): MAJOR for breaking changes to configuration or the deployment contract, MINOR for backwards-compatible additions (such as a new blueprint), and PATCH for fixes. Releases are milestone-based — cut when meaningful changes accumulate — and recorded in [CHANGELOG.md](./CHANGELOG.md) with a matching `vX.Y.Z` git tag and GitHub Release. User-facing changes should add an entry under `## [Unreleased]` in the changelog.

> Maintainers: the full decision rules (PR-vs-direct-commit thresholds, version-bump criteria, release steps, and branch-protection configuration) live in `.kiro/steering/git-workflow.md`.


## Contributing a New Blockchain Protocol

Since v2, new protocols are added as **external community blueprints** — standalone NPM packages maintained in your own repository. You do not need to modify this repo to support a new chain.

- **[About Blueprints](https://aws-samples.github.io/aws-blockchain-node-runners/docs/blueprints/about)** — architecture, directory structure, and the pluggable NPM system
- **[Add Protocol with AI](https://aws-samples.github.io/aws-blockchain-node-runners/docs/ai-prompts/add-protocol-with-ai)** — AI-assisted workflow for creating a new blueprint end-to-end
- **[Community Blueprints](https://aws-samples.github.io/aws-blockchain-node-runners/docs/blueprints/community)** — how to submit your blueprint for catalog listing
- **Reference implementation:** `blueprints/dummy/` in this repository


## Finding contributions to work on
Looking at the existing issues is a great way to find something to contribute on. As our projects, by default, use the default GitHub issue labels (enhancement/bug/duplicate/help wanted/invalid/question/wontfix), looking at any 'help wanted' issues is a great place to start.


## Code of Conduct
This project has adopted the [Amazon Open Source Code of Conduct](https://aws.github.io/code-of-conduct).
For more information see the [Code of Conduct FAQ](https://aws.github.io/code-of-conduct-faq) or contact
opensource-codeofconduct@amazon.com with any additional questions or comments.


## Security issue notifications
If you discover a potential security issue in this project we ask that you notify AWS/Amazon Security via our [vulnerability reporting page](http://aws.amazon.com/security/vulnerability-reporting/). Please do **not** create a public github issue.


## Licensing

See the [LICENSE](LICENSE) file for our project's licensing. We will ask you to confirm the licensing of your contribution.
