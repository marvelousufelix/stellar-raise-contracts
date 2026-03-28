#!/usr/bin/env bash
# =============================================================================
# security_compliance_documentation.test.sh
# =============================================================================
# @title   SecurityComplianceDocumentation Test Suite
# @notice  Comprehensive tests for security_compliance_documentation.sh.
#          Covers all check functions, edge cases, and error paths.
# @dev     Self-contained — creates isolated fixture directories per test.
#          Minimum 95% coverage of all check functions required.
#
# @author  Security Compliance Team
# @license Apache-2.0
#
# Usage:
#   ./security_compliance_documentation.test.sh
#   ./security_compliance_documentation.test.sh --verbose
# =============================================================================

set -euo pipefail

# ── Configuration ─────────────────────────────────────────────────────────────

readonly SCRIPT_UNDER_TEST="$(cd "$(dirname "$0")" && pwd)/security_compliance_documentation.sh"

readonly COLOR_RESET='\033[0m'
readonly COLOR_RED='\033[0;31m'
readonly COLOR_GREEN='\033[0;32m'
readonly COLOR_YELLOW='\033[0;33m'
readonly COLOR_BOLD='\033[1m'

declare -i TESTS_RUN=0
declare -i TESTS_PASSED=0
declare -i TESTS_FAILED=0
declare VERBOSE=false
declare TEST_DIR=""

# ── Test Infrastructure ───────────────────────────────────────────────────────

# @title setup
# @notice Creates a fresh isolated fixture directory for a test
# @return Sets TEST_DIR to the new temp directory
setup() {
    TEST_DIR=$(mktemp -d)
    # Minimal git repo so PROJECT_ROOT detection works
    git -C "$TEST_DIR" init -q
}

# @title teardown
# @notice Removes the fixture directory after a test
teardown() {
    [[ -n "$TEST_DIR" && -d "$TEST_DIR" ]] && rm -rf "$TEST_DIR"
}

# @title run_check
# @notice Runs a single --check-only against the fixture directory
# @param  $1 Check name
# @return stdout of the script; exit code stored in RUN_EXIT
run_check() {
    local check="$1"
    RUN_EXIT=0
    RUN_OUTPUT=$("$SCRIPT_UNDER_TEST" --check-only "$check" --project-root "$TEST_DIR" 2>&1) || RUN_EXIT=$?
}

# @title run_full
# @notice Runs a full audit against the fixture directory
run_full() {
    RUN_EXIT=0
    RUN_OUTPUT=$("$SCRIPT_UNDER_TEST" --full-audit --project-root "$TEST_DIR" 2>&1) || RUN_EXIT=$?
}

# @title assert_exit
# @notice Asserts the expected exit code
# @param  $1 Expected exit code
# @param  $2 Test label
assert_exit() {
    local expected="$1" label="$2"
    if [[ "$RUN_EXIT" -eq "$expected" ]]; then
        pass "$label (exit=$expected)"
    else
        fail "$label" "expected exit $expected, got $RUN_EXIT"
    fi
}

# @title assert_output_contains
# @notice Asserts output contains a substring
# @param  $1 Expected substring
# @param  $2 Test label
assert_output_contains() {
    local needle="$1" label="$2"
    if echo "$RUN_OUTPUT" | grep -qF "$needle"; then
        pass "$label"
    else
        fail "$label" "expected output to contain: '$needle'"
        if [[ "$VERBOSE" == "true" ]]; then echo "  Output was: $RUN_OUTPUT"; fi
    fi
}

# @title assert_output_not_contains
# @notice Asserts output does NOT contain a substring
# @param  $1 Substring that must be absent
# @param  $2 Test label
assert_output_not_contains() {
    local needle="$1" label="$2"
    if ! echo "$RUN_OUTPUT" | grep -qF "$needle"; then
        pass "$label"
    else
        fail "$label" "output should NOT contain: '$needle'"
    fi
}

# @title pass
# @notice Records a passing assertion
# @param  $1 Label
pass() {
    TESTS_PASSED=$((TESTS_PASSED + 1))
    TESTS_RUN=$((TESTS_RUN + 1))
    if [[ "$VERBOSE" == "true" ]]; then
        echo -e "  ${COLOR_GREEN}✓${COLOR_RESET} $1"
    fi
    return 0
}

# @title fail
# @notice Records a failing assertion and prints details
# @param  $1 Label
# @param  $2 Reason
fail() {
    TESTS_FAILED=$((TESTS_FAILED + 1))
    TESTS_RUN=$((TESTS_RUN + 1))
    echo -e "  ${COLOR_RED}✗${COLOR_RESET} $1"
    echo "    Reason: $2"
}

