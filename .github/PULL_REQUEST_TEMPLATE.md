### What does this PR do?

🛑 Please open an issue first to discuss any significant work and flesh out details/direction — we would hate for your time to be wasted.
Consult the [CONTRIBUTING](https://github.com/aws-samples/aws-blockchain-node-runners/blob/main/CONTRIBUTING.md) guide for submitting pull-requests.

<!-- A brief description of the change being made with this pull request. -->

### Motivation

<!-- What inspired you to submit this pull request? -->

### Type of Change

- [ ] Bug fix (non-breaking change which fixes an issue)
- [ ] New feature (non-breaking change which adds functionality)
- [ ] New blueprint (adding a new protocol — see checklist below)
- [ ] Documentation update
- [ ] Breaking change (fix or feature that would cause existing functionality to not work as expected)

### Testing

- [ ] I have run `npm run build` successfully
- [ ] I have run `npm run test` and all tests pass
- [ ] I have run `npx cdk synth` with a sample `.env` (e.g. from `blueprints/dummy/samples/`) and it succeeds
- [ ] I have run pre-commit hooks: `npm run run-pre-commit`

### New Blueprint Checklist (if adding a protocol)

- [ ] Blueprint follows the structure of `blueprints/dummy/` (reference implementation)
- [ ] Blueprint README follows the standard template (matches Dummy section titles and ordering)
- [ ] Setup section points to [Getting Started](https://aws-samples.github.io/aws-blockchain-node-runners/docs/getting-started/quickstart) (not inline instructions)
- [ ] Deployment section leads with AI-driven deployment (Option 1) and manual as Option 2
- [ ] Sample `.env` files are provided for at least one network (mainnet or testnet)
- [ ] Configuration scripts follow the install/run dispatch pattern (see `blueprints/dummy/`)
- [ ] Blueprint page added to `website/docs/blueprints/` (.mdx mirror importing README)
- [ ] Client Release Channels table added to README under Additional Resources

### Documentation

- [ ] I have updated relevant documentation (if applicable)
- [ ] I have run `cd website && npm run build` with no broken links (if docs changed)

### License

By submitting this pull request, I confirm that you can use, modify, copy, and redistribute this contribution, under the terms of your choice.
