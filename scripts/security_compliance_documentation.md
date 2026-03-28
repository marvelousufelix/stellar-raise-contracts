# Security Compliance Documentation for CI/CD

## Overview

`security_compliance_documentation.sh` validates documentation completeness and
security compliance for CI/CD pipelines in Stellar/Soroban smart contract projects.
It is a companion to `security_compliance_automation.sh`, focusing specifically on
documentation quality rather than code-level security patterns.

## Security Assumptions

| # | Assumption | Detail |
|---|-----------|--------|
| 1 | **Read-only** | No writes to storage or state files. Safe to run in any CI context. |
| 2 | **Permissionless** | No privileged access required. |
| 3 | **Deterministic** | Same input always produces the same output. |
| 4 | **Bounded execution** | No unbounded loops. Completes in predictable time. |
| 5 | **No side effects** | Does not modify source or configuration files. |

## Constants

| Constant | Value | Description |
|----------|-------|-------------|
| `MIN_COVERAGE_PERCENT` | 95 | Minimum required test coverage |
| `REQUIRED_DOCS` | See below | Top-level documentation files that must exist |
| `REQUIRED_README_SECTIONS` | See below | Sections required in README.md |
| `REQUIRED_WORKFLOWS` | `.github/workflows/rust_ci.yml` | CI workflow files that must exist |

### Required Documentation Files

- `README.md`
- `CHANGELOG.md`
- `CONTRIBUTING.md`
- `SECURITY.md`
- `LICENSE`

### Required README.md Sections

- `## Overview`
- `## Prerequisites`
- `## Getting Started`
- `## Contract Interface`
- `## Deployment`
- `## Troubleshooting`

## Usage

```bash
# Full documentation audit
./scripts/security_compliance_documentation.sh --full-audit

# Verbose output
./scripts/security_compliance_documentation.sh --full-audit --verbose

# Run a single check
./scripts/security_compliance_documentation.sh --check-only required_docs

# Specify project root explicitly
./scripts/security_compliance_documentation.sh --full-audit --project-root /path/to/project

# Print version
./scripts/security_compliance_documentation.sh --version
```

## Available Checks

| Check name | Description | Failure condition |
|-----------|-------------|-------------------|
| `required_docs` | All required documentation files exist | Any file missing |
| `readme_sections` | README.md contains all required sections | Any section missing |
| `changelog_format` | CHANGELOG.md has versioned entries | File missing (warn if no versions) |
| `security_policy` | SECURITY.md exists with disclosure instructions | File missing (warn if no keywords) |
| `ci_workflow_docs` | CI workflow files exist with required job steps | Workflow file missing |
| `natspec_comments` | Shell scripts have NatSpec-style comments | Any script missing `@title`/`@notice`/`@param` |
| `docs_directory` | `docs/` directory exists and contains `.md` files | Directory missing |

## Exit Codes

| Code | Meaning |
|------|---------|
| `0` | All checks passed (warnings may be present) |
| `1` | One or more checks failed |

## CI/CD Integration

Add to `.github/workflows/rust_ci.yml`:

```yaml
- name: Documentation compliance check
  run: ./scripts/security_compliance_documentation.sh --full-audit
```

## NatSpec Comment Format

Shell scripts in `scripts/` must include NatSpec-style annotations:

```bash
# @title   MyScript — Short title
# @notice  What this script does (user-facing description).
# @dev     Implementation notes for developers.
# @param   $1  Description of first argument
```

## Test Suite

Run the test suite with:

```bash
bash scripts/security_compliance_documentation.test.sh
bash scripts/security_compliance_documentation.test.sh --verbose
```

The test suite covers:
- All 7 check functions (happy path + failure + edge cases)
- Full audit (compliant and non-compliant projects)
- CLI flags (`--version`, `--help`, `--check-only` with unknown check)
- 49 assertions, ≥ 95% coverage

## Relationship to Other Scripts

| Script | Focus |
|--------|-------|
| `security_compliance_automation.sh` | Code-level security patterns, crypto, secrets, coverage |
| `security_compliance_documentation.sh` | Documentation completeness and CI/CD workflow validation |

Both scripts are designed to be run together in CI for full compliance coverage.
