# Documentation Consistency Guidelines

## Overview

When making changes to the Universal Blockchain Node Runner project, always ensure documentation remains consistent and up-to-date. This is critical for GenAI tools and users to have accurate information.

## When to Update Documentation

Add a `CHANGELOG.md` entry for any user-facing or breaking change.

Update relevant documentation files in `docs/` whenever you change:

### 1. File Naming Conventions

**If you change**:
- Configuration script naming (e.g., adding/removing version numbers)
- Sample .env file naming patterns
- Protocol directory structure
- Any file naming patterns

**Update these files**:
- `docs/ageai-add-protocol-prompt.md` - File naming conventions section
- `docs/configuration-reference.md` - If affects configuration files
- `.kiro/specs/universal-blockchain-node-runner/design.md` - Examples and patterns
- Protocol READMEs - If affects protocol-specific files

**Example**: When we changed configuration scripts to include versions (`dummy-1.0.0-rpc-base.sh`), we updated all documentation examples and the dummy protocol implementation.

### 2. Folder Structure

**If you change**:
- Protocol directory structure
- Addition/removal of directories (configurations/, monitoring/, etc.)
- Location of any files

**Update these files**:
- `docs/ageai-add-protocol-prompt.md` - Directory structure diagrams
- `.kiro/specs/universal-blockchain-node-runner/design.md` - Architecture diagrams
- `.kiro/steering/structure.md` - Project structure documentation
- `README.md` - Directory structure section

### 3. Systemd Service Naming

**If you change**:
- Service name (currently standardized as "node")
- Service file location
- Service management patterns

**Update these files**:
- `docs/troubleshooting.md` - All systemctl and journalctl commands
- `docs/deployment-guide.md` - Service status checks
- `docs/ageai-add-protocol-prompt.md` - Service creation examples
- `docs/ageai-deploy-prompt.md` - Monitoring guidance
- Protocol configuration scripts - Service creation

**Critical**: Service name "node" is standardized across all protocols for GenAI consistency. Any change requires extensive documentation updates.

### 4. Log File Naming and Locations

**If you change**:
- CloudWatch log group names
- Log file paths
- Log collection configuration

**Update these files**:
- `docs/troubleshooting.md` - CloudWatch log groups table and viewing commands
- `docs/deployment-guide.md` - Log viewing guidance
- `docs/ageai-deploy-prompt.md` - Monitoring instructions
- `assets/common/cw-agent.json` - CloudWatch agent configuration

**Example**: When we changed from multiple log groups to just cloud-init-output, we updated all log viewing commands across documentation.

### 5. Configuration Parameters

**If you change**:
- Environment variables in .env files
- Parameters in package.json `"aws-blockchain-node-runner"` field
- Variable naming conventions
- Required vs optional parameters

**Update these files**:
- `docs/configuration-reference.md` - Complete variable documentation
- `docs/ageai-add-protocol-prompt.md` - package.json `"aws-blockchain-node-runner"` field descriptions
- `.kiro/specs/universal-blockchain-node-runner/design.md` - Interface definitions and examples
- Protocol samples - All .env files

**Critical**: Variable names must remain consistent across .env files, CDK code, and shell scripts.

### 6. Deployment Process

**If you change**:
- CDK deployment commands
- Bootstrap requirements
- Deployment output handling
- Stack creation/destruction process

**Update these files**:
- `docs/deployment-guide.md` - All deployment procedures
- `docs/ageai-deploy-prompt.md` - Deployment workflow
- `docs/troubleshooting.md` - Deployment-related troubleshooting
- `README.md` - Quick start guide
- Protocol READMEs - Deployment instructions

**Example**: When we standardized on `npx cdk deploy --json --outputs-file deploy-output.json`, we updated all documentation files.

### 7. Monitoring and Metrics

**If you change**:
- CloudWatch metrics naming (c1_, c2_ prefixes)
- Metrics namespace (CWAgent)
- Dashboard templates
- Monitoring procedures

**Update these files**:
- `docs/ageai-add-protocol-prompt.md` - Custom metrics section
- `docs/ageai-deploy-prompt.md` - Monitoring guidance
- `docs/troubleshooting.md` - Metrics-related troubleshooting
- `.kiro/specs/universal-blockchain-node-runner/design.md` - Metrics convention documentation

**Critical**: Metrics naming convention (CWAgent namespace, c1_/c2_ prefixes) is standardized for dashboard compatibility.

### 8. Troubleshooting Procedures

**If you change**:
- Diagnostic commands
- Common issues and solutions
- Error messages
- Troubleshooting workflows

