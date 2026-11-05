# Run a Maintenance Round

Start one maintenance round of the agentic maintenance crew: triage open pull requests, discover client releases, present the Decision Table, and carry out only what the maintainer ticks.

## What This Does

The Maintainer Lead runs one round as described in `docs/maintenance-crew.md`:
- Collects: PR Triage classifies every open pull request; Version Scout compares pinned client versions with upstream releases and rates each bump
- Presents one Decision Table as a multi-select card; unticked is rejected
- Hands every pull-request action (approve, merge, close, open a PR) to you in the GitHub UI and records the outcome; the crew never writes to GitHub
- Prepares ticked bumps in its own worktree, validates them, pushes the branch after a second confirmation, and posts the compare link for you to open the PR
- Deploys ticked smoke tests on the test AWS account after a second confirmation and hands the wait to a read-only Check-In
- Writes a private Round Report

## Instructions

This prompt is for the Lead's chat only: a chat opened on the `bnr-maintainer-lead` agent template, with the repository clone as project directory, in approval mode Normal. Run a maintenance round. Load the `bnr-maintenance-round` skill with `skill_search` and follow it. Scope is everything unless the message after this prompt names one: `PRs only`, `versions only`, a single blueprint, or `shadow` (Phases 0-2 only, nothing dispatched after Gate A).

## Prerequisites

- The environment set up by `@setup-maintenance-crew` (home copies of the agent specs and skills, worktrees, steering file, sidebar folders, read-only GitHub token in the vault)
- Both worktrees detached at `origin/main` and clean
- This chat in approval mode Normal; worker prompts answered Allow or Reject, never Trust

## Expected Outcome

- A Decision Table in this chat, one row per proposed action, with the review brief and drafted reply under every community PR
- For ticked rows: PR links handed to you with the action and text to use; pushed bump branches with compare links; deployed test stacks with their Check-In job ids
- A Round Report in `round_reports_path`, written right after the Decision Table is answered and updated as items complete
