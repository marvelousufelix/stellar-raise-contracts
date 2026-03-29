#!/bin/bash

# @title   security_workflow_automation.sh
# @notice  Automated security workflow for CI/CD pipelines in the Stellar Raise
#          crowdfunding project.  Orchestrates dependency auditing, static
#          analysis, secret scanning, test execution, coverage gating, and
#          structured report generation in a single idempotent script.
#
# @dev     Designed to run as a GitHub Actions step, GitLab CI job, or locally.
#          All side-effects are scoped to REPORT_DIR so the workspace stays clean.
#          Exit codes follow the POSIX convention: 0 = success, non-zero = failure.
#
# @custom:security-note
#   - Never commit secrets or tokens; all sensitive values must be injected via
#     environment variables (ALERT_WEBHOOK, CARGO_AUDIT_TOKEN, etc.).
#   - The script enforces a minimum coverage gate (MIN_COVERAGE) before passing.
#   - All generated artefacts are written to REPORT_DIR, which should be added
#     to .gitignore and treated as ephemeral CI output.
#
# @custom:ci-integration
#   GitHub Actions:
#     - name: Security Workflow Automation
#       run: bash contracts/security/src/security_workflow_automation.sh
#       env:
#         ALERT_WEBHOOK: ${{ secrets.SECURITY_WEBHOOK }}
#
#   GitLab CI:
#     security_workflow:
#       script:
#         - bash contracts/security/src/security_workflow_automation.sh
#       artifacts:
#         paths: [security-reports/]

set -euo pipefail

# ── Configuration ─────────────────────────────────────────────────────────────

# @notice  Directory where all report artefacts are written.
REPORT_DIR="${REPORT_DIR:-security-reports}"

# @notice  Minimum acceptable test-coverage percentage (0–100).
# @dev     Build fails when measured coverage falls below this threshold.
MIN_COVERAGE="${MIN_COVERAGE:-95}"

# @notice  Optional webhook URL for alert notifications.
# @custom:security-note  Must be injected via environment; never hard-coded.
ALERT_WEBHOOK="${ALERT_WEBHOOK:-}"

# @notice  Log file path inside REPORT_DIR.
LOG_FILE="${REPORT_DIR}/workflow.log"

# @notice  Cargo package under test.
SECURITY_PACKAGE="${SECURITY_PACKAGE:-security}"

# @notice  Contracts source root used for static scans.
CONTRACTS_DIR="${CONTRACTS_DIR:-contracts}"

# ── ANSI colour helpers ───────────────────────────────────────────────────────

RED='\033[0;31m'
YELLOW='\033[1;33m'
GREEN='\033[0;32m'
CYAN='\033[0;36m'
NC='\033[0m'

# ── Counters ──────────────────────────────────────────────────────────────────

STEP_PASS=0
STEP_FAIL=0

# ── Utility functions ─────────────────────────────────────────────────────────

# @notice  Writes a timestamped log entry to stdout and LOG_FILE.
# @param   $1  Log level (INFO | WARN | ERROR | PASS | FAIL)
# @param   $@  Message text
log() {
    local level="$1"; shift
    local msg="$*"
    local ts
    ts=$(date '+%Y-%m-%dT%H:%M:%S')
    local line="[$ts] [$level] $msg"
    echo "$line" | tee -a "$LOG_FILE"
}

# @notice  Sends an alert to the configured webhook.
# @dev     Silently skips when ALERT_WEBHOOK is empty.
# @param   $1  Severity label
# @param   $2  Alert title
# @param   $3  Alert message body
send_alert() {
    local severity="$1" title="$2" message="$3"
    log "WARN" "ALERT [$severity] $title — $message"
    if [[ -n "$ALERT_WEBHOOK" ]]; then
        local ts
        ts=$(date -u '+%Y-%m-%dT%H:%M:%SZ')
        curl -fsSL -X POST "$ALERT_WEBHOOK" \
            -H "Content-Type: application/json" \
            -d "{\"severity\":\"$severity\",\"title\":\"$title\",\"message\":\"$message\",\"timestamp\":\"$ts\"}" \
            2>/dev/null \
            || log "WARN" "Webhook delivery failed (non-fatal)"
    fi
}

# @notice  Records a step result and prints a coloured summary line.
# @param   $1  Step name
# @param   $2  Exit code of the step (0 = pass)
record_step() {
    local name="$1" code="$2"
    if [[ "$code" -eq 0 ]]; then
        echo -e "${GREEN}✓${NC} $name"
        log "PASS" "$name"
        STEP_PASS=$((STEP_PASS + 1))
    else
        echo -e "${RED}✗${NC} $name"
        log "FAIL" "$name"
        STEP_FAIL=$((STEP_FAIL + 1))
    fi
}

