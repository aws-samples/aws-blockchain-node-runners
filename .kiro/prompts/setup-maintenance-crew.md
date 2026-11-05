# Set Up the Maintenance Crew

Set up the Kiro Crew environment for the agentic maintenance crew that triages pull requests, prepares blockchain client version bumps and smoke-tests them for this repository.

## What This Does

This prompt guides you through placing every artifact the crew needs outside the repository where Kiro Crew expects it:
- The GitHub token in the Kiro Crew secrets vault (you type it, the agent never sees it)
- The `github-mcp-server` binary, verified against its release checksums
- The four agent specs copied to `~/.kiro/agents/`, and the two git worktrees two of them work in
- Project trust and the denied-command rule in the Kiro Crew dashboard
- A one-time Git Credential Manager sign-in as the crew's GitHub identity
- The local steering file with your AWS profile, test account ID and Round Report directory
- The Maintainer Lead's chat, opened on the `bnr-maintainer-lead` template in the normal approval mode

It detects what is already done, asks before every write, verifies the result, and can tear everything down again.

## Instructions

Read the file `docs/ageai-setup-maintenance-crew-prompt.md` and follow the step-by-step workflow.

## Prerequisites

- Kiro Crew 0.11 or later running on this machine, with Kiro CLI installed
- A clone of this repository (or your fork) under a directory Kiro Crew allows for dispatched sessions
- A GitHub account for the crew's read-only token and branch pushes (your own is fine; the crew never approves or merges) and a test AWS account with a CLI profile
- Read `docs/maintenance-crew.md` first for what the crew does and how approval is enforced

## Expected Outcome

- The four agents (Maintainer Lead, PR Triage, Version Scout, Smoke Tester) available as custom agents in Kiro Crew, with the Lead's chat open
- A verification report, item by item
- No change to any tracked file in the repository (`git status` stays clean)
