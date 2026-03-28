#!/usr/bin/env bash
# =============================================================================
# security_compliance_reporting.sh
#
# @title  Automated Security Compliance Reporting
# @notice Generates a structured security compliance report for the Stellar
#         Raise crowdfund project as part of the CI/CD pipeline.
#
# @dev    The script performs the following checks in order:
#           1. Rust dependency audit (cargo audit)
#           2. NPM dependency audit (npm audit)
#           3. Clippy lint gate (deny warnings)
#           4. Secret / credential scan (grep-based heuristics)
#           5. WASM binary size check (256 KB hard cap)
#           6. Report generation (JSON + human-readable summary)
#
# @custom:security
#   - All external commands are invoked with explicit paths or via PATH.
#   - No user-supplied input is eval'd or passed to shell without quoting.
#   - Temporary files are created in TMPDIR and cleaned up on EXIT via trap.
#   - The script exits with code 1 if any CRITICAL check fails.
#   - Non-critical failures are recorded as WARN and do not block the build.
#
# @custom:ci-usage
#   Called from .github/workflows/rust_ci.yml:
#     - name: Security compliance report
#       run: bash .github/scripts/security_compliance_reporting.sh
#
# Usage:
#   bash security_compliance_reporting.sh [--output-dir DIR] [--wasm-path PATH]
#
# Environment variables (all optional):
#   REPORT_OUTPUT_DIR   Directory to write reports (default: ./security-reports)
#   WASM_PATH           Path to compiled WASM binary
#                       (default: target/wasm32-unknown-unknown/release/crowdfund.wasm)
#   WASM_SIZE_LIMIT_KB  Maximum allowed WASM size in KB (default: 256)
#   SKIP_CARGO_AUDIT    Set to "1" to skip cargo audit (e.g. offline CI)
#   SKIP_NPM_AUDIT      Set to "1" to skip npm audit
#   CI                  Set by GitHub Actions; enables machine-readable output
# =============================================================================

set -euo pipefail

# ── Configuration ─────────────────────────────────────────────────────────────

REPORT_OUTPUT_DIR="${REPORT_OUTPUT_DIR:-./security-reports}"
WASM_PATH="${WASM_PATH:-target/wasm32-unknown-unknown/release/crowdfund.wasm}"
WASM_SIZE_LIMIT_KB="${WASM_SIZE_LIMIT_KB:-256}"
SKIP_CARGO_AUDIT="${SKIP_CARGO_AUDIT:-0}"
SKIP_NPM_AUDIT="${SKIP_NPM_AUDIT:-0}"
TIMESTAMP="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
REPORT_FILE="${REPORT_OUTPUT_DIR}/compliance_report_$(date -u +"%Y%m%d_%H%M%S").json"
SUMMARY_FILE="${REPORT_OUTPUT_DIR}/compliance_summary.txt"

# ── Counters ──────────────────────────────────────────────────────────────────

CRITICAL_FAILURES=0
WARN_COUNT=0
PASS_COUNT=0

# ── Temporary workspace ───────────────────────────────────────────────────────

TMPDIR_WORK="$(mktemp -d)"
trap 'rm -rf "${TMPDIR_WORK}"' EXIT

# ── Colour helpers (disabled in CI) ──────────────────────────────────────────

if [[ "${CI:-}" == "true" ]]; then
  RED="" GREEN="" YELLOW="" BLUE="" RESET=""
else
  RED="\033[0;31m" GREEN="\033[0;32m" YELLOW="\033[0;33m"
  BLUE="\033[0;34m" RESET="\033[0m"
fi

# ── Logging helpers ───────────────────────────────────────────────────────────

log_info()  { echo -e "${BLUE}[INFO]${RESET}  $*"; }
log_pass()  { echo -e "${GREEN}[PASS]${RESET}  $*"; PASS_COUNT=$((PASS_COUNT + 1)); }
log_warn()  { echo -e "${YELLOW}[WARN]${RESET}  $*"; WARN_COUNT=$((WARN_COUNT + 1)); }
log_fail()  { echo -e "${RED}[FAIL]${RESET}  $*"; CRITICAL_FAILURES=$((CRITICAL_FAILURES + 1)); }

# ── JSON helpers ──────────────────────────────────────────────────────────────

# Append a check result object to the JSON results array file.
# Usage: append_result NAME STATUS DETAIL
append_result() {
  local name="$1" status="$2" detail="$3"
  # Escape double-quotes in detail string.
  detail="${detail//\"/\\\"}"
  printf '{"check":"%s","status":"%s","detail":"%s","timestamp":"%s"}\n' \
    "${name}" "${status}" "${detail}" "${TIMESTAMP}" \
    >> "${TMPDIR_WORK}/results.ndjson"
}

# ── Setup ─────────────────────────────────────────────────────────────────────