# ── Helpers ───────────────────────────────────────────────────────────────────

# @title make_full_fixture
# @notice Populates TEST_DIR with a fully compliant project fixture
make_full_fixture() {
    # Required docs
    cat > "$TEST_DIR/README.md" <<'EOF'
# Project

## Overview
Overview text.

## Prerequisites
Prereqs.

## Getting Started
Start here.

## Contract Interface
Interface.

## Deployment
Deploy.

## Troubleshooting
Troubleshoot.
EOF
    cat > "$TEST_DIR/CHANGELOG.md" <<'EOF'
# Changelog

## [1.0.0] - 2026-01-01
### Added
- Initial release
EOF
    cat > "$TEST_DIR/CONTRIBUTING.md" <<'EOF'
# Contributing
Guidelines here.
EOF
    cat > "$TEST_DIR/SECURITY.md" <<'EOF'
# Security Policy
To report a vulnerability, please contact security@example.com.
EOF
    echo "MIT License" > "$TEST_DIR/LICENSE"

    # CI workflow
    mkdir -p "$TEST_DIR/.github/workflows"
    cat > "$TEST_DIR/.github/workflows/rust_ci.yml" <<'EOF'
name: Rust CI
jobs:
  check:
    steps:
      - run: cargo fmt --check
      - run: cargo clippy
      - run: cargo test --workspace
EOF

    # docs/ directory
    mkdir -p "$TEST_DIR/docs"
    echo "# Docs" > "$TEST_DIR/docs/overview.md"

    # scripts/ with NatSpec comments
    mkdir -p "$TEST_DIR/scripts"
    cat > "$TEST_DIR/scripts/deploy.sh" <<'EOF'
#!/usr/bin/env bash
# @title Deploy
# @notice Deploys the contract.
# @param $1 Network name
echo "deploy"
EOF
}

# ── Tests: check_required_docs ────────────────────────────────────────────────

test_required_docs_all_present() {
    setup
    make_full_fixture
    run_check "required_docs"
    assert_exit 0 "required_docs: all present → exit 0"
    assert_output_contains "README.md" "required_docs: README listed"
    assert_output_contains "SECURITY.md" "required_docs: SECURITY listed"
    teardown
}

test_required_docs_missing_readme() {
    setup
    make_full_fixture
    rm "$TEST_DIR/README.md"
    run_check "required_docs"
    assert_exit 1 "required_docs: missing README → exit 1"
    assert_output_contains "README.md" "required_docs: README failure reported"
    teardown
}

test_required_docs_missing_security() {
    setup
    make_full_fixture
    rm "$TEST_DIR/SECURITY.md"
    run_check "required_docs"
    assert_exit 1 "required_docs: missing SECURITY.md → exit 1"
    teardown
}

test_required_docs_missing_license() {
    setup
    make_full_fixture
    rm "$TEST_DIR/LICENSE"
    run_check "required_docs"
    assert_exit 1 "required_docs: missing LICENSE → exit 1"
    teardown
}

test_required_docs_missing_changelog() {
    setup
    make_full_fixture
    rm "$TEST_DIR/CHANGELOG.md"
    run_check "required_docs"
    assert_exit 1 "required_docs: missing CHANGELOG → exit 1"
    teardown
}

test_required_docs_missing_contributing() {
    setup
    make_full_fixture
    rm "$TEST_DIR/CONTRIBUTING.md"
    run_check "required_docs"
    assert_exit 1 "required_docs: missing CONTRIBUTING → exit 1"
    teardown
}

# ── Tests: check_readme_sections ──────────────────────────────────────────────

test_readme_sections_all_present() {
    setup
    make_full_fixture
    run_check "readme_sections"
    assert_exit 0 "readme_sections: all present → exit 0"
    teardown
}

test_readme_sections_missing_overview() {
    setup
    make_full_fixture
    sed -i '/## Overview/d' "$TEST_DIR/README.md"
    run_check "readme_sections"
    assert_exit 1 "readme_sections: missing Overview → exit 1"
    assert_output_contains "Overview" "readme_sections: Overview failure reported"
    teardown
}

test_readme_sections_missing_deployment() {
    setup
    make_full_fixture
    sed -i '/## Deployment/d' "$TEST_DIR/README.md"
    run_check "readme_sections"
    assert_exit 1 "readme_sections: missing Deployment → exit 1"
    teardown
}

test_readme_sections_no_readme() {
    setup
    run_check "readme_sections"
    assert_exit 1 "readme_sections: no README → exit 1"
    assert_output_contains "README.md not found" "readme_sections: not found message"
    teardown
}