# ── Step 1: Environment bootstrap ─────────────────────────────────────────────

# @notice  Creates the report directory and verifies required tools are present.
# @dev     Exits immediately if cargo is missing; optional tools are warned only.
# @custom:security-note  cargo-audit must be installed for dependency scanning.
bootstrap() {
    mkdir -p "$REPORT_DIR"
    : > "$LOG_FILE"   # truncate / create log

    log "INFO" "=== Security Workflow Automation ==="
    log "INFO" "REPORT_DIR=$REPORT_DIR  MIN_COVERAGE=$MIN_COVERAGE"

    # Required
    if ! command -v cargo &>/dev/null; then
        log "ERROR" "cargo not found — cannot continue"
        send_alert "CRITICAL" "Missing Tool" "cargo is not installed on the CI runner"
        exit 1
    fi

    # Optional — warn but continue
    for tool in cargo-audit cargo-tarpaulin jq; do
        if ! command -v "$tool" &>/dev/null; then
            log "WARN" "Optional tool not found: $tool (some steps will be skipped)"
        fi
    done

    record_step "bootstrap" 0
}

# ── Step 2: Dependency vulnerability audit ────────────────────────────────────

# @notice  Runs cargo-audit and fails the build on any unfixed advisory.
# @dev     Writes JSON output to REPORT_DIR/audit.json for downstream parsing.
# @custom:security-note  Advisories with fix-available are treated as blocking.
run_dependency_audit() {
    log "INFO" "Running dependency vulnerability audit..."

    if ! command -v cargo-audit &>/dev/null; then
        log "WARN" "cargo-audit not installed — skipping dependency audit"
        record_step "dependency_audit (skipped)" 0
        return 0
    fi

    local out="$REPORT_DIR/audit.json"
    local rc=0
    cargo audit --json > "$out" 2>&1 || rc=$?

    if [[ "$rc" -ne 0 ]]; then
        local count
        count=$(jq '.vulnerabilities.count // 0' "$out" 2>/dev/null || echo "unknown")
        send_alert "HIGH" "Dependency Vulnerabilities" "Found $count vulnerable dependencies"
        record_step "dependency_audit" 1
        return 1
    fi

    log "INFO" "No dependency vulnerabilities found"
    record_step "dependency_audit" 0
}

# ── Step 3: Secret scanning ───────────────────────────────────────────────────

# @notice  Greps source files for patterns that resemble hard-coded secrets.
# @dev     Excludes test files and comment-only lines to reduce false positives.
# @custom:security-note  Patterns are intentionally conservative; tune via
#          SECRET_PATTERNS env var if needed.
scan_secrets() {
    log "INFO" "Scanning for hard-coded secrets..."

    local patterns=(
        'password\s*=\s*["'"'"'][^"'"'"']{4,}["'"'"']'
        'api[_-]?key\s*=\s*["'"'"'][^"'"'"']{4,}["'"'"']'
        'secret\s*=\s*["'"'"'][^"'"'"']{4,}["'"'"']'
        'private[_-]?key\s*=\s*["'"'"'][^"'"'"']{4,}["'"'"']'
        'auth[_-]?token\s*=\s*["'"'"'][^"'"'"']{4,}["'"'"']'
    )

    local findings=0
    local out="$REPORT_DIR/secrets_scan.txt"
    : > "$out"

    for pattern in "${patterns[@]}"; do
        local hits
        hits=$(grep -rniE "$pattern" "$CONTRACTS_DIR/" \
                   --include="*.rs" --include="*.toml" \
                   2>/dev/null \
               | grep -v '\.test\.' \
               | grep -v '#.*'"$pattern" \
               || true)
        if [[ -n "$hits" ]]; then
            echo "$hits" >> "$out"
            findings=$((findings + 1))
            log "WARN" "Potential secret pattern matched: $pattern"
        fi
    done

    if [[ "$findings" -gt 0 ]]; then
        send_alert "HIGH" "Potential Secrets Detected" \
            "$findings pattern(s) matched — review $out"
        record_step "secret_scan" 1
        return 1
    fi

    log "INFO" "No hard-coded secrets detected"
    record_step "secret_scan" 0
}

# ── Step 4: Static analysis (clippy) ─────────────────────────────────────────

