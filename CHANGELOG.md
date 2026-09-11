# Changelog

## [Unreleased]

### Security

- **Ethereum**: upgraded Lighthouse `8.1.3` → `8.2.1` in both the Geth + Lighthouse and Reth + Lighthouse configurations. These are high-priority upstream releases addressing several security vulnerabilities (`8.2.0` included a fork-choice fix; `8.2.1` adds further security fixes); beacon-node operators should upgrade promptly. Upgrading requires deploying a node with the new configuration.
- **Ethereum**: upgraded Nethermind `1.38.1` → `1.39.2` in the Nethermind + Teku configuration. `1.39.2` ships Microsoft's July 2026 .NET servicing update (`10.0.10`), which fixes 17 CVEs, and upstream flags it **mandatory for all operators**; it also makes the `eth_getLogs` block-range limit explicit and configurable.
- **Ethereum**: upgraded Teku `26.6.1` → `26.7.1` (Besu + Teku and Nethermind + Teku configurations). `26.7.1` is a strongly-recommended release containing security fixes.
- **Docs website**: acknowledged and are tracking (no fix applied yet) 22 transitive `npm audit` advisories that all originate from `@docusaurus/core@3.10.2` in `website/`. They collapse to 5 underlying advisories: 17 "high" from `image-size@2.0.2` (CVE-2025-71319 / 71329 / 71330 — infinite-loop DoS in the ICNS/JXL/HEIF parsers, reached only at **build time** via `@docusaurus/mdx-loader`), and 5 "moderate" from the **dev-server-only** chain (`webpack-dev-server` → `express`/`qs` and `sockjs`/`uuid`, loaded only by `docusaurus start`). None reach the published static site or the deployed node infrastructure — the root CDK app reports **0** advisories, and these pre-date and are unrelated to the React bump below. `image-size` is effectively unmaintained (issues disabled upstream) with no published patch, so `npm audit fix` resolves none of them and `--force` would break the Docusaurus build. **Decision:** accept the low real-world risk and wait for an upstream `@docusaurus/core` release that swaps or patches `image-size`, rather than adopting an unofficial fork. Re-run `npm audit` in `website/` when bumping Docusaurus.

### Changed

