#!/usr/bin/env bash
# =============================================================================
# security_compliance_reporting.sh
# =============================================================================
# @title   SecurityComplianceReporting — CI/CD Compliance Report Generator
# @notice  Aggregates results from security compliance checks and produces
#          structured reports (text, JSON) for CI/CD pipelines and auditors.
#          Designed for Stellar/Soroban smart contract projects.
# @dev     Read-only — no state modifications. Safe to run in any CI context.
#          Delegates individual checks to security_compliance_automation.sh
#          and security_compliance_documentation.sh when available.
#
# @author  Security Compliance Team
# @license Apache-2.0
#
# Security Assumptions:
#   1. Read-only  — No writes to storage or state files.
#   2. Permissionless — No privileged access required.
#   3. Deterministic — Same input produces same output.
#   4. Bounded execution — No unbounded loops.
#   5. No side effects — Does not modify source or config files.
#
# Usage:
#   ./security_compliance_reporting.sh [--full-report] [--json] [--verbose]
#   ./security_compliance_reporting.sh --report-only <section>
#   ./security_compliance_reporting.sh --output-file report.json
# =============================================================================

set -euo pipefail

# ── Constants ─────────────────────────────────────────────────────────────────

readonly SCRIPT_NAME="security_compliance_reporting"
readonly VERSION="1.0.0"
readonly MIN_COVERAGE_PERCENT=95

readonly COLOR_RESET='\033[0m'
readonly COLOR_RED='\033[0;31m'
readonly COLOR_GREEN='\033[0;32m'
readonly COLOR_YELLOW='\033[0;33m'
readonly COLOR_BLUE='\033[0;34m'
readonly COLOR_BOLD='\033[1m'

# Companion scripts (resolved relative to this script's directory)
readonly SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
readonly AUTOMATION_SCRIPT="${SCRIPT_DIR}/security_compliance_automation.sh"
readonly DOCUMENTATION_SCRIPT="${SCRIPT_DIR}/security_compliance_documentation.sh"

# ── Global State ──────────────────────────────────────────────────────────────

declare -i TOTAL_SECTIONS=0
declare -i PASSED_SECTIONS=0
declare -i FAILED_SECTIONS=0
declare -a SECTION_RESULTS=()   # "name:PASS|FAIL|SKIP"
declare EXIT_CODE=0

declare VERBOSE=false
declare JSON_OUTPUT=false
declare FULL_REPORT=false
declare REPORT_ONLY=""
declare OUTPUT_FILE=""
declare PROJECT_ROOT=""

# Report data (populated during run)
declare REPORT_TIMESTAMP=""
declare REPORT_GIT_SHA=""
declare REPORT_BRANCH=""
declare AUTOMATION_EXIT=0
declare DOCUMENTATION_EXIT=0
declare AUTOMATION_OUTPUT=""
declare DOCUMENTATION_OUTPUT=""

# ── Utility Functions ─────────────────────────────────────────────────────────

# @title print_header
# @notice Prints a formatted section header
# @param  $1 Header text
print_header() {
    echo ""
    echo -e "${COLOR_BLUE}${COLOR_BOLD}═══════════════════════════════════════════════════════════════${COLOR_RESET}"
    echo -e "${COLOR_BLUE}${COLOR_BOLD}  $1${COLOR_RESET}"
    echo -e "${COLOR_BLUE}${COLOR_BOLD}═══════════════════════════════════════════════════════════════${COLOR_RESET}"
    echo ""
}

# @title record_section
# @notice Records a report section result
# @param  $1 Section name
# @param  $2 Status: PASS | FAIL | SKIP
# @param  $3 Optional detail message
record_section() {
    local name="$1" status="$2" detail="${3:-}"
    TOTAL_SECTIONS=$((TOTAL_SECTIONS + 1))
    SECTION_RESULTS+=("${name}:${status}")
    case "$status" in
        PASS)
            PASSED_SECTIONS=$((PASSED_SECTIONS + 1))
            echo -e "  ${COLOR_GREEN}✓${COLOR_RESET} ${name}"
            ;;
        FAIL)
            FAILED_SECTIONS=$((FAILED_SECTIONS + 1))
            EXIT_CODE=1
            echo -e "  ${COLOR_RED}✗${COLOR_RESET} ${name}"
            ;;
        SKIP)
            echo -e "  ${COLOR_YELLOW}–${COLOR_RESET} ${name} (skipped)"
            ;;
    esac
    if [[ -n "$detail" ]]; then
        echo "    → $detail"
    fi
    return 0
}

# ── Report Sections ───────────────────────────────────────────────────────────

# @title collect_metadata
# @notice Collects report metadata: timestamp, git SHA, branch
# @dev    Non-fatal — missing git info is recorded as "unknown"
collect_metadata() {
    REPORT_TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%SZ" 2>/dev/null || echo "unknown")
    REPORT_GIT_SHA=$(git -C "$PROJECT_ROOT" rev-parse --short HEAD 2>/dev/null || echo "unknown")
    REPORT_BRANCH=$(git -C "$PROJECT_ROOT" symbolic-ref --short HEAD 2>/dev/null || echo "unknown")
}

