# Project Structure

## Root Directory Layout
```
├── lib/                    # Core CDK constructs and blueprints
│   ├── interfaces/         # TypeScript interfaces and enums
│   ├── common/            # Shared utilities and constructs
│   ├── core/              # Core CDK constructs
│   └── stacks/            # CDK stack definitions
├── old-lib/               # Legacy blueprint implementations (reference)
├── test/                  # Unit tests
├── docs/                  # General documentation
├── website/               # Docusaurus documentation site
└── scripts/               # Build and utility scripts
```

## Key Directories

### `/lib` - New Universal Architecture
- **interfaces/**: TypeScript type definitions, enums, and configuration interfaces
- **common/**: Shared utilities and helper constructs
- **core/**: Core CDK constructs for blockchain infrastructure
- **stacks/**: CDK stack implementations

### `/old-lib` - Legacy Blueprints (Reference Only)
Contains protocol-specific implementations organized by blockchain:
- `ethereum/`, `solana/`, `bsc/`, `stacks/`, etc.
- Each contains: `lib/`, `test/`, `sample-configs/`, `doc/`

### `/test` - Testing Structure
- `unit/`: Unit tests mirroring the `/lib` structure
- `jest.d.ts`: Jest type definitions

## File Naming Conventions
- **Stacks**: `*-stack.ts` (e.g., `single-node-stack.ts`)
- **Constructs**: `*-construct.ts` or descriptive names
- **Interfaces**: `*.interface.ts` or `*-config.ts`
- **Tests**: `*.test.ts`
- **Config files**: `.env`, `cdk.json`, `tsconfig.json`

## Configuration Patterns
- Environment variables in `.env` files
- CDK context in `cdk.json`
- Sample configurations in `sample-configs/` directories
- Deployment configurations as JSON files
- Names of configuration variables set in .env files should remain the same in all configuraiton handling logic of the CDK as well as be the same in the .sh files

## Documentation Structure
- Each blueprint has its own `README.md`
- Architecture diagrams in `doc/assets/`
- General docs in `/docs`
- Website content in `/website/docs`

## Import Patterns
```typescript
// AWS CDK imports
import * as cdk from "aws-cdk-lib";
import * as ec2 from "aws-cdk-lib/aws-ec2";

// Local interfaces
import * as configTypes from "./config/node-config.interface";

// Constructs
import { SingleNodeConstruct } from "../../constructs/single-node";
```

## Dependencies
- It is not allowed to install new dependencies in package.json file or create new package.json file
- If it is absolutely required to add new dependency, provide detailed justification and explicitly ask for approval
