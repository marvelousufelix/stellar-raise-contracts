# security_workflow_automation

## Overview

`security_workflow_automation.sh` is a single-script CI/CD security gate for the
Stellar Raise crowdfunding project.  It orchestrates eight sequential steps —
dependency auditing, secret scanning, static analysis, unsafe-code auditing,
panic-pattern auditing, test execution, coverage gating, and report generation —
and exits non-zero if any step fails.

The companion test suite (`security_workflow_automation.test.sh`) provides ≥ 95 %
function coverage across 50+ test cases organised into 12 sections.

---

## Security Assumptions

| Assumption | Enforcement |
|---|---|
| No hard-coded secrets in source | `scan_secrets` — 5 regex patterns, 4-char minimum |
| No `unsafe` blocks in production code | `audit_unsafe_code` — grep excluding `.test.rs` |
| No `panic!` / `.unwrap()` / `.expect()` in production | `audit_panic_patterns` |
| Test coverage ≥ 95 % | `check_coverage` — cargo-tarpaulin gate |
| Dependency advisories are zero | `run_dependency_audit` — cargo-audit |
| Webhook URL is never logged | `send_alert` writes only the message body |
| `REPORT_DIR` is not world-writable | Caller responsibility; checked in tests |

---

## Workflow Steps

### 1. `bootstrap`
Creates `REPORT_DIR`, truncates the log file, and verifies that `cargo` is
available.  Optional tools (`cargo-audit`, `cargo-tarpaulin`, `jq`) are warned
about but do not block execution.

### 2. `run_dependency_audit`
Runs `cargo audit --json` and writes results to `REPORT_DIR/audit.json`.
Fails the build if any unfixed advisory is found.

### 3. `scan_secrets`
Greps `contracts/**/*.rs` and `*.toml` for five patterns:

- `password = "…"` (≥ 4 chars)
- `api_key = "…"` / `api-key = "…"`
- `secret = "…"`
- `private_key = "…"` / `private-key = "…"`
- `auth_token = "…"` / `auth-token = "…"`

Test files (`.test.rs`) and comment-only lines are excluded.

### 4. `run_static_analysis`
Runs `cargo clippy` with `-D warnings` and the following additional lints:

- `clippy::integer_arithmetic`
- `clippy::unwrap_used`
- `clippy::expect_used`
- `clippy::panic`

### 5. `audit_unsafe_code`
Counts `unsafe` occurrences in production `.rs` files (excluding `.test.rs`
and comment lines).  Any non-zero count is a blocking failure.

### 6. `audit_panic_patterns`
Counts `panic!`, `.unwrap()`, and `.expect(` in production `.rs` files.
Any non-zero count is a blocking failure.

### 7. `run_tests`
Runs `cargo test --package <SECURITY_PACKAGE>` and captures output to
`REPORT_DIR/test_output.txt`.

### 8. `check_coverage`
Runs `cargo tarpaulin` and extracts the coverage percentage.  Fails if the
measured value is below `MIN_COVERAGE` (default: 95).

---

## Configuration

All configuration is via environment variables — no values are hard-coded.

| Variable | Default | Description |
|---|---|---|
| `REPORT_DIR` | `security-reports` | Output directory for all artefacts |
| `MIN_COVERAGE` | `95` | Minimum acceptable coverage percentage |
| `ALERT_WEBHOOK` | _(empty)_ | Optional webhook URL for alert notifications |
| `SECURITY_PACKAGE` | `security` | Cargo package name under test |
| `CONTRACTS_DIR` | `contracts` | Root directory for static scans |

---

## Usage

### Local

```bash
chmod +x contracts/security/src/security_workflow_automation.sh
bash contracts/security/src/security_workflow_automation.sh
```

### GitHub Actions

```yaml
- name: Security Workflow Automation
  run: bash contracts/security/src/security_workflow_automation.sh
  env:
    ALERT_WEBHOOK: ${{ secrets.SECURITY_WEBHOOK }}
    MIN_COVERAGE: "95"
```

### GitLab CI

```yaml
security_workflow:
  script:
    - bash contracts/security/src/security_workflow_automation.sh
  artifacts:
    paths:
      - security-reports/
  variables:
    MIN_COVERAGE: "95"
```

---

## Output Artefacts

All artefacts are written to `REPORT_DIR` (default: `security-reports/`).

| File | Contents |
|---|---|
| `workflow.log` | Timestamped log of every step |
| `audit.json` | cargo-audit JSON output |
| `secrets_scan.txt` | Lines matching secret patterns |
| `clippy.txt` | Clippy output |
| `unsafe_audit.txt` | Unsafe-code matches |
| `panic_audit.txt` | Panic-pattern matches |
| `test_output.txt` | cargo test output |
| `coverage.txt` | cargo-tarpaulin output |
| `summary.txt` | Human-readable step summary |

---

## Exit Codes

| Code | Meaning |
|---|---|
| `0` | All steps passed |
| `1` | One or more steps failed |

---

## Running the Test Suite

```bash
chmod +x contracts/security/src/security_workflow_automation.test.sh
bash contracts/security/src/security_workflow_automation.test.sh
```

Expected output (all passing):

```
=========================================
security_workflow_automation Test Suite
=========================================
[Section 1] Bootstrap / environment
✓ bootstrap creates REPORT_DIR
...
=========================================
Test Results
=========================================
Tests run    : 50
Tests passed : 50
Tests failed : 0
Coverage     : 100%

✓ All tests passed
```

---

## Test Coverage Map

| Section | Tests | Coverage area |
|---|---|---|
| 1 — Bootstrap | 4 | Directory creation, idempotency, permissions |
| 2 — Logging | 4 | Append, accumulation, log levels |
| 3 — Secret scanning | 6 | All 5 patterns, short-value exclusion, empty dir |
| 4 — Unsafe audit | 3 | Clean, detection, test-file exclusion |
| 5 — Panic audit | 5 | Clean, `panic!`, `.unwrap()`, `.expect()`, test exclusion |
| 6 — Coverage gate | 5 | At min, above, below, zero pct, zero min |
| 7 — Alert / webhook | 3 | No webhook, webhook set, URL not logged |
| 8 — Report generation | 4 | File created, counts, artefacts, overwrite |
| 9 — File permissions | 3 | Normal, world-writable, empty dir |
| 10 — Step counters | 3 | Pass, fail, accumulation |
| 11 — Security assumptions | 6 | Defaults, exit codes, pattern thresholds |
| 12 — Edge cases | 4 | Multi-secret, multi-unsafe, spaces in path, zero-byte |

---

## Dependencies

| Tool | Required | Purpose |
|---|---|---|
| `cargo` | Yes | Build and test runner |
| `cargo-audit` | No (warned) | Dependency vulnerability scanning |
| `cargo-tarpaulin` | No (warned) | Coverage measurement |
| `jq` | No (warned) | JSON parsing of audit output |
| `curl` | No | Webhook delivery |

Install optional tools:

```bash
cargo install cargo-audit cargo-tarpaulin
```

---

## Adding a New Security Check

1. Add a new function in `security_workflow_automation.sh` following the
   `audit_*` / `scan_*` / `run_*` naming convention.
2. Document it with `@notice`, `@dev`, and `@custom:security-note` comments.
3. Call it from `main()` with `|| overall=1`.
4. Add a happy-path test and at least one failure-path test in
   `security_workflow_automation.test.sh`.
5. Run the test suite and confirm ≥ 95 % coverage.
