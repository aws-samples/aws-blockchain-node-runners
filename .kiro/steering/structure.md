# Project Structure

## Root Directory Layout
```
├── app.ts                  # CDK app entry: loads .env, picks the blueprint, builds the stack
├── cdk.json, tsconfig.json, jest.config.js, package.json
├── lib/                    # Universal CDK framework (protocol-agnostic)
│   ├── interfaces/         # TypeScript interfaces, enums, constants
│   ├── common/             # Shared constructs: single node, HA nodes, monitoring (+ dashboards)
│   ├── core/               # Configuration loader, stack factory, assets and user-data managers
│   └── stacks/             # single-node-stack.ts, ha-nodes-stack.ts
├── blueprints/             # Built-in protocol blueprints (one directory each)
│   ├── base/, bitcoin/, bnb/, ethereum/, solana/
│   └── dummy/              # Test blueprint used by CI and smoke tests
├── assets/common/          # Scripts shipped to every instance: node-setup.sh, setup-storage.sh,
│                           # snapshot-staging.sh, user-data-ubuntu.sh, network/ rules, cw-agent.json
├── test/
│   ├── unit/               # Mirrors lib/ plus assets/, blueprints/, security/
│   └── integration/        # App and per-blueprint configuration tests
├── docs/                   # Guides (deployment, configuration, troubleshooting, testing,
│                           # snapshot staging, traffic shaping), the ageai-*.md AI workflows,
│                           # and maintenance-crew.md
├── website/                # Docusaurus documentation site (own package.json)
├── .kiro/
│   ├── steering/           # Rules Kiro loads for every session (this file and siblings)
│   ├── prompts/            # @deploy, @healthcheck, @troubleshoot, @version-update, @add-protocol,
│   │                       # @setup-maintenance-crew, @maintenance-round (wrappers around docs/)
│   ├── agents/             # bnr-*.json: the maintenance crew's agent templates
│   ├── skills/             # bnr-*/SKILL.md: the maintenance crew's procedures
│   └── specs/              # Requirements / design / tasks of larger pieces of work; only the
│                           # universal-blockchain-node-runner spec is published (others gitignored)
└── .github/                # Workflows, Dependabot, Semgrep prompt-injection rules, PR template
```

There is no `old-lib/` or `scripts/` directory any more; v1 code lives on the
frozen `v1` branch.

## Key Directories

### `/lib` - Universal framework
- **interfaces/**: type definitions, enums and constants shared by every blueprint
- **common/**: `single-node-construct.ts`, `ha-nodes-construct.ts`, `monitoring-construct.ts` and the dashboard definitions
- **core/**: `configuration-loader.ts` (reads `.env` and the blueprint's `configurations/*.yml`), `stack-factory.ts`, `assets-manager.ts`, `user-data-manager.ts`
- **stacks/**: the two deployable stack shapes

### `/blueprints/<protocol>` - One blueprint per protocol
- `package.json` with the `"aws-blockchain-node-runner"` field (blueprint metadata)
- `configurations/<client>-<version>[-<client2>-<version2>]-<mode>.yml`: pinned client versions, download URLs, checksums, flags. **The file name carries the versions**; the `@version-update` workflow renames it on a bump.
- `samples/.env-<network>-<clients>-<mode>`: ready-to-copy environment files
- `user-data/*.sh`: scripts that run as root on the instance (ShellCheck-clean, LF line endings)
- `README.md` with the "Client Release Channels" table, cost estimates and sync times

### `/assets/common` - Shared instance scripts
Run as root on every deployed instance. Treat changes as high risk (see `git-workflow.md`).

### `/test`
- `unit/`: mirrors `lib/`, plus `assets/`, `blueprints/`, `security/`
- `integration/`: whole-app tests and one configuration test per blueprint

### `/.kiro` - Agent instructions
- `steering/`: always-on rules for Kiro sessions
- `prompts/`: one-line `@` wrappers; the procedure text lives in `docs/ageai-*.md`
- `agents/` and `skills/`: the maintenance crew (`docs/maintenance-crew.md`). These files are instructions an agent executes and an agent spec launches MCP servers for whoever runs it: every change gets human review, and they are covered by the Semgrep prompt-injection rules in `.github/semgrep/`.
- `specs/`: requirements, design and task lists for larger pieces of work. Only `universal-blockchain-node-runner/` is published; every other spec (the maintenance crew's included) is gitignored and lives on the maintainer's machine, so do not look for it in the repository

## File Naming Conventions
- **Stacks**: `*-stack.ts` (e.g., `single-node-stack.ts`)
- **Constructs**: `*-construct.ts`
- **Interfaces**: `*-config.ts`, `*.ts` under `lib/interfaces/`
- **Tests**: `*.test.ts`
- **Blueprint configurations**: `<client>-<version>[-<client2>-<version2>]-<mode>.yml`
- **Sample env files**: `.env-<network>-<clients>-<mode>`
- **Config files**: `.env`, `cdk.json`, `tsconfig.json`

## Configuration Patterns
- Environment variables in `.env` files (samples under each blueprint's `samples/`)
- Client configuration in the blueprint's `configurations/*.yml`, selected by `CLIENT_CONFIG` in `.env`
- CDK context in `cdk.json`
- Names of configuration variables set in `.env` files must stay identical across the CDK configuration-handling logic and the `.sh` scripts

## Documentation Structure
- Each blueprint has its own `README.md`
- General docs in `/docs`; AI workflows in `/docs/ageai-*.md` with `@` wrappers in `.kiro/prompts/`
- Website content in `/website/docs`
- `CHANGELOG.md` at the root (Keep a Changelog; `## [Unreleased]` on top)

## Import Patterns
```typescript
// AWS CDK imports
import * as cdk from "aws-cdk-lib";
import * as ec2 from "aws-cdk-lib/aws-ec2";

// Framework interfaces and constructs
import { DeploymentConfig } from "../interfaces";
import { SingleNodeConstruct } from "../common/single-node-construct";
```

## Dependencies
- It is not allowed to install new dependencies in package.json file or create new package.json file
- If it is absolutely required to add new dependency, provide detailed justification and explicitly ask for approval
