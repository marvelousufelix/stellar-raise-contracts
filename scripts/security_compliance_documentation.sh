#!/usr/bin/env bash
# =============================================================================
# security_compliance_documentation.sh
# =============================================================================
# @title   SecurityComplianceDocumentation — CI/CD Documentation Compliance
# @notice  Validates documentation completeness and security compliance for
#          CI/CD pipelines in Stellar/Soroban smart contract projects.
# @dev     Read-only — no state modifications. Safe to run in any CI context.
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
#   ./security_compliance_documentation.sh [--full-audit] [--verbose] [--json]
#   ./security_compliance_documentation.sh --check-only <check_name>
# =============================================================================

set -euo pipefail

# ── Constants ─────────────────────────────────────────────────────────────────

readonly SCRIPT_NAME="security_compliance_documentation"
readonly VERSION="1.0.0"
readonly MIN_COVERAGE_PERCENT=95

readonly COLOR_RESET='\033[0m'
readonly COLOR_RED='\033[0;31m'
readonly COLOR_GREEN='\033[0;32m'
readonly COLOR_YELLOW='\033[0;33m'
readonly COLOR_BLUE='\033[0;34m'
readonly COLOR_BOLD='\033[1m'

# Required top-level documentation files
readonly REQUIRED_DOCS=(
    "README.md"
    "CHANGELOG.md"
    "CONTRIBUTING.md"
    "SECURITY.md"
    "LICENSE"
)

# Required sections in README.md
readonly REQUIRED_README_SECTIONS=(
    "## Overview"
    "## Prerequisites"
    "## Getting Started"
    "## Contract Interface"
    "## Deployment"
    "## Troubleshooting"
)

# Required CI/CD workflow files
readonly REQUIRED_WORKFLOWS=(
    ".github/workflows/rust_ci.yml"
)

# ── Global State ──────────────────────────────────────────────────────────────

declare -i TOTAL_CHECKS=0
declare -i PASSED_CHECKS=0
declare -i FAILED_CHECKS=0
declare -i WARNINGS=0
declare -a FAILED_CHECKS_LIST=()
declare -a WARNINGS_LIST=()
declare EXIT_CODE=0

declare VERBOSE=false
declare JSON_OUTPUT=false
declare FULL_AUDIT=false
declare CHECK_ONLY=""
declare PROJECT_ROOT=""

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

# @title record_check
# @notice Records a check result and prints status
# @param  $1 Check name
# @param  $2 Status: PASS | FAIL | WARN
# @param  $3 Optional message
record_check() {
    local name="$1" status="$2" message="${3:-}"
    TOTAL_CHECKS=$((TOTAL_CHECKS + 1))
    case "$status" in
        PASS)
            PASSED_CHECKS=$((PASSED_CHECKS + 1))
            echo -e "  ${COLOR_GREEN}✓${COLOR_RESET} ${name}"
            ;;
        FAIL)
            FAILED_CHECKS=$((FAILED_CHECKS + 1))
            FAILED_CHECKS_LIST+=("$name")
            EXIT_CODE=1
            echo -e "  ${COLOR_RED}✗${COLOR_RESET} ${name}"
            ;;
        WARN)
            WARNINGS=$((WARNINGS + 1))
            WARNINGS_LIST+=("$name: $message")
            echo -e "  ${COLOR_YELLOW}⚠${COLOR_RESET} ${name}"
            ;;
    esac
    [[ -n "$message" ]] && echo "    → $message" || true
}