- **Tooling / dependencies**: bumped in-range (non-breaking) dependency versions, verified with a full build + test run in both projects. Root CDK app: `aws-cdk` `2.1137.0` → `2.1141.0` and `aws-cdk-lib` `2.265.0` → `2.269.0` (kept version-coupled), `@types/node` `24.13.2` → `24.13.4`, `jest` `30.4.2` → `30.5.1`, `ts-jest` `29.4.11` → `29.4.12`. Docs website: `react` / `react-dom` `19.2.8` → `19.3.0`, `react-cookie-consent` → `10.0.2`. `cdk-nag` 3.x and TypeScript 7.x were intentionally deferred as breaking major upgrades that need dedicated migrations (cdk-nag v3 moves from an `IAspect` to CDK's `IPolicyValidationPlugin`; TS 7 requires a ts-jest bump and a `tsconfig` `moduleResolution` migration).
- **Solana**: upgraded the default Agave configuration `4.0.3` → `4.2.1` (`agave-4.2.1-rpc-base.sh`, `agave-4.2.1-rpc-extended.sh`), the current stable `4.2.x` mainnet-beta line ([anza-xyz/agave `v4.2.1`](https://github.com/anza-xyz/agave/releases/tag/v4.2.1), a non-prerelease suitable for Testnet, Devnet, and Mainnet Beta). The default `defaultConfiguration` and all Agave `samples/` (mainnet-beta base/extended/HA, testnet, and devnet) now point to `4.2.1`; the `3.1.14`, `4.0.3`, and `4.1.2` configurations are retained for pinning. Agave binaries are built from source at the tag parsed from the configuration file name. **Agave 4.2 added two runtime requirements that 4.0.x/4.1.x did not have, both handled in the 4.2.1 config:** (1) the minimum validator dynamic-port-range width increased, so `--dynamic-port-range` was widened `8004-8029` → `8004-8040` (still within the `8001-8040` security-group range and matching Frankendancer) — 4.2 otherwise aborts with "Port range is too small"; and (2) `agave-validator` now requires `CAP_NET_ADMIN` and `CAP_NET_RAW`, granted to the non-root `bcuser` systemd service via `AmbientCapabilities`/`CapabilityBoundingSet` in `node.sh` — without them 4.2 aborts on missing capabilities. Requires a fresh deploy per the replace-the-instance upgrade model (the instance re-syncs from a snapshot).
- **BNB Chain**: bumped BSC Geth `v1.7.3` → `v1.7.7` for the BSC mainnet **Pasteur hardfork** (activates 2026-08-25 02:30 UTC; mandatory for all mainnet nodes before then). No blueprint CLI-flag changes are needed: the flags removed/deprecated in the Pasteur line (`--multidatabase`, `--fake-beacon*`) and the load-breaking `[Eth] EnableBAL` config.toml field are not used by the blueprint, and `config.toml` is fetched fresh from the release. Requires a fresh deploy per the replace-the-instance upgrade model.
- **Ethereum**: bumped Besu `26.7.0` → `26.7.1` (security release closing unbounded-memory-growth paths in JSON-RPC filters/subscriptions; the new `--rpc-max-active-filters`, `--rpc-filter-timeout-seconds`, and `--rpc-ws-max-active-subscriptions` options ship as defaults only and are not set by the blueprint, so no flag changes) and Geth `1.17.4` → `1.17.5` (maintenance release; Pebble v2 is used only for from-scratch datadirs and falls back to Pebble v1 for a pre-existing database, so there is no forced migration — `--db.engine=pebble` is unchanged; note the upstream default GOGC change 20 → 50 raises the memory peak). Configuration file names and matching `samples/` were updated accordingly.
- **Solana**: bumped Frankendancer `0.1006.40100` → `0.1105.40200` (latest Frankendancer mainnet release; updates the bundled Agave submodule to `v4.2.0` plus minor improvements and security fixes). This stays on the **Frankendancer `0.xxxx` line** — the hybrid client (Firedancer networking/block-production frontend running the Agave runtime as a subprocess) that this blueprint builds via `make fdctl solana`. The full-Firedancer `1.x` line is a separate client with a different runtime (native `diag` tile, no Agave subprocess) and is intentionally not used here. This release bumps the bundled Agave submodule to `v4.2.0`, which requires a slightly larger validator dynamic port range, so the generated `fdctl` TOML `dynamic_port_range` was widened `8004-8029` → `8004-8040` and the Solana security-group range `8001-8029` → `8001-8040` to match.
- **Ethereum**: bumped patch versions — Nethermind `1.39.2` → `1.39.3`, Erigon `3.5.3` → `3.5.4`, and Prysm `7.1.7` → `7.1.8`. All three are drop-in upgrades within the same release series with no blueprint CLI flag changes; configuration file names and matching `samples/` were updated accordingly.
- **Ethereum**: bumped client versions — Geth `1.17.3` → `1.17.4`, Erigon `3.4.3` → `3.5.3`, Prysm `7.1.5` → `7.1.7`, and Besu `26.6.1` → `26.7.0`. Configuration file names and matching `samples/` were updated accordingly. (Nethermind and Teku are covered under Security above.)
- **Ethereum**: upgraded the Reth archive configuration to Reth `1.10.2` → `2.4.1` and Lighthouse `8.1.3` → `8.2.1` (`reth-2.4.1-lighthouse-8.2.1-archive.yml`). Reth 2.x makes **Storage V2** the default; there is no in-place upgrade for an existing Reth v1 datadir, so upgrading requires deploying a new node and resyncing (consistent with the blueprint's replace-the-instance upgrade model). Reth 2.2 also enables Discv5 discovery by default. No blueprint CLI flags changed.
- **Solana**: Agave `4.1.0-rc.1` → `4.1.2` (prerelease replaced with the stable `4.1.x` line); Frankendancer `0.912.40003` → `0.1006.40100`. The Agave `3.1.14` and `4.0.3` (default) configurations are already current and unchanged.
- **BNB Chain**: BSC Reth `v0.0.10-beta` → `v0.1.1`. `v0.1.1` is a **mandatory** upgrade for the BSC mainnet Pasteur hardfork (activates 2026-08-25); nodes still on an older binary at activation will fork off the canonical chain. `v0.1.1` also **renamed the `--maxpeers` CLI flag to `--max-peers`**, so the `bsc-reth` run command was updated to match (the old flag now aborts startup with `INVALIDARGUMENT`). BSC Geth is bumped to `v1.7.7` separately for the Pasteur hardfork (see above).
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
