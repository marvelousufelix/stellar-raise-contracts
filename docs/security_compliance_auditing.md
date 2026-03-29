# security_compliance_auditing

Automated CI/CD security compliance auditing for the Stellar Raise crowdfunding contract.

## Overview

`security_compliance_auditing.sh` runs a structured, multi-phase audit of the contract repository.
It is designed to run in CI/CD pipelines (GitHub Actions) and locally before opening a pull request.

## Audit Phases

| Phase | Name | What it checks |
|-------|------|----------------|
| 1 | Tool Presence | `cargo`, `wasm-opt`, `cargo-audit` are installed |
| 2 | Dependency Vulnerability Audit | `cargo audit` — known CVEs in Rust dependencies |
| 3 | Static Analysis | `cargo clippy --all-targets -- -D warnings` |
| 4 | WASM Binary Size | Optimised binary ≤ 256 KB (Stellar's limit) |
| 5 | Security Pattern Checks | `require_auth`, no `.unwrap()`, checked arithmetic, reentrancy guard |
| 6 | Test Suite | `cargo test --workspace` passes |
| 7 | Code Formatting | `cargo fmt --all -- --check` |

## Exit Codes

| Code | Meaning |
|------|---------|
| `0` | All audit checks passed |
| `1` | One or more audit checks failed |
| `2` | Required tooling is missing |

## Usage

```bash
# Basic run
./scripts/security_compliance_auditing.sh

# Verbose output
./scripts/security_compliance_auditing.sh --verbose

# Write JSON report to custom directory
./scripts/security_compliance_auditing.sh --json --report-dir ci-reports

# Help
./scripts/security_compliance_auditing.sh --help
```

## Security Assumptions

1. **Read-only** — The script never writes to source files or contract storage.
2. **Permissionless** — No privileged credentials are required to run the audit.
3. **Deterministic** — The same repository state always produces the same result.
4. **Bounded** — No unbounded loops; all iterations are over fixed-size sets.

## Dependency Allowlist

To suppress a known false-positive advisory, add its ID to `.security-allowlist`:

```
# RUSTSEC-2023-0001 — safe to ignore because <reason>
RUSTSEC-2023-0001
```

Lines beginning with `#` and blank lines are ignored.

## JSON Report Format

When `--json` is passed, a report is written to `audit-reports/audit-<timestamp>.json`:

```json
{
  "script": "security_compliance_auditing",
  "version": "1.0.0",
  "timestamp": "2026-03-29T05:46:48Z",
  "status": "PASS",
  "summary": {
    "total": 7,
    "passed": 7,
    "failed": 0,
    "warnings": 0
  }
}
```

## CI Integration

Add to `.github/workflows/security.yml`:

```yaml
- name: Make auditing script executable
  run: chmod +x scripts/security_compliance_auditing.sh

- name: Run security compliance audit
  run: ./scripts/security_compliance_auditing.sh --json --report-dir ci-reports

- name: Upload audit report
  if: always()
  uses: actions/upload-artifact@v4
  with:
    name: audit-report
    path: ci-reports/
```

## Running Tests

```bash
chmod +x scripts/security_compliance_auditing.test.sh
./scripts/security_compliance_auditing.test.sh
# or with verbose output:
./scripts/security_compliance_auditing.test.sh --verbose
```

Test coverage target: ≥ 95 % of all auditable code paths.