# @title report_metadata
# @notice Prints collected metadata
report_metadata() {
    print_header "Report Metadata"
    echo -e "  Timestamp  : ${REPORT_TIMESTAMP}"
    echo -e "  Git SHA    : ${REPORT_GIT_SHA}"
    echo -e "  Branch     : ${REPORT_BRANCH}"
    echo -e "  Project    : ${PROJECT_ROOT}"
    echo ""
    return 0
}

# @title report_automation_checks
# @notice Runs security_compliance_automation.sh and records result
# @dev    Skips gracefully when the companion script is not present
report_automation_checks() {
    print_header "Security Compliance Automation"

    if [[ ! -x "$AUTOMATION_SCRIPT" ]]; then
        record_section "automation_checks" "SKIP" "Script not found: ${AUTOMATION_SCRIPT}"
        return 0
    fi

    AUTOMATION_EXIT=0
    AUTOMATION_OUTPUT=$("$AUTOMATION_SCRIPT" --full-audit --project-root "$PROJECT_ROOT" 2>&1) \
        || AUTOMATION_EXIT=$?

    if [[ "$VERBOSE" == "true" ]]; then
        echo "$AUTOMATION_OUTPUT"
    fi

    if [[ $AUTOMATION_EXIT -eq 0 ]]; then
        record_section "automation_checks" "PASS"
    else
        record_section "automation_checks" "FAIL" "Exit code: ${AUTOMATION_EXIT}"
    fi
    return 0
}

# @title report_documentation_checks
# @notice Runs security_compliance_documentation.sh and records result
# @dev    Skips gracefully when the companion script is not present
report_documentation_checks() {
    print_header "Documentation Compliance"

    if [[ ! -x "$DOCUMENTATION_SCRIPT" ]]; then
        record_section "documentation_checks" "SKIP" "Script not found: ${DOCUMENTATION_SCRIPT}"
        return 0
    fi

    DOCUMENTATION_EXIT=0
    DOCUMENTATION_OUTPUT=$("$DOCUMENTATION_SCRIPT" --full-audit --project-root "$PROJECT_ROOT" 2>&1) \
        || DOCUMENTATION_EXIT=$?

    if [[ "$VERBOSE" == "true" ]]; then
        echo "$DOCUMENTATION_OUTPUT"
    fi

    if [[ $DOCUMENTATION_EXIT -eq 0 ]]; then
        record_section "documentation_checks" "PASS"
    else
        record_section "documentation_checks" "FAIL" "Exit code: ${DOCUMENTATION_EXIT}"
    fi
    return 0
}

# @title report_rust_checks
# @notice Validates Rust toolchain checks: fmt, clippy, tests
# @dev    Each step is recorded independently so failures are granular
report_rust_checks() {
    print_header "Rust Toolchain Checks"

    if ! command -v cargo &>/dev/null; then
        record_section "rust_checks" "SKIP" "cargo not available"
        return 0
    fi

    # cargo fmt
    local fmt_exit=0
    cargo fmt --all -- --check &>/dev/null || fmt_exit=$?
    if [[ $fmt_exit -eq 0 ]]; then
        record_section "rust_fmt" "PASS"
    else
        record_section "rust_fmt" "FAIL" "Run 'cargo fmt' to fix"
    fi

    # cargo clippy
    local clippy_exit=0
    cargo clippy --all-targets --all-features -- -D warnings &>/dev/null || clippy_exit=$?
    if [[ $clippy_exit -eq 0 ]]; then
        record_section "rust_clippy" "PASS"
    else
        record_section "rust_clippy" "FAIL" "Clippy warnings detected"
    fi

    # cargo test
    local test_exit=0
    cargo test --workspace &>/dev/null || test_exit=$?
    if [[ $test_exit -eq 0 ]]; then
        record_section "rust_tests" "PASS"
    else
        record_section "rust_tests" "FAIL" "Test suite failed"
    fi
    return 0
}

# @title report_dependency_audit
# @notice Audits npm and cargo dependencies for known vulnerabilities
# @dev    Skips each audit when the relevant tool is unavailable
report_dependency_audit() {
    print_header "Dependency Audit"

    # npm audit
    if command -v npm &>/dev/null && [[ -f "${PROJECT_ROOT}/package.json" ]]; then
        local npm_exit=0
        npm audit --audit-level=moderate --prefix "$PROJECT_ROOT" &>/dev/null || npm_exit=$?
        if [[ $npm_exit -eq 0 ]]; then
            record_section "npm_audit" "PASS"
        else
            record_section "npm_audit" "FAIL" "npm audit found vulnerabilities"
        fi
    else
        record_section "npm_audit" "SKIP" "npm or package.json not available"
    fi

    # cargo audit
    if command -v cargo-audit &>/dev/null; then
        local cargo_audit_exit=0
        cargo audit &>/dev/null || cargo_audit_exit=$?
        if [[ $cargo_audit_exit -eq 0 ]]; then
            record_section "cargo_audit" "PASS"
        else
            record_section "cargo_audit" "FAIL" "cargo audit found vulnerabilities"
        fi
    else
        record_section "cargo_audit" "SKIP" "cargo-audit not installed"
    fi
    return 0
}

