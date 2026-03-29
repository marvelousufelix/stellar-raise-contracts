#!/usr/bin/env bash
# =============================================================================
# security_compliance_auditing.sh
# =============================================================================
# @title   SecurityComplianceAuditing — Automated CI/CD Security Audit
# @notice  Performs structured compliance auditing for the Stellar Raise
#          crowdfunding contract.  Designed to run in CI/CD pipelines and
#          locally.  Produces a machine-readable audit report.
# @dev     Exit code policy:
#            0 = all audit checks passed
#            1 = one or more audit checks failed
#            2 = required tooling is missing
#          Read-only — no state or file modifications are made.
#
# @custom:security-note
#   1. Read-only — no writes to storage or state files.
#   2. Permissionless — no privileged access required.
#   3. Deterministic — same inputs produce same outputs.
#   4. Bounded — no unbounded loops.
#
# Usage:
#   ./security_compliance_auditing.sh [--verbose] [--json] [--report-dir DIR]
# =============================================================================

set -euo pipefail

# ── Configuration ─────────────────────────────────────────────────────────────

readonly SCRIPT_NAME="security_compliance_auditing"
readonly VERSION="1.0.0"
readonly MIN_COVERAGE_PERCENT=95
readonly WASM_MAX_BYTES=$(( 256 * 1024 ))
readonly WASM_PATH="target/wasm32-unknown-unknown/release/crowdfund.wasm"

# ── Colour helpers ────────────────────────────────────────────────────────────

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

pass()    { echo -e "${GREEN}[PASS]${NC} $*"; PASSED=$(( PASSED + 1 )); }
fail()    { echo -e "${RED}[FAIL]${NC} $*";   FAILED=$(( FAILED + 1 )); }
warn()    { echo -e "${YELLOW}[WARN]${NC} $*"; WARNINGS=$(( WARNINGS + 1 )); }
section() { echo -e "\n${BLUE}── $* ──────────────────────────────────────────────${NC}"; }
info()    { echo -e "     $*"; }

PASSED=0
FAILED=0
WARNINGS=0

# ── CLI flags ─────────────────────────────────────────────────────────────────

VERBOSE=false
JSON_OUTPUT=false
REPORT_DIR="audit-reports"

while [[ $# -gt 0 ]]; do
    case "$1" in
        --verbose)    VERBOSE=true ;;
        --json)       JSON_OUTPUT=true ;;
        --report-dir) REPORT_DIR="$2"; shift ;;
        --help)
            echo "Usage: $0 [--verbose] [--json] [--report-dir DIR]"
            exit 0
            ;;
        *) echo "Unknown option: $1"; exit 1 ;;
    esac
    shift
done

# ── Helpers ───────────────────────────────────────────────────────────────────

# @notice Checks that a required tool is available on PATH.
# @param  $1  tool name
require_tool() {
    local tool="$1"
    if ! command -v "$tool" &>/dev/null; then
        echo -e "${RED}[MISSING]${NC} $tool — install it before running this script"
        return 1
    fi
    [[ "$VERBOSE" == true ]] && info "$tool → $(command -v "$tool")"
    return 0
}

# ── Phase 1: Tool presence ────────────────────────────────────────────────────

# @notice Verifies all required tools are installed.
# @dev    Exits with code 2 on any missing tool so CI can distinguish
#         "tooling missing" from "audit failed".
audit_tools() {
    section "Tool Presence"
    local missing=0

    for tool in cargo wasm-opt; do
        require_tool "$tool" || missing=$(( missing + 1 ))
        [[ $missing -eq 0 ]] && pass "$tool present"
    done

    if ! cargo audit --version &>/dev/null 2>&1; then
        echo -e "${RED}[MISSING]${NC} cargo-audit — run: cargo install cargo-audit"
        missing=$(( missing + 1 ))
    else
        pass "cargo-audit present"
    fi

    if [[ "$missing" -gt 0 ]]; then
        echo ""
        echo "ERROR: $missing required tool(s) missing."
        exit 2
    fi
}

# ── Phase 2: Dependency vulnerability audit ───────────────────────────────────