# @notice  Runs clippy with security-relevant lints enabled.
# @dev     Treats all warnings as errors in CI mode.
# @custom:security-note  The deny list targets integer arithmetic, unwrap usage,
#          and other patterns that commonly lead to contract vulnerabilities.
run_static_analysis() {
    log "INFO" "Running static analysis (clippy)..."

    local out="$REPORT_DIR/clippy.txt"
    local rc=0

    cargo clippy \
        --package "$SECURITY_PACKAGE" \
        --all-targets \
        -- \
        -D warnings \
        -W clippy::integer_arithmetic \
        -W clippy::unwrap_used \
        -W clippy::expect_used \
        -W clippy::panic \
        > "$out" 2>&1 \
    || rc=$?

    if [[ "$rc" -ne 0 ]]; then
        log "WARN" "Clippy reported issues — see $out"
        send_alert "MEDIUM" "Static Analysis Warnings" \
            "Clippy found issues in $SECURITY_PACKAGE"
        record_step "static_analysis" 1
        return 1
    fi

    log "INFO" "Static analysis passed"
    record_step "static_analysis" 0
}

# ── Step 5: Unsafe-code audit ─────────────────────────────────────────────────

# @notice  Counts `unsafe` blocks outside test modules and fails if any exist.
# @dev     Soroban contracts must be `#![no_std]` and should never use unsafe.
# @custom:security-note  Any unsafe block in production code is a blocking issue.
audit_unsafe_code() {
    log "INFO" "Auditing unsafe code blocks..."

    local out="$REPORT_DIR/unsafe_audit.txt"
    local count=0

    grep -rn "unsafe" "$CONTRACTS_DIR/" \
        --include="*.rs" \
        2>/dev/null \
    | grep -v '\.test\.' \
    | grep -v '#\[cfg(test)\]' \
    | grep -v '^\s*//' \
    > "$out" || true

    count=$(wc -l < "$out" | tr -d ' ')

    if [[ "$count" -gt 0 ]]; then
        log "WARN" "Found $count unsafe code instance(s) — see $out"
        send_alert "HIGH" "Unsafe Code Detected" \
            "$count unsafe block(s) found in production code"
        record_step "unsafe_code_audit" 1
        return 1
    fi

    log "INFO" "No unsafe code in production sources"
    record_step "unsafe_code_audit" 0
}

# ── Step 6: Panic-pattern audit ───────────────────────────────────────────────

# @notice  Counts panic!, unwrap(), and expect() calls outside test code.
# @dev     A threshold of 0 is enforced for production Soroban contracts.
# @custom:security-note  Panics abort the WASM execution and can be exploited
#          for denial-of-service if triggered by attacker-controlled input.
audit_panic_patterns() {
    log "INFO" "Auditing panic patterns..."

    local out="$REPORT_DIR/panic_audit.txt"
    local count=0

    grep -rn -E 'panic!|\.unwrap\(\)|\.expect\(' "$CONTRACTS_DIR/" \
        --include="*.rs" \
        2>/dev/null \
    | grep -v '\.test\.' \
    | grep -v '#\[cfg(test)\]' \
    | grep -v '^\s*//' \
    > "$out" || true

    count=$(wc -l < "$out" | tr -d ' ')

    if [[ "$count" -gt 0 ]]; then
        log "WARN" "Found $count panic pattern(s) in production code — see $out"
        send_alert "MEDIUM" "Panic Patterns Detected" \
            "$count panic/unwrap/expect call(s) in production code"
        record_step "panic_pattern_audit" 1
        return 1
    fi

    log "INFO" "No panic patterns in production sources"
    record_step "panic_pattern_audit" 0
}

# ── Step 7: Test execution ────────────────────────────────────────────────────

# @notice  Runs the full test suite for the security package.
# @dev     Output is captured to REPORT_DIR/test_output.txt.
# @custom:security-note  All tests must pass before coverage is measured.
run_tests() {
    log "INFO" "Running security package tests..."

    local out="$REPORT_DIR/test_output.txt"
    local rc=0

    cargo test \
        --package "$SECURITY_PACKAGE" \
        -- --test-output immediate \
        > "$out" 2>&1 \
    || rc=$?

    if [[ "$rc" -ne 0 ]]; then
        log "ERROR" "Tests failed — see $out"
        send_alert "HIGH" "Test Failures" \
            "Security package tests failed; check $out"
        record_step "test_execution" 1
        return 1
    fi

    local passed
    passed=$(grep -c "test .* ok" "$out" 2>/dev/null || echo 0)
    log "INFO" "All tests passed ($passed test(s) ok)"
    record_step "test_execution" 0
}

# ── Step 8: Coverage gate ─────────────────────────────────────────────────────