# @title emit_json_report
# @notice Emits a JSON-formatted compliance report
# @dev    Written to OUTPUT_FILE when set, otherwise stdout
emit_json_report() {
    local overall="PASS"
    [[ $EXIT_CODE -ne 0 ]] && overall="FAIL"

    # Build sections JSON array
    local sections_json="["
    local first=true
    for entry in "${SECTION_RESULTS[@]}"; do
        local sec_name="${entry%%:*}"
        local sec_status="${entry##*:}"
        if [[ "$first" == "true" ]]; then
            first=false
        else
            sections_json+=","
        fi
        sections_json+="{\"name\":\"${sec_name}\",\"status\":\"${sec_status}\"}"
    done
    sections_json+="]"

    local json
    json=$(cat <<EOF
{
  "report": "${SCRIPT_NAME}",
  "version": "${VERSION}",
  "timestamp": "${REPORT_TIMESTAMP}",
  "git_sha": "${REPORT_GIT_SHA}",
  "branch": "${REPORT_BRANCH}",
  "overall": "${overall}",
  "total_sections": ${TOTAL_SECTIONS},
  "passed": ${PASSED_SECTIONS},
  "failed": ${FAILED_SECTIONS},
  "sections": ${sections_json}
}
EOF
)

    if [[ -n "$OUTPUT_FILE" ]]; then
        echo "$json" > "$OUTPUT_FILE"
        echo -e "  ${COLOR_GREEN}✓${COLOR_RESET} JSON report written to: ${OUTPUT_FILE}"
    else
        echo "$json"
    fi
    return 0
}

# @title print_summary
# @notice Prints the final human-readable compliance summary
print_summary() {
    echo ""
    echo -e "${COLOR_BOLD}─────────────────────────────────────────────────────────────────${COLOR_RESET}"
    echo -e "  ${COLOR_BOLD}COMPLIANCE REPORT SUMMARY${COLOR_RESET}"
    echo -e "${COLOR_BOLD}─────────────────────────────────────────────────────────────────${COLOR_RESET}"
    echo ""
    echo -e "  Total Sections : ${COLOR_BOLD}${TOTAL_SECTIONS}${COLOR_RESET}"
    echo -e "  ${COLOR_GREEN}Passed${COLOR_RESET}         : ${PASSED_SECTIONS}"
    echo -e "  ${COLOR_RED}Failed${COLOR_RESET}         : ${FAILED_SECTIONS}"
    echo ""

    if [[ $EXIT_CODE -eq 0 ]]; then
        echo -e "  ${COLOR_GREEN}${COLOR_BOLD}All compliance checks passed.${COLOR_RESET}"
    else
        echo -e "  ${COLOR_RED}${COLOR_BOLD}Compliance report FAILED.${COLOR_RESET}"
    fi
    echo ""
    return 0
}

# ── Argument Parsing ──────────────────────────────────────────────────────────

parse_args() {
    while [[ $# -gt 0 ]]; do
        case "$1" in
            --full-report)   FULL_REPORT=true ;;
            --verbose)       VERBOSE=true ;;
            --json)          JSON_OUTPUT=true ;;
            --report-only)   REPORT_ONLY="${2:-}"; shift ;;
            --output-file)   OUTPUT_FILE="${2:-}"; shift ;;
            --project-root)  PROJECT_ROOT="${2:-}"; shift ;;
            --version)       echo "${SCRIPT_NAME} v${VERSION}"; exit 0 ;;
            --help|-h)
                echo "Usage: $0 [--full-report] [--verbose] [--json] [--output-file <path>]"
                echo "       $0 --report-only <metadata|automation|documentation|rust|dependencies>"
                exit 0
                ;;
            *) echo "Unknown option: $1" >&2; exit 1 ;;
        esac
        shift
    done

    if [[ -z "$PROJECT_ROOT" ]]; then
        PROJECT_ROOT=$(git rev-parse --show-toplevel 2>/dev/null || pwd)
    fi
}

# ── Main ──────────────────────────────────────────────────────────────────────

main() {
    parse_args "$@"

    echo -e "${COLOR_BOLD}${SCRIPT_NAME} v${VERSION}${COLOR_RESET}"
    echo -e "Project root: ${PROJECT_ROOT}"

    collect_metadata

    if [[ -n "$REPORT_ONLY" ]]; then
        case "$REPORT_ONLY" in
            metadata)      report_metadata ;;
            automation)    report_automation_checks ;;
            documentation) report_documentation_checks ;;
            rust)          report_rust_checks ;;
            dependencies)  report_dependency_audit ;;
            *) echo "Unknown section: $REPORT_ONLY" >&2; exit 1 ;;
        esac
    else
        report_metadata
        report_automation_checks
        report_documentation_checks
        report_rust_checks
        report_dependency_audit
    fi

    if [[ "$JSON_OUTPUT" == "true" || -n "$OUTPUT_FILE" ]]; then
        emit_json_report
    fi

    print_summary

    exit "$EXIT_CODE"
}

main "$@"
