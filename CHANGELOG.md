# Changelog

## [Unreleased]

### Security

- **Ethereum**: upgraded Lighthouse `8.1.3` → `8.2.1` in both the Geth + Lighthouse and Reth + Lighthouse configurations. These are high-priority upstream releases addressing several security vulnerabilities (`8.2.0` included a fork-choice fix; `8.2.1` adds further security fixes); beacon-node operators should upgrade promptly. Upgrading requires deploying a node with the new configuration.
- **Ethereum**: upgraded Nethermind `1.38.1` → `1.39.2` in the Nethermind + Teku configuration. `1.39.2` ships Microsoft's July 2026 .NET servicing update (`10.0.10`), which fixes 17 CVEs, and upstream flags it **mandatory for all operators**; it also makes the `eth_getLogs` block-range limit explicit and configurable.
- **Ethereum**: upgraded Teku `26.6.1` → `26.7.1` (Besu + Teku and Nethermind + Teku configurations). `26.7.1` is a strongly-recommended release containing security fixes.

### Changed

- **Ethereum**: bumped client versions — Geth `1.17.3` → `1.17.4`, Erigon `3.4.3` → `3.5.3`, Prysm `7.1.5` → `7.1.7`, and Besu `26.6.1` → `26.7.0`. Configuration file names and matching `samples/` were updated accordingly. (Nethermind and Teku are covered under Security above.)
- **Ethereum**: upgraded the Reth archive configuration to Reth `1.10.2` → `2.4.1` and Lighthouse `8.1.3` → `8.2.1` (`reth-2.4.1-lighthouse-8.2.1-archive.yml`). Reth 2.x makes **Storage V2** the default; there is no in-place upgrade for an existing Reth v1 datadir, so upgrading requires deploying a new node and resyncing (consistent with the blueprint's replace-the-instance upgrade model). Reth 2.2 also enables Discv5 discovery by default. No blueprint CLI flags changed.
- **Solana**: Agave `4.1.0-rc.1` → `4.1.2` (prerelease replaced with the stable `4.1.x` line); Frankendancer `0.912.40003` → `0.1006.40100`. The Agave `3.1.14` and `4.0.3` (default) configurations are already current and unchanged.
- **BNB Chain**: BSC Reth `v0.0.10-beta` → `v0.1.1`. `v0.1.1` is a **mandatory** upgrade for the BSC mainnet Pasteur hardfork (activates 2026-08-25); nodes still on an older binary at activation will fork off the canonical chain. `v0.1.1` also **renamed the `--maxpeers` CLI flag to `--max-peers`**, so the `bsc-reth` run command was updated to match (the old flag now aborts startup with `INVALIDARGUMENT`). BSC Geth `v1.7.3` (default) is already current and unchanged.
- **Base**: base/node `v1.1.1` → `v1.2.0` (`base-reth-v1.2.0-full.yml`, via `base_node_tag`). `v1.2.0` is a required Base upgrade that moves base-reth-node to **Storage V2**; new deployments download a V2 snapshot automatically, and because the Base blueprint uses ephemeral instance-store every deploy is a fresh sync.
- **Bitcoin**: Bitcoin Core `v31.0` → `v31.1`.

### Fixed

- **BNB Chain**: the `bsc-reth` config script sourced the Rust environment via `"$HOME/.cargo/env"`, but cloud-init runs user-data as `root` with `HOME` unset, so it resolved to `/.cargo/env` and aborted the build (`No such file or directory`) before `reth-bsc` could compile. The script now pins `HOME` (`export HOME="${HOME:-/root}"`) before installing the Rust toolchain. Without this, the BSC Reth node never builds.
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