**Update these files**:
- `docs/troubleshooting.md` - Primary troubleshooting documentation
- `docs/ageai-deploy-prompt.md` - Reference to troubleshooting
- Protocol READMEs - Protocol-specific troubleshooting
- `docs/deployment-guide.md` - Quick checks section

**Important**: Don't duplicate troubleshooting content. Keep detailed troubleshooting in `docs/troubleshooting.md` and reference it from other docs.

## Documentation Consistency Checklist

Before committing changes, verify:

- [ ] All affected documentation files updated
- [ ] Examples match actual implementation
- [ ] Commands are correct and tested
- [ ] File paths and names are accurate
- [ ] No contradictions between documents
- [ ] GenAI workflow documents reflect changes
- [ ] Protocol samples follow new patterns
- [ ] Tests updated to match changes

## Key Documentation Files

### Primary Documentation (docs/)

- **ageai-add-protocol-prompt.md** - GenAI protocol addition workflow
- **ageai-deploy-prompt.md** - GenAI deployment assistance workflow
- **configuration-reference.md** - Complete environment variable reference
- **deployment-guide.md** - Deployment best practices
- **troubleshooting.md** - Common issues and solutions
- **testing.md** - How to run tests

### Specification Files (.kiro/specs/)

- **requirements.md** - System requirements
- **design.md** - Architecture and design decisions
- **tasks.md** - Implementation tasks

### Steering Files (.kiro/steering/)

- **structure.md** - Project structure
- **tech.md** - Technology stack
- **testing-patterns.md** - Testing best practices
- **documentation-consistency.md** - This file
- **ci-workflows.md** - CI workflow and security-scanning conventions
- **shell-scripts.md** - Shell script (provisioning) conventions
- **git-workflow.md** - Branch model, commit conventions, and release strategy

### Protocol Files (blueprints/)

- **{protocol}/README.md** - Protocol-specific documentation
- **{protocol}/package.json** - Protocol configuration (in `"aws-blockchain-node-runner"` field)
- **{protocol}/samples/** - Sample .env files

## Common Pitfalls to Avoid

### 1. Updating Code Without Documentation

❌ **Wrong**: Change configuration script naming, forget to update docs
✅ **Right**: Change naming, update all docs that reference it

### 2. Inconsistent Examples

❌ **Wrong**: Documentation shows old command format
✅ **Right**: All examples match current implementation

### 3. Duplicate Information

❌ **Wrong**: Copy troubleshooting steps to multiple docs
✅ **Right**: Keep in troubleshooting.md, reference from others

### 4. Outdated Commands

❌ **Wrong**: Documentation shows `cdk deploy` instead of `npx cdk deploy`
✅ **Right**: All commands match current best practices

### 5. Missing Context for GenAI

❌ **Wrong**: Remove information GenAI needs from docs
✅ **Right**: Ensure GenAI workflow docs reference all necessary files

## Verification Process

After making changes:

1. **Search for affected patterns**:
   ```bash
   # Example: If changing service name
   grep -r "systemctl.*myservice" docs/
   grep -r "journalctl.*myservice" docs/
   ```

2. **Review all documentation files** in `docs/`

3. **Check protocol samples** match new patterns

4. **Verify GenAI workflow docs** reference correct files

5. **Run tests** to ensure implementation matches documentation

6. **Test actual deployment** if deployment process changed

## Maintaining Single Source of Truth

### Principle

Each piece of information should exist in ONE authoritative location, with other documents referencing it.

### Examples

**Configuration Variables**:
- **Source of Truth**: `docs/configuration-reference.md`
- **References**: Other docs link to configuration-reference.md

**Troubleshooting**:
- **Source of Truth**: `docs/troubleshooting.md`
- **References**: Other docs say "See docs/troubleshooting.md"

**Protocol Examples**:
- **Source of Truth**: `blueprints/dummy/`
- **References**: Docs say "See blueprints/dummy/ for example"

**Architecture**:
- **Source of Truth**: `.kiro/specs/universal-blockchain-node-runner/design.md`
- **References**: Docs link to design document

## When in Doubt

If unsure whether to update documentation:

1. **Ask**: "Would this change confuse a user or GenAI tool?"
2. **Check**: Search for references to what you changed
3. **Update**: Better to update too much than too little
4. **Test**: Verify documentation matches implementation

## Summary

Documentation consistency is critical for:
- ✅ User success
- ✅ GenAI accuracy
- ✅ Project maintainability
- ✅ Community contributions

Always update documentation when making changes to conventions, patterns, or processes.
