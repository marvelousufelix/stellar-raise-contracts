# Security Compliance Reporting

## Overview

The `security_compliance_reporting` script automates security compliance checks
for the Stellar Raise crowdfund project as part of the CI/CD pipeline. It runs
five sequential checks and produces a structured JSON report alongside a
human-readable summary.

---

## Files

| File | Purpose |
|---|---|
| `.github/scripts/security_compliance_reporting.sh` | Main compliance script |
| `.github/scripts/security_compliance_reporting.test.sh` | Test suite |
| `docs/security_compliance_reporting.md` | This document |

---

## Checks Performed

| # | Check | Tool | Failure Mode |
|---|---|---|---|
| 1 | Rust dependency audit | `cargo audit` | CRITICAL — blocks build |
| 2 | NPM dependency audit | `npm audit --audit-level=high` | CRITICAL — blocks build |
| 3 | Clippy lint gate | `cargo clippy -- -D warnings` | CRITICAL — blocks build |
| 4 | Secret / credential scan | `grep` heuristics | CRITICAL — blocks build |
| 5 | WASM binary size | `wc -c` vs 256 KB cap | CRITICAL — blocks build |

Non-critical failures (e.g. missing tools, skipped checks) are recorded as
`WARN` and do not block the build.

---

## Usage

```bash
# Run with defaults
bash .github/scripts/security_compliance_reporting.sh

# Override output directory and WASM path
REPORT_OUTPUT_DIR=./reports WASM_PATH=./target/crowdfund.wasm \
  bash .github/scripts/security_compliance_reporting.sh

# Skip audits in offline CI
SKIP_CARGO_AUDIT=1 SKIP_NPM_AUDIT=1 \
  bash .github/scripts/security_compliance_reporting.sh
```

---

## Environment Variables

| Variable | Default | Description |
|---|---|---|
| `REPORT_OUTPUT_DIR` | `./security-reports` | Directory for report files |
| `WASM_PATH` | `target/wasm32-unknown-unknown/release/crowdfund.wasm` | Path to compiled WASM binary |
| `WASM_SIZE_LIMIT_KB` | `256` | Maximum allowed WASM size in KB |
| `SKIP_CARGO_AUDIT` | `0` | Set to `1` to skip `cargo audit` (e.g. offline CI) |
| `SKIP_NPM_AUDIT` | `0` | Set to `1` to skip `npm audit` |
| `CI` | _(unset)_ | Set by GitHub Actions; disables colour output |

---

## Report Output

The script writes two files to `REPORT_OUTPUT_DIR`:

- `compliance_report_<timestamp>.json` — machine-readable JSON with all check results
- `compliance_summary.txt` — human-readable summary

### JSON Report Structure

```json
{
  "report_timestamp": "2026-01-01T00:00:00Z",
  "pass_count": 4,
  "warn_count": 1,
  "critical_failures": 0,
  "overall_status": "PASS",
  "checks": [
    { "check": "cargo_audit", "status": "PASS", "detail": "no vulnerabilities", "timestamp": "..." },
    { "check": "npm_audit",   "status": "PASS", "detail": "no high/critical vulnerabilities", "timestamp": "..." },
    { "check": "clippy",      "status": "PASS", "detail": "no warnings", "timestamp": "..." },
    { "check": "secret_scan", "status": "PASS", "detail": "no hardcoded secrets", "timestamp": "..." },
    { "check": "wasm_size",   "status": "SKIPPED", "detail": "binary not found", "timestamp": "..." }
  ]
}
```

---

## CI Integration

The script is called from `.github/workflows/rust_ci.yml`:

```yaml
- name: Security compliance report
  run: bash .github/scripts/security_compliance_reporting.sh
```

The workflow step fails (exit code 1) when any CRITICAL check fails.

---

## Security Assumptions

1. `set -euo pipefail` ensures the script exits immediately on any unhandled error.
2. An `EXIT` trap removes all temporary files, preventing credential leakage via temp files.
3. No user-supplied input is passed to `eval` or unquoted shell expansions.
4. Secret scan patterns use `grep -E` with explicit patterns — no dynamic pattern construction.
5. The WASM size cap (256 KB) is a hard limit; exceeding it fails the build to prevent
   accidental deployment of bloated or tampered binaries.
6. `--audit-level=high` for npm audit means only high/critical vulnerabilities block the build,
   reducing noise from low-severity advisories.

---

## Test Coverage

Run the test suite with:

```bash
bash .github/scripts/security_compliance_reporting.test.sh
```

Expected: all tests pass, exit code 0.

Test categories:
- Subject script structure: `set -euo pipefail`, EXIT trap, no `eval`
- `append_result`: JSON field format, quote escaping
- WASM size check: pass (under limit), fail (over limit), missing binary
- Secret scan: Stellar key pattern detection, no false positive for short strings, PRIVATE_KEY pattern
- Counter logic: increment, overall PASS/FAIL status derivation
- Environment variable defaults: all five variables
- Integration dry-run: skipped audits, missing WASM, report header present