mkdir -p "${REPORT_OUTPUT_DIR}"
touch "${TMPDIR_WORK}/results.ndjson"

log_info "Security Compliance Report — ${TIMESTAMP}"
log_info "Output directory: ${REPORT_OUTPUT_DIR}"
echo "────────────────────────────────────────────────────────────"

# ── Check 1: Rust dependency audit ───────────────────────────────────────────

run_cargo_audit() {
  log_info "Check 1/5: Rust dependency audit (cargo audit)"

  if [[ "${SKIP_CARGO_AUDIT}" == "1" ]]; then
    log_warn "cargo audit skipped (SKIP_CARGO_AUDIT=1)"
    append_result "cargo_audit" "SKIPPED" "SKIP_CARGO_AUDIT=1"
    return
  fi

  if ! command -v cargo-audit &>/dev/null && ! cargo audit --version &>/dev/null 2>&1; then
    log_warn "cargo-audit not installed; installing..."
    cargo install cargo-audit --quiet || {
      log_warn "cargo-audit installation failed; skipping"
      append_result "cargo_audit" "SKIPPED" "installation failed"
      return
    }
  fi

  local audit_out
  audit_out="${TMPDIR_WORK}/cargo_audit.txt"

  if cargo audit --json 2>/dev/null | tee "${audit_out}" | \
      python3 -c "
import sys, json
data = json.load(sys.stdin)
vulns = data.get('vulnerabilities', {})
count = vulns.get('count', 0)
sys.exit(0 if count == 0 else 1)
" 2>/dev/null; then
    log_pass "cargo audit: no vulnerabilities found"
    append_result "cargo_audit" "PASS" "no vulnerabilities"
  else
    # Fall back to text-mode audit if JSON parsing fails.
    if cargo audit 2>&1 | tee "${audit_out}" | grep -q "error\["; then
      log_fail "cargo audit: vulnerabilities detected — see ${audit_out}"
      append_result "cargo_audit" "FAIL" "vulnerabilities detected"
    else
      log_pass "cargo audit: no critical vulnerabilities"
      append_result "cargo_audit" "PASS" "no critical vulnerabilities"
    fi
  fi
}

run_cargo_audit

# ── Check 2: NPM dependency audit ────────────────────────────────────────────

run_npm_audit() {
  log_info "Check 2/5: NPM dependency audit (npm audit)"

  if [[ "${SKIP_NPM_AUDIT}" == "1" ]]; then
    log_warn "npm audit skipped (SKIP_NPM_AUDIT=1)"
    append_result "npm_audit" "SKIPPED" "SKIP_NPM_AUDIT=1"
    return
  fi

  if ! command -v npm &>/dev/null; then
    log_warn "npm not found; skipping npm audit"
    append_result "npm_audit" "SKIPPED" "npm not found"
    return
  fi

  local npm_out
  npm_out="${TMPDIR_WORK}/npm_audit.txt"

  # --audit-level=high: only fail on high/critical vulnerabilities.
  if npm audit --audit-level=high 2>&1 | tee "${npm_out}"; then
    log_pass "npm audit: no high/critical vulnerabilities"
    append_result "npm_audit" "PASS" "no high/critical vulnerabilities"
  else
    log_fail "npm audit: high/critical vulnerabilities detected — see ${npm_out}"
    append_result "npm_audit" "FAIL" "high/critical vulnerabilities detected"
  fi
}

run_npm_audit

# ── Check 3: Clippy lint gate ─────────────────────────────────────────────────

run_clippy() {
  log_info "Check 3/5: Clippy lint gate"

  if ! command -v cargo &>/dev/null; then
    log_warn "cargo not found; skipping clippy"
    append_result "clippy" "SKIPPED" "cargo not found"
    return
  fi

  local clippy_out
  clippy_out="${TMPDIR_WORK}/clippy.txt"

  if cargo clippy --all-targets --all-features -- -D warnings 2>&1 | tee "${clippy_out}"; then
    log_pass "clippy: no warnings"
    append_result "clippy" "PASS" "no warnings"
  else
    log_fail "clippy: warnings/errors detected — see ${clippy_out}"
    append_result "clippy" "FAIL" "clippy warnings detected"
  fi
}

run_clippy

# ── Check 4: Secret / credential scan ────────────────────────────────────────