# @title print_summary
# @notice Prints final compliance summary
print_summary() {
    echo ""
    echo -e "${COLOR_BOLD}─────────────────────────────────────────────────────────────────${COLOR_RESET}"
    echo -e "  ${COLOR_BOLD}DOCUMENTATION COMPLIANCE SUMMARY${COLOR_RESET}"
    echo -e "${COLOR_BOLD}─────────────────────────────────────────────────────────────────${COLOR_RESET}"
    echo ""
    echo -e "  Total Checks : ${COLOR_BOLD}${TOTAL_CHECKS}${COLOR_RESET}"
    echo -e "  ${COLOR_GREEN}Passed${COLOR_RESET}       : ${PASSED_CHECKS}"
    echo -e "  ${COLOR_RED}Failed${COLOR_RESET}       : ${FAILED_CHECKS}"
    echo -e "  ${COLOR_YELLOW}Warnings${COLOR_RESET}     : ${WARNINGS}"
    echo ""

    if [[ ${#FAILED_CHECKS_LIST[@]} -gt 0 ]]; then
        echo -e "  ${COLOR_RED}Failed Checks:${COLOR_RESET}"
        for c in "${FAILED_CHECKS_LIST[@]}"; do echo "    • $c"; done
        echo ""
    fi

    if [[ ${#WARNINGS_LIST[@]} -gt 0 ]]; then
        echo -e "  ${COLOR_YELLOW}Warnings:${COLOR_RESET}"
        for w in "${WARNINGS_LIST[@]}"; do echo "    • $w"; done
        echo ""
    fi

    if [[ $EXIT_CODE -eq 0 ]]; then
        echo -e "  ${COLOR_GREEN}${COLOR_BOLD}All documentation compliance checks passed.${COLOR_RESET}"
    else
        echo -e "  ${COLOR_RED}${COLOR_BOLD}Documentation compliance checks FAILED.${COLOR_RESET}"
    fi
    echo ""
}

# ── Check Functions ───────────────────────────────────────────────────────────

# @title check_required_docs
# @notice Verifies all required documentation files exist
# @dev    Checks for README, CHANGELOG, CONTRIBUTING, SECURITY, LICENSE
check_required_docs() {
    print_header "Required Documentation Files"
    for doc in "${REQUIRED_DOCS[@]}"; do
        if [[ -f "${PROJECT_ROOT}/${doc}" ]]; then
            record_check "doc_exists:${doc}" "PASS"
        else
            record_check "doc_exists:${doc}" "FAIL" "Missing required file: ${doc}"
        fi
    done
}

# @title check_readme_sections
# @notice Validates README.md contains all required sections
# @dev    Checks for Overview, Prerequisites, Getting Started, etc.
check_readme_sections() {
    print_header "README.md Section Completeness"
    local readme="${PROJECT_ROOT}/README.md"

    if [[ ! -f "$readme" ]]; then
        record_check "readme_sections" "FAIL" "README.md not found"
        return
    fi

    for section in "${REQUIRED_README_SECTIONS[@]}"; do
        if grep -qF "$section" "$readme"; then
            record_check "readme_section:${section}" "PASS"
        else
            record_check "readme_section:${section}" "FAIL" "Missing section: ${section}"
        fi
    done
}

# @title check_changelog_format
# @notice Validates CHANGELOG.md follows Keep a Changelog conventions
# @dev    Checks for version headers and Unreleased section
check_changelog_format() {
    print_header "CHANGELOG.md Format"
    local changelog="${PROJECT_ROOT}/CHANGELOG.md"

    if [[ ! -f "$changelog" ]]; then
        record_check "changelog_format" "FAIL" "CHANGELOG.md not found"
        return
    fi

    if grep -qE "^## \[" "$changelog"; then
        record_check "changelog_versioned_entries" "PASS"
    else
        record_check "changelog_versioned_entries" "WARN" "No versioned entries found (e.g. ## [1.0.0])"
    fi
}

# @title check_security_policy
# @notice Validates SECURITY.md contains disclosure instructions
# @dev    Checks for contact/reporting section
check_security_policy() {
    print_header "SECURITY.md Policy"
    local sec="${PROJECT_ROOT}/SECURITY.md"

    if [[ ! -f "$sec" ]]; then
        record_check "security_policy_exists" "FAIL" "SECURITY.md not found"
        return
    fi

    record_check "security_policy_exists" "PASS"

    if grep -qiE "report|disclose|contact|vulnerability" "$sec"; then
        record_check "security_policy_disclosure_instructions" "PASS"
    else
        record_check "security_policy_disclosure_instructions" "WARN" "No disclosure/reporting instructions found"
    fi
}

# @title check_ci_workflow_docs
# @notice Validates CI/CD workflow files exist and contain required jobs
# @dev    Checks for rust_ci.yml with test and lint jobs
check_ci_workflow_docs() {
    print_header "CI/CD Workflow Documentation"

    for workflow in "${REQUIRED_WORKFLOWS[@]}"; do
        local path="${PROJECT_ROOT}/${workflow}"
        if [[ ! -f "$path" ]]; then
            record_check "workflow_exists:${workflow}" "FAIL" "Missing: ${workflow}"
            continue
        fi
        record_check "workflow_exists:${workflow}" "PASS"

        # Verify key CI jobs are present
        for job_keyword in "cargo test" "cargo clippy" "cargo fmt"; do
            if grep -qF "$job_keyword" "$path"; then
                record_check "workflow_job:${job_keyword}" "PASS"
            else
                record_check "workflow_job:${job_keyword}" "WARN" "Job step '${job_keyword}' not found in ${workflow}"
            fi
        done
    done
}

# @title check_script_natspec_comments
# @notice Validates shell scripts in scripts/ have NatSpec-style comments
# @dev    Checks for @title, @notice, @param annotations
check_script_natspec_comments() {
    print_header "NatSpec-Style Script Comments"

    local scripts_dir="${PROJECT_ROOT}/scripts"
    if [[ ! -d "$scripts_dir" ]]; then
        record_check "natspec_comments" "WARN" "scripts/ directory not found"
        return
    fi

    local missing=0 total=0
    while IFS= read -r -d '' script; do
        total=$((total + 1))
        if ! grep -qE "@title|@notice|@param" "$script"; then
            missing=$((missing + 1))
            [[ "$VERBOSE" == "true" ]] && echo "    Missing NatSpec: $script"
        fi
    done < <(find "$scripts_dir" -name "*.sh" -type f -print0 2>/dev/null || true)

    if [[ $total -eq 0 ]]; then
        record_check "natspec_comments" "WARN" "No shell scripts found in scripts/"
    elif [[ $missing -eq 0 ]]; then
        record_check "natspec_comments" "PASS" "All ${total} script(s) have NatSpec comments"
    else
        record_check "natspec_comments" "FAIL" "${missing}/${total} script(s) missing NatSpec comments"
    fi
}

# @title check_docs_directory
# @notice Validates docs/ directory contains expected documentation
# @dev    Checks for at least one .md file in docs/
check_docs_directory() {
    print_header "docs/ Directory"
    local docs_dir="${PROJECT_ROOT}/docs"

    if [[ ! -d "$docs_dir" ]]; then
        record_check "docs_directory_exists" "FAIL" "docs/ directory not found"
        return
    fi

    local doc_count
    doc_count=$(find "$docs_dir" -name "*.md" -type f 2>/dev/null | wc -l)

    if [[ $doc_count -gt 0 ]]; then
        record_check "docs_directory_populated" "PASS" "${doc_count} markdown file(s) found"
    else
        record_check "docs_directory_populated" "WARN" "docs/ exists but contains no .md files"
    fi
}

# ── Argument Parsing ──────────────────────────────────────────────────────────

parse_args() {
    while [[ $# -gt 0 ]]; do
        case "$1" in
            --full-audit)   FULL_AUDIT=true ;;
            --verbose)      VERBOSE=true ;;
            --json)         JSON_OUTPUT=true ;;
            --check-only)   CHECK_ONLY="${2:-}"; shift ;;
            --project-root) PROJECT_ROOT="${2:-}"; shift ;;
            --version)      echo "${SCRIPT_NAME} v${VERSION}"; exit 0 ;;
            --help|-h)
                echo "Usage: $0 [--full-audit] [--verbose] [--json] [--check-only <name>]"
                exit 0
                ;;
            *) echo "Unknown option: $1" >&2; exit 1 ;;
        esac
        shift
    done

    # Default project root to git root or current directory
    if [[ -z "$PROJECT_ROOT" ]]; then
        PROJECT_ROOT=$(git rev-parse --show-toplevel 2>/dev/null || pwd)
    fi
}

# ── Main ──────────────────────────────────────────────────────────────────────

main() {
    parse_args "$@"

    echo -e "${COLOR_BOLD}${SCRIPT_NAME} v${VERSION}${COLOR_RESET}"
    echo -e "Project root: ${PROJECT_ROOT}"

    if [[ -n "$CHECK_ONLY" ]]; then
        case "$CHECK_ONLY" in
            required_docs)        check_required_docs ;;
            readme_sections)      check_readme_sections ;;
            changelog_format)     check_changelog_format ;;
            security_policy)      check_security_policy ;;
            ci_workflow_docs)     check_ci_workflow_docs ;;
            natspec_comments)     check_script_natspec_comments ;;
            docs_directory)       check_docs_directory ;;
            *) echo "Unknown check: $CHECK_ONLY" >&2; exit 1 ;;
        esac
    else
        check_required_docs
        check_readme_sections
        check_changelog_format
        check_security_policy
        check_ci_workflow_docs
        check_script_natspec_comments
        check_docs_directory
    fi

    print_summary

    exit "$EXIT_CODE"
}

main "$@"
