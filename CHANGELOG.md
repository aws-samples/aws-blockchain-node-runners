# Changelog

## [2.0.0] — 2026-06-22

### Breaking Changes

This is a complete architecture rewrite. **v2 is not backwards-compatible with v1.**

- Per-protocol standalone CDK apps replaced by a **single universal CDK app**
- Protocols are now **NPM packages (blueprints)** installed into `node_modules/` — not independent directory trees with their own `cdk.json`
- Deployment runs from **repo root**: `npm ci → npm run build → npx cdk deploy` (no more `cd lib/<protocol>`)
- Environment configuration via a single `.env` file at root (not per-protocol config files)

### What's New in v2

- **AI-driven workflows** — deploy, troubleshoot, update versions, run health checks, and add protocols using natural language prompts (`@deploy`, `@troubleshoot`, `@version-update`, `@healthcheck`, `@add-protocol`)
- **Pluggable blueprint system** — install community blueprints from NPM or GitHub alongside built-in ones; no distinction at runtime
- **5 production blueprints** — Ethereum, Solana (Agave + Frankendancer), Base, BNB Chain, and Bitcoin — plus a **Dummy** reference blueprint
- **Solana Frankendancer** — first-class support as a separate client alongside Agave
- **Community Blueprints catalog** — framework for external blueprint discovery, installation, and contribution
- **Documentation website** — full Docusaurus site at [aws-samples.github.io/aws-blockchain-node-runners](https://aws-samples.github.io/aws-blockchain-node-runners)
- **Ubuntu 24.04 LTS** — consistent OS across all deployments (x86_64 and ARM_64)

### Migration from v1

v1 remains available on the [`v1` branch](https://github.com/aws-samples/aws-blockchain-node-runners/tree/v1). No new features or protocol additions will be made to v1.

To migrate existing deployments, tear down v1 stacks and redeploy using v2. There is no in-place upgrade path — the CDK app structure is fundamentally different.
