# Changelog

## [Unreleased]

### Security

- **Ethereum**: upgraded Lighthouse `8.1.3` → `8.2.0` in the Geth + Lighthouse configuration. This is a high-priority upstream release that addresses several security vulnerabilities (including a fork-choice fix); beacon-node operators should upgrade promptly. Upgrading requires deploying a node with the new configuration.

### Changed

- **Ethereum**: bumped client versions — Geth `1.17.3` → `1.17.4`, Erigon `3.4.3` → `3.5.0`, Nethermind `1.38.1` → `1.39.0`, Prysm `7.1.5` → `7.1.6`, Teku `26.6.1` → `26.7.0`. Configuration file names and matching `samples/` were updated accordingly.
- **Ethereum**: upgraded the Reth archive configuration to Reth `1.10.2` → `2.3.0` and Lighthouse `8.1.3` → `8.2.0` (`reth-2.3.0-lighthouse-8.2.0-archive.yml`). Reth 2.x makes **Storage V2** the default; there is no in-place upgrade for an existing Reth v1 datadir, so upgrading requires deploying a new node and resyncing (consistent with the blueprint's replace-the-instance upgrade model). Reth 2.2 also enables Discv5 discovery by default. No blueprint CLI flags changed.
- **Solana**: Agave `4.1.0-rc.1` → `4.1.1` (release candidate replaced with the stable release on the same line); Frankendancer `0.912.40003` → `0.1005.40100`.
- **BNB Chain**: BSC Reth `v0.0.10-beta` → `v0.1.0-fix`.
- **Bitcoin**: Bitcoin Core `v31.0` → `v31.1`.

### Fixed

- **Ethereum**: replaced the `beaconstate.info` checkpoint-sync endpoints, which no longer resolve, across the README, sample `.env` files, and the blueprint's default (`package.json`). Mainnet now defaults to `https://beaconstate.ethstaker.cc` and Sepolia to `https://checkpoint-sync.sepolia.ethpandaops.io`. Without this, consensus clients crash-loop on startup ("Failed to start beacon node") because they cannot reach the checkpoint endpoint.

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