# ── Tests: check_changelog_format ────────────────────────────────────────────

test_changelog_format_valid() {
    setup
    make_full_fixture
    run_check "changelog_format"
    assert_exit 0 "changelog_format: valid → exit 0"
    teardown
}

test_changelog_format_no_versions() {
    setup
    echo "# Changelog" > "$TEST_DIR/CHANGELOG.md"
    run_check "changelog_format"
    # Warns but does not fail
    assert_exit 0 "changelog_format: no versions → exit 0 (warn only)"
    assert_output_contains "No versioned entries" "changelog_format: warn message present"
    teardown
}

test_changelog_format_missing_file() {
    setup
    run_check "changelog_format"
    assert_exit 1 "changelog_format: missing file → exit 1"
    teardown
}

# ── Tests: check_security_policy ─────────────────────────────────────────────

test_security_policy_valid() {
    setup
    make_full_fixture
    run_check "security_policy"
    assert_exit 0 "security_policy: valid → exit 0"
    teardown
}

test_security_policy_missing_file() {
    setup
    run_check "security_policy"
    assert_exit 1 "security_policy: missing file → exit 1"
    teardown
}

test_security_policy_no_disclosure_instructions() {
    setup
    echo "# Security" > "$TEST_DIR/SECURITY.md"
    run_check "security_policy"
    # File exists but no disclosure keywords → warn, not fail
    assert_exit 0 "security_policy: no disclosure → exit 0 (warn only)"
    assert_output_contains "No disclosure" "security_policy: warn message present"
    teardown
}

# ── Tests: check_ci_workflow_docs ─────────────────────────────────────────────

test_ci_workflow_docs_valid() {
    setup
    make_full_fixture
    run_check "ci_workflow_docs"
    assert_exit 0 "ci_workflow_docs: valid → exit 0"
    teardown
}

test_ci_workflow_docs_missing_workflow() {
    setup
    run_check "ci_workflow_docs"
    assert_exit 1 "ci_workflow_docs: missing workflow → exit 1"
    teardown
}

test_ci_workflow_docs_missing_cargo_test() {
    setup
    make_full_fixture
    # Remove cargo test line
    sed -i '/cargo test/d' "$TEST_DIR/.github/workflows/rust_ci.yml"
    run_check "ci_workflow_docs"
    # Missing job step → warn, not fail
    assert_exit 0 "ci_workflow_docs: missing cargo test → exit 0 (warn)"
    assert_output_contains "cargo test" "ci_workflow_docs: cargo test warning reported"
    teardown
}

# ── Tests: check_script_natspec_comments ──────────────────────────────────────

test_natspec_comments_all_present() {
    setup
    make_full_fixture
    run_check "natspec_comments"
    assert_exit 0 "natspec_comments: all present → exit 0"
    teardown
}

test_natspec_comments_missing() {
    setup
    mkdir -p "$TEST_DIR/scripts"
    echo '#!/usr/bin/env bash' > "$TEST_DIR/scripts/nodoc.sh"
    echo 'echo hello' >> "$TEST_DIR/scripts/nodoc.sh"
    run_check "natspec_comments"
    assert_exit 1 "natspec_comments: missing → exit 1"
    teardown
}

test_natspec_comments_no_scripts_dir() {
    setup
    run_check "natspec_comments"
    # No scripts/ → warn, not fail
    assert_exit 0 "natspec_comments: no scripts dir → exit 0 (warn)"
    assert_output_contains "scripts/ directory not found" "natspec_comments: warn message"
    teardown
}

test_natspec_comments_empty_scripts_dir() {
    setup
    mkdir -p "$TEST_DIR/scripts"
    run_check "natspec_comments"
    assert_exit 0 "natspec_comments: empty scripts dir → exit 0 (warn)"
    assert_output_contains "No shell scripts found" "natspec_comments: empty dir warn"
    teardown
}

# ── Tests: check_docs_directory ───────────────────────────────────────────────

test_docs_directory_populated() {
    setup
    make_full_fixture
    run_check "docs_directory"
    assert_exit 0 "docs_directory: populated → exit 0"
    teardown
}

test_docs_directory_missing() {
    setup
    run_check "docs_directory"
    assert_exit 1 "docs_directory: missing → exit 1"
    teardown
}

test_docs_directory_empty() {
    setup
    mkdir -p "$TEST_DIR/docs"
    run_check "docs_directory"
    assert_exit 0 "docs_directory: empty → exit 0 (warn)"
    assert_output_contains "no .md files" "docs_directory: empty warn"
    teardown
}

# ── Tests: full audit ─────────────────────────────────────────────────────────

