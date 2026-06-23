# Update Blockchain Node Client Versions

Check for and apply new versions of blockchain node client software across built-in blueprints.

## What This Does

This prompt guides you through the full version update lifecycle:
- Discover newer client versions from upstream release channels
- Check compatibility before proposing changes
- Apply minimal source-code changes (after your approval)
- Optionally deploy a test node and run a smoke test
- Report results and offer to commit or revert

## Instructions

Read the file `docs/ageai-version-update-prompt.md` and follow the step-by-step workflow to check and apply version updates.

## Prerequisites

- Repository cloned with `npm install` completed
- (Optional, for test deployment) AWS credentials configured

## Expected Outcome

A structured report of available updates, followed by (with your approval):
- Updated configuration scripts, package.json, samples, and README
- Local validation passing (build + test + cdk synth)
- Optionally: a test deployment confirming the upgraded node starts and syncs