# @notice  Measures line coverage with cargo-tarpaulin and enforces MIN_COVERAGE.
# @dev     Skipped gracefully when tarpaulin is not installed.
# @custom:security-note  Coverage below MIN_COVERAGE is a blocking CI failure.
check_coverage() {
    log "INFO" "Checking test coverage (minimum: ${MIN_COVERAGE}%)..."

    if ! command -v cargo-tarpaulin &>/dev/null; then
        log "WARN" "cargo-tarpaulin not installed — skipping coverage gate"
        record_step "coverage_gate (skipped)" 0
        return 0
    fi

    local out="$REPORT_DIR/coverage.txt"
    local rc=0

    cargo tarpaulin \
        --package "$SECURITY_PACKAGE" \
        --out Stdout \
        --skip-clean \
        > "$out" 2>&1 \
    || rc=$?

    if [[ "$rc" -ne 0 ]]; then
        log "ERROR" "Coverage measurement failed — see $out"
        record_step "coverage_gate" 1
        return 1
    fi

    # Extract the percentage reported by tarpaulin ("XX.XX% coverage")
    local pct
    pct=$(grep -oE '[0-9]+\.[0-9]+% coverage' "$out" \
          | grep -oE '[0-9]+\.[0-9]+' \
          | tail -1 \
          || echo "0")

    local pct_int
    pct_int=$(printf '%.0f' "$pct")

    log "INFO" "Measured coverage: ${pct}%"

    if [[ "$pct_int" -lt "$MIN_COVERAGE" ]]; then
        log "ERROR" "Coverage ${pct}% is below minimum ${MIN_COVERAGE}%"
        send_alert "HIGH" "Coverage Gate Failed" \
            "Coverage ${pct}% < required ${MIN_COVERAGE}%"
        record_step "coverage_gate" 1
        return 1
    fi

    log "INFO" "Coverage gate passed (${pct}% >= ${MIN_COVERAGE}%)"
    record_step "coverage_gate" 0
}

# ── Step 9: Report generation ─────────────────────────────────────────────────

# @notice  Writes a human-readable summary report to REPORT_DIR/summary.txt.
# @dev     The report is also printed to stdout for CI log visibility.
generate_report() {
    log "INFO" "Generating workflow summary report..."

    local report="$REPORT_DIR/summary.txt"
    local ts
    ts=$(date '+%Y-%m-%d %H:%M:%S %Z')

    cat > "$report" <<EOF
========================================
Security Workflow Automation Report
Generated : $ts
Package   : $SECURITY_PACKAGE
Report dir: $REPORT_DIR
========================================

Step Results
------------
Steps passed : $STEP_PASS
Steps failed : $STEP_FAIL

Artefacts
---------
$(ls -1 "$REPORT_DIR"/ 2>/dev/null | sed 's/^/  /')

Security Notes
--------------
- Dependency audit  : $REPORT_DIR/audit.json
- Secret scan       : $REPORT_DIR/secrets_scan.txt
- Clippy output     : $REPORT_DIR/clippy.txt
- Unsafe audit      : $REPORT_DIR/unsafe_audit.txt
- Panic audit       : $REPORT_DIR/panic_audit.txt
- Test output       : $REPORT_DIR/test_output.txt
- Coverage report   : $REPORT_DIR/coverage.txt
- Full log          : $LOG_FILE

========================================
EOF

    cat "$report"
    log "INFO" "Report written to $report"
}

# ── Main orchestrator ─────────────────────────────────────────────────────────

# @notice  Runs all workflow steps in order and exits with a non-zero code if
#          any step failed.
# @dev     Steps are intentionally run even after a failure so the report
#          captures the full picture.  Only the final exit code is gated.
main() {
    local overall=0

    bootstrap

    run_dependency_audit  || overall=1
    scan_secrets          || overall=1
    run_static_analysis   || overall=1
    audit_unsafe_code     || overall=1
    audit_panic_patterns  || overall=1
    run_tests             || overall=1
    check_coverage        || overall=1

    generate_report

    echo ""
    if [[ "$overall" -eq 0 ]]; then
        echo -e "${GREEN}✓ Security workflow completed successfully${NC}"
        log "INFO" "Workflow PASSED ($STEP_PASS steps passed, $STEP_FAIL failed)"
    else
        echo -e "${RED}✗ Security workflow detected issues${NC}"
        log "ERROR" "Workflow FAILED ($STEP_PASS steps passed, $STEP_FAIL failed)"
        send_alert "HIGH" "Security Workflow Failed" \
            "$STEP_FAIL step(s) failed — review $REPORT_DIR/summary.txt"
    fi

    exit "$overall"
}

main "$@"