run_secret_scan() {
  log_info "Check 4/5: Secret / credential scan"

  local scan_out
  scan_out="${TMPDIR_WORK}/secret_scan.txt"
  local found=0

  # Patterns that indicate hardcoded secrets.
  local patterns=(
    'SECRET_KEY\s*=\s*"[A-Za-z0-9+/]{20,}"'
    'PRIVATE_KEY\s*=\s*"[A-Za-z0-9+/]{20,}"'
    'password\s*=\s*"[^"]{8,}"'
    'api_key\s*=\s*"[A-Za-z0-9_\-]{16,}"'
    'BEGIN (RSA|EC|OPENSSH) PRIVATE KEY'
    'S[0-9A-Z]{55}'   # Stellar secret key pattern
  )

  for pattern in "${patterns[@]}"; do
    if grep -rn --include="*.rs" --include="*.ts" --include="*.tsx" \
        --include="*.js" --include="*.json" --include="*.toml" \
        --include="*.sh" --include="*.yml" --include="*.yaml" \
        -E "${pattern}" \
        --exclude-dir=".git" \
        --exclude-dir="node_modules" \
        --exclude-dir="target" \
        . 2>/dev/null >> "${scan_out}"; then
      found=1
    fi
  done

  if [[ "${found}" -eq 0 ]]; then
    log_pass "secret scan: no hardcoded secrets detected"
    append_result "secret_scan" "PASS" "no hardcoded secrets"
  else
    log_fail "secret scan: potential secrets detected — see ${scan_out}"
    cat "${scan_out}"
    append_result "secret_scan" "FAIL" "potential secrets detected"
  fi
}

run_secret_scan

# ── Check 5: WASM binary size ─────────────────────────────────────────────────

run_wasm_size_check() {
  log_info "Check 5/5: WASM binary size check (limit: ${WASM_SIZE_LIMIT_KB} KB)"

  if [[ ! -f "${WASM_PATH}" ]]; then
    log_warn "WASM binary not found at ${WASM_PATH}; skipping size check"
    append_result "wasm_size" "SKIPPED" "binary not found at ${WASM_PATH}"
    return
  fi

  local size_bytes size_kb
  size_bytes="$(wc -c < "${WASM_PATH}")"
  size_kb=$(( (size_bytes + 1023) / 1024 ))

  if [[ "${size_kb}" -le "${WASM_SIZE_LIMIT_KB}" ]]; then
    log_pass "WASM size: ${size_kb} KB (limit: ${WASM_SIZE_LIMIT_KB} KB)"
    append_result "wasm_size" "PASS" "${size_kb}KB <= ${WASM_SIZE_LIMIT_KB}KB"
  else
    log_fail "WASM size: ${size_kb} KB exceeds limit of ${WASM_SIZE_LIMIT_KB} KB"
    append_result "wasm_size" "FAIL" "${size_kb}KB > ${WASM_SIZE_LIMIT_KB}KB"
  fi
}

run_wasm_size_check

# ── Report generation ─────────────────────────────────────────────────────────

echo "────────────────────────────────────────────────────────────"
log_info "Generating compliance report…"

# Build JSON report from NDJSON results.
{
  echo "{"
  echo "  \"report_timestamp\": \"${TIMESTAMP}\","
  echo "  \"pass_count\": ${PASS_COUNT},"
  echo "  \"warn_count\": ${WARN_COUNT},"
  echo "  \"critical_failures\": ${CRITICAL_FAILURES},"
  echo "  \"overall_status\": \"$([ "${CRITICAL_FAILURES}" -eq 0 ] && echo "PASS" || echo "FAIL")\","
  echo "  \"checks\": ["
  local first=1
  while IFS= read -r line; do
    [[ "${first}" -eq 1 ]] && first=0 || echo ","
    printf "    %s" "${line}"
  done < "${TMPDIR_WORK}/results.ndjson"
  echo ""
  echo "  ]"
  echo "}"
} > "${REPORT_FILE}" 2>/dev/null || {
  # Fallback: write a minimal report without process substitution.
  printf '{"report_timestamp":"%s","pass_count":%d,"warn_count":%d,"critical_failures":%d,"overall_status":"%s","checks":[]}\n' \
    "${TIMESTAMP}" "${PASS_COUNT}" "${WARN_COUNT}" "${CRITICAL_FAILURES}" \
    "$([ "${CRITICAL_FAILURES}" -eq 0 ] && echo "PASS" || echo "FAIL")" \
    > "${REPORT_FILE}"
}

# Human-readable summary.
{
  echo "Security Compliance Report"
  echo "Generated: ${TIMESTAMP}"
  echo "────────────────────────────────────────────────────────────"
  echo "PASS:     ${PASS_COUNT}"
  echo "WARN:     ${WARN_COUNT}"
  echo "CRITICAL: ${CRITICAL_FAILURES}"
  echo "Overall:  $([ "${CRITICAL_FAILURES}" -eq 0 ] && echo "PASS" || echo "FAIL")"
  echo "────────────────────────────────────────────────────────────"
  echo "Full report: ${REPORT_FILE}"
} | tee "${SUMMARY_FILE}"

# ── Exit code ─────────────────────────────────────────────────────────────────

if [[ "${CRITICAL_FAILURES}" -gt 0 ]]; then
  log_fail "Compliance check FAILED with ${CRITICAL_FAILURES} critical failure(s)."
  exit 1
fi

log_pass "All compliance checks passed."
exit 0
