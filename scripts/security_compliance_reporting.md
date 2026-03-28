# Security Compliance Reporting for CI/CD

## Overview

`security_compliance_reporting.sh` aggregates results from all security
compliance checks and produces structured reports (text and JSON) for CI/CD
pipelines and auditors. It acts as the top-level orchestrator, delegating to:

- `security_compliance_automation.sh` — code-level security patterns
- `security_compliance_documentation.sh` — documentation completeness

## Security Assumptions

| # | Assumption | Detail |
|---|-----------|--------|
| 1 | **Read-only** | No writes to storage or state files. |
| 2 | **Permissionless** | No privileged access required. |
| 3 | **Deterministic** | Same input always produces the same output. |
| 4 | **Bounded execution** | No unbounded loops. |
| 5 | **No side effects** | Does not modify source or configuration files. |

## Report Sections

| Section | Description | Failure condition |
|---------|-------------|-------------------|
| `metadata` | Timestamp, git SHA, branch, project root | Never fails |
| `automation` | Runs `security_compliance_automation.sh --full-audit` | Non-zero exit from companion script |
| `documentation` | Runs `security_compliance_documentation.sh --full-audit` | Non-zero exit from companion script |
| `rust` | `cargo fmt`, `cargo clippy`, `cargo test` | Any step fails |
| `dependencies` | `npm audit`, `cargo audit` | Vulnerabilities found |

Sections are skipped (not failed) when required tools or files are absent.

## Usage

```bash
# Full report (all sections)
./scripts/security_compliance_reporting.sh --full-report

# Single section
./scripts/security_compliance_reporting.sh --report-only metadata
./scripts/security_compliance_reporting.sh --report-only automation
./scripts/security_compliance_reporting.sh --report-only documentation
./scripts/security_compliance_reporting.sh --report-only rust
./scripts/security_compliance_reporting.sh --report-only dependencies

# JSON output to stdout
./scripts/security_compliance_reporting.sh --full-report --json

# JSON output to file
./scripts/security_compliance_reporting.sh --full-report --output-file report.json

# Verbose (includes companion script output)
./scripts/security_compliance_reporting.sh --full-report --verbose
```

## Exit Codes

| Code | Meaning |
|------|---------|
| `0` | All sections passed or skipped |
| `1` | One or more sections failed |

## JSON Report Format

```json
{
  "report": "security_compliance_reporting",
  "version": "1.0.0",
  "timestamp": "2026-03-28T13:00:00Z",
  "git_sha": "abc1234",
  "branch": "main",
  "overall": "PASS",
  "total_sections": 5,
  "passed": 5,
  "failed": 0,
  "sections": [
    { "name": "automation_checks", "status": "PASS" },
    { "name": "documentation_checks", "status": "PASS" },
    { "name": "rust_fmt", "status": "PASS" },
    { "name": "rust_clippy", "status": "PASS" },
    { "name": "rust_tests", "status": "PASS" }
  ]
}
```

## CI/CD Integration

```yaml
- name: Security compliance report
  run: ./scripts/security_compliance_reporting.sh --full-report --output-file compliance-report.json

- name: Upload compliance report
  uses: actions/upload-artifact@v4
  with:
    name: compliance-report
    path: compliance-report.json
```

## Test Suite

```bash
bash scripts/security_compliance_reporting.test.sh
bash scripts/security_compliance_reporting.test.sh --verbose
```

- 44 assertions, 100% estimated coverage
- Covers all 5 report sections, JSON output, file output, verbose mode, and all CLI flags

## Relationship to Other Scripts

| Script | Role |
|--------|------|
| `security_compliance_automation.sh` | Code-level checks (secrets, crypto, patterns) |
| `security_compliance_documentation.sh` | Documentation completeness checks |
| `security_compliance_reporting.sh` | Orchestrator — runs both and produces unified report |