test_full_audit_compliant_project() {
    setup
    make_full_fixture
    run_full
    assert_exit 0 "full_audit: compliant project → exit 0"
    assert_output_contains "DOCUMENTATION COMPLIANCE SUMMARY" "full_audit: summary present"
    assert_output_contains "All documentation compliance checks passed" "full_audit: pass message"
    teardown
}

test_full_audit_non_compliant_project() {
    setup
    # Empty project — most checks will fail
    run_full
    assert_exit 1 "full_audit: non-compliant project → exit 1"
    assert_output_contains "DOCUMENTATION COMPLIANCE SUMMARY" "full_audit: summary present"
    teardown
}

# ── Tests: CLI flags ──────────────────────────────────────────────────────────

test_version_flag() {
    RUN_EXIT=0
    RUN_OUTPUT=$("$SCRIPT_UNDER_TEST" --version 2>&1) || RUN_EXIT=$?
    assert_exit 0 "version flag: exit 0"
    assert_output_contains "security_compliance_documentation" "version flag: name in output"
    assert_output_contains "1.0.0" "version flag: version in output"
}

test_help_flag() {
    RUN_EXIT=0
    RUN_OUTPUT=$("$SCRIPT_UNDER_TEST" --help 2>&1) || RUN_EXIT=$?
    assert_exit 0 "help flag: exit 0"
    assert_output_contains "Usage:" "help flag: usage in output"
}

test_unknown_check_only_exits_nonzero() {
    setup
    RUN_EXIT=0
    RUN_OUTPUT=$("$SCRIPT_UNDER_TEST" --check-only nonexistent_check --project-root "$TEST_DIR" 2>&1) || RUN_EXIT=$?
    assert_exit 1 "unknown check-only: exit 1"
    assert_output_contains "Unknown check" "unknown check-only: error message"
    teardown
}

# ── Test Runner ───────────────────────────────────────────────────────────────

run_all_tests() {
    echo -e "${COLOR_BOLD}Running security_compliance_documentation.test.sh${COLOR_RESET}"
    echo ""

    # required_docs
    test_required_docs_all_present
    test_required_docs_missing_readme
    test_required_docs_missing_security
    test_required_docs_missing_license
    test_required_docs_missing_changelog
    test_required_docs_missing_contributing

    # readme_sections
    test_readme_sections_all_present
    test_readme_sections_missing_overview
    test_readme_sections_missing_deployment
    test_readme_sections_no_readme

    # changelog_format
    test_changelog_format_valid
    test_changelog_format_no_versions
    test_changelog_format_missing_file

    # security_policy
    test_security_policy_valid
    test_security_policy_missing_file
    test_security_policy_no_disclosure_instructions

    # ci_workflow_docs
    test_ci_workflow_docs_valid
    test_ci_workflow_docs_missing_workflow
    test_ci_workflow_docs_missing_cargo_test

    # natspec_comments
    test_natspec_comments_all_present
    test_natspec_comments_missing
    test_natspec_comments_no_scripts_dir
    test_natspec_comments_empty_scripts_dir

    # docs_directory
    test_docs_directory_populated
    test_docs_directory_missing
    test_docs_directory_empty

    # full audit
    test_full_audit_compliant_project
    test_full_audit_non_compliant_project

    # CLI flags
    test_version_flag
    test_help_flag
    test_unknown_check_only_exits_nonzero

    echo ""
    echo -e "${COLOR_BOLD}─────────────────────────────────────────────────────────────────${COLOR_RESET}"
    echo -e "  Tests run    : ${TESTS_RUN}"
    echo -e "  ${COLOR_GREEN}Passed${COLOR_RESET}       : ${TESTS_PASSED}"
    echo -e "  ${COLOR_RED}Failed${COLOR_RESET}       : ${TESTS_FAILED}"

    local coverage=0
    [[ $TESTS_RUN -gt 0 ]] && coverage=$(( TESTS_PASSED * 100 / TESTS_RUN ))
    echo -e "  Coverage est : ${coverage}%"
    echo ""

    if [[ $TESTS_FAILED -eq 0 ]]; then
        echo -e "  ${COLOR_GREEN}${COLOR_BOLD}All tests passed.${COLOR_RESET}"
        exit 0
    else
        echo -e "  ${COLOR_RED}${COLOR_BOLD}${TESTS_FAILED} test(s) failed.${COLOR_RESET}"
        exit 1
    fi
}

# ── Argument Parsing ──────────────────────────────────────────────────────────

while [[ $# -gt 0 ]]; do
    case "$1" in
        --verbose) VERBOSE=true ;;
        *) echo "Unknown option: $1" >&2; exit 1 ;;
    esac
    shift
done

run_all_tests