# @notice Runs cargo-audit to detect known CVEs in Rust dependencies.
# @dev    Respects an optional .security-allowlist file for known false
#         positives.  Each suppressed advisory must be documented in that file.
audit_dependencies() {
    section "Dependency Vulnerability Audit"

    local audit_args=()
    if [[ -f ".security-allowlist" ]]; then
        while IFS= read -r advisory; do
            [[ "$advisory" =~ ^#.*$ || -z "$advisory" ]] && continue
            audit_args+=("--ignore" "$advisory")
        done < ".security-allowlist"
        [[ "$VERBOSE" == true ]] && info "Loaded allowlist: .security-allowlist"
    fi

    if cargo audit "${audit_args[@]}" 2>&1; then
        pass "No known vulnerabilities in Rust dependencies"
    else
        fail "cargo-audit reported vulnerabilities — review output above"
    fi
}

# ── Phase 3: Static analysis (Clippy) ────────────────────────────────────────

# @notice Runs Clippy with deny-warnings to catch security-relevant lints.
audit_static_analysis() {
    section "Static Analysis (Clippy)"

    if cargo clippy --all-targets --all-features -- -D warnings 2>&1; then
        pass "Clippy: no warnings or errors"
    else
        fail "Clippy reported issues — review output above"
    fi
}

# ── Phase 4: WASM binary size ─────────────────────────────────────────────────

# @notice Verifies the optimised WASM binary does not exceed Stellar's 256 KB
#         limit.  A binary that is too large may indicate bloat or supply-chain
#         tampering.
audit_wasm_size() {
    section "WASM Binary Size"

    if [[ ! -f "$WASM_PATH" ]]; then
        warn "WASM binary not found at $WASM_PATH — skipping size check"
        return
    fi

    local size
    size=$(stat -c%s "$WASM_PATH")
    info "Raw WASM size: $size bytes (limit: $WASM_MAX_BYTES bytes)"

    if [[ "$size" -le "$WASM_MAX_BYTES" ]]; then
        pass "WASM binary within size limit ($size / $WASM_MAX_BYTES bytes)"
    else
        fail "WASM binary exceeds limit: $size bytes > $WASM_MAX_BYTES bytes"
    fi
}

# ── Phase 5: Security pattern checks ─────────────────────────────────────────

# @notice Scans Rust source for patterns that indicate missing security controls.
# @dev    Checks are heuristic — a PASS here does not guarantee correctness.
audit_security_patterns() {
    section "Security Pattern Checks"

    local src_dir="contracts/crowdfund/src"

    if [[ ! -d "$src_dir" ]]; then
        warn "Source directory $src_dir not found — skipping pattern checks"
        return
    fi

    # Check: require_auth usage (access control)
    if grep -rq "require_auth" "$src_dir"; then
        pass "require_auth usage detected (access control present)"
    else
        fail "No require_auth calls found — access control may be missing"
    fi

    # Check: no unwrap() in production code (panic safety)
    local unwrap_count
    unwrap_count=$(grep -r "\.unwrap()" "$src_dir" --include="*.rs" \
        | grep -v "_test\|test\.rs\|#\[cfg(test" | wc -l || true)
    if [[ "$unwrap_count" -eq 0 ]]; then
        pass "No .unwrap() in production code (panic-safe)"
    else
        warn ".unwrap() found $unwrap_count time(s) in production code — prefer explicit error handling"
    fi

    # Check: checked arithmetic or no raw arithmetic on i128/u64
    if grep -rq "checked_add\|checked_sub\|checked_mul\|checked_div\|panic\|ContractError" "$src_dir"; then
        pass "Overflow-safe arithmetic patterns detected"
    else
        warn "No checked arithmetic found — verify overflow safety manually"
    fi

    # Check: set_euo_pipefail equivalent — reentrancy guard
    if grep -rq "reentrancy\|ReentrancyGuard\|LOCKED" "$src_dir"; then
        pass "Reentrancy guard pattern detected"
    else
        warn "No reentrancy guard found — verify pull-based refund model is sufficient"
    fi
}

# ── Phase 6: Test coverage gate ───────────────────────────────────────────────

# @notice Verifies the test suite compiles and runs without failures.
# @dev    Full coverage measurement requires llvm-cov or tarpaulin; this phase
#         ensures tests pass as a minimum gate.
audit_tests() {
    section "Test Suite"

    if cargo test --workspace --quiet 2>&1; then
        pass "All Rust tests passed"
    else
        fail "Rust test suite reported failures"
    fi
}

# ── Phase 7: Formatting ───────────────────────────────────────────────────────

# @notice Enforces consistent code formatting as a compliance signal.
audit_formatting() {
    section "Code Formatting"

    if cargo fmt --all -- --check 2>&1; then
        pass "Code formatting is compliant (cargo fmt)"
    else
        fail "Formatting violations found — run: cargo fmt --all"
    fi
}

# ── Report generation ─────────────────────────────────────────────────────────

# @notice Writes a JSON summary of the audit run to REPORT_DIR.
# @dev    Only executed when --json flag is passed.
generate_json_report() {
    mkdir -p "$REPORT_DIR"
    local report_file="$REPORT_DIR/audit-$(date +%Y%m%dT%H%M%S).json"
    local total=$(( PASSED + FAILED + WARNINGS ))
    local status="PASS"
    [[ "$FAILED" -gt 0 ]] && status="FAIL"

    cat > "$report_file" <<EOF
{
  "script": "$SCRIPT_NAME",
  "version": "$VERSION",
  "timestamp": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "status": "$status",
  "summary": {
    "total": $total,
    "passed": $PASSED,
    "failed": $FAILED,
    "warnings": $WARNINGS
  }
}
EOF
    echo ""
    info "Audit report written to: $report_file"
}

# ── Main ──────────────────────────────────────────────────────────────────────

main() {
    echo "╔══════════════════════════════════════════════════════════════╗"
    echo "║  $SCRIPT_NAME v$VERSION"
    echo "╚══════════════════════════════════════════════════════════════╝"

    audit_tools
    audit_dependencies
    audit_static_analysis
    audit_wasm_size
    audit_security_patterns
    audit_tests
    audit_formatting

    echo ""
    echo "══════════════════════════════════════════════════════════════"
    echo "  Audit Summary: PASSED=$PASSED  FAILED=$FAILED  WARNINGS=$WARNINGS"
    echo "══════════════════════════════════════════════════════════════"

    [[ "$JSON_OUTPUT" == true ]] && generate_json_report

    if [[ "$FAILED" -gt 0 ]]; then
        echo -e "${RED}AUDIT FAILED — $FAILED check(s) did not pass.${NC}"
        exit 1
    fi

    echo -e "${GREEN}AUDIT PASSED${NC}"
    exit 0
}

main "$@"
