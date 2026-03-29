#!/bin/bash

##############################################################################
# @title security_validation.test.sh
# @notice Comprehensive test suite for security_validation.sh
#
# @dev Tests cover:
#   - Dependency checking
#   - Secret detection
#   - Rust security linting
#   - TypeScript type checking
#   - WASM binary validation
#   - File permissions
#   - Git configuration
#   - License compliance
#   - Code quality
#   - Test coverage
#
# @custom:usage
#   bash scripts/security_validation.test.sh
#
# @custom:exit-codes
#   0 - All tests passed
#   1 - Test failures detected
##############################################################################

set -euo pipefail

# ── Configuration ─────────────────────────────────────────────────────────────

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
SECURITY_SCRIPT="$SCRIPT_DIR/security_validation.sh"

# Color codes
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Test counters
TESTS_PASSED=0
TESTS_FAILED=0

# ── Test Helpers ──────────────────────────────────────────────────────────────

test_pass() {
  echo -e "${GREEN}[✓]${NC} $*"
  ((TESTS_PASSED++))
}

test_fail() {
  echo -e "${RED}[✗]${NC} $*"
  ((TESTS_FAILED++))
}

test_info() {
  echo -e "${BLUE}[TEST]${NC} $*"
}

# ── Unit Tests ────────────────────────────────────────────────────────────────

test_script_exists() {
  test_info "Checking if security_validation.sh exists"
  if [[ -f "$SECURITY_SCRIPT" ]]; then
    test_pass "Script file exists"
  else
    test_fail "Script file not found"
    return 1
  fi
}

test_script_executable() {
  test_info "Checking if script is executable"
  if [[ -x "$SECURITY_SCRIPT" ]]; then
    test_pass "Script is executable"
  else
    test_fail "Script is not executable"
    chmod +x "$SECURITY_SCRIPT"
  fi
}

test_script_syntax() {
  test_info "Checking bash syntax"
  if bash -n "$SECURITY_SCRIPT" 2>/dev/null; then
    test_pass "Bash syntax is valid"
  else
    test_fail "Bash syntax error"
    return 1
  fi
}

test_shebang() {
  test_info "Checking shebang line"
  if head -1 "$SECURITY_SCRIPT" | grep -q "#!/bin/bash"; then
    test_pass "Shebang is correct"
  else
    test_fail "Shebang is incorrect"
    return 1
  fi
}

test_required_functions() {
  test_info "Checking for required functions"
  local required_functions=(
    "check_dependencies"
    "check_secrets"
    "check_rust_security"
    "check_typescript_types"
    "check_wasm_binary"
    "check_file_permissions"
    "check_git_config"
    "check_license_compliance"
    "check_code_quality"
    "check_test_coverage"
    "main"
  )
  
  for func in "${required_functions[@]}"; do
    if grep -q "^$func()" "$SECURITY_SCRIPT"; then
      test_pass "Function $func exists"
    else
      test_fail "Function $func not found"
      return 1
    fi
  done
}

test_error_handling() {
  test_info "Checking error handling"
  if grep -q "set -euo pipefail" "$SECURITY_SCRIPT"; then
    test_pass "Error handling is configured"
  else
    test_fail "Error handling not configured"
    return 1
  fi
}

test_logging_functions() {
  test_info "Checking logging functions"
  local log_functions=(
    "log_info"
    "log_success"
    "log_warning"
    "log_error"
  )
  
  for func in "${log_functions[@]}"; do
    if grep -q "^$func()" "$SECURITY_SCRIPT"; then
      test_pass "Logging function $func exists"
    else
      test_fail "Logging function $func not found"
      return 1
    fi
  done
}

test_color_codes() {
  test_info "Checking color code definitions"
  local colors=(
    "RED"
    "GREEN"
    "YELLOW"
    "BLUE"
    "NC"
  )
  
  for color in "${colors[@]}"; do
    if grep -q "^$color=" "$SECURITY_SCRIPT"; then
      test_pass "Color code $color is defined"
    else
      test_fail "Color code $color not defined"
      return 1
    fi
  done
}

test_counters() {
  test_info "Checking counter variables"
  local counters=(
    "CHECKS_PASSED"
    "CHECKS_FAILED"
    "CHECKS_WARNED"
  )
  
  for counter in "${counters[@]}"; do
    if grep -q "^$counter=" "$SECURITY_SCRIPT"; then
      test_pass "Counter $counter is defined"
    else
      test_fail "Counter $counter not defined"
      return 1
    fi
  done
}

test_configuration_variables() {
  test_info "Checking configuration variables"
  local vars=(
    "SCRIPT_DIR"
    "PROJECT_ROOT"
    "STRICT_MODE"
    "GENERATE_REPORT"
  )
  
  for var in "${vars[@]}"; do
    if grep -q "^$var=" "$SECURITY_SCRIPT"; then
      test_pass "Variable $var is defined"
    else
      test_fail "Variable $var not defined"
      return 1
    fi
  done
}

test_dependency_check() {
  test_info "Checking dependency validation logic"
  if grep -q "npm audit" "$SECURITY_SCRIPT"; then
    test_pass "NPM audit check exists"
  else
    test_fail "NPM audit check not found"
    return 1
  fi
  
  if grep -q "cargo audit" "$SECURITY_SCRIPT"; then
    test_pass "Cargo audit check exists"
  else
    test_fail "Cargo audit check not found"
    return 1
  fi
}

test_secret_detection() {
  test_info "Checking secret detection logic"
  if grep -q "private_key\|secret_key\|api_key" "$SECURITY_SCRIPT"; then
    test_pass "Secret patterns are defined"
  else
    test_fail "Secret patterns not found"
    return 1
  fi
}

test_wasm_validation() {
  test_info "Checking WASM validation logic"
  if grep -q "WebAssembly" "$SECURITY_SCRIPT"; then
    test_pass "WASM validation logic exists"
  else
    test_fail "WASM validation logic not found"
    return 1
  fi
}

test_report_generation() {
  test_info "Checking report generation logic"
  if grep -q "security_validation_report.txt" "$SECURITY_SCRIPT"; then
    test_pass "Report generation logic exists"
  else
    test_fail "Report generation logic not found"
    return 1
  fi
}

test_exit_codes() {
  test_info "Checking exit code handling"
  if grep -q "return 1" "$SECURITY_SCRIPT"; then
    test_pass "Error exit code handling exists"
  else
    test_fail "Error exit code handling not found"
    return 1
  fi
  
  if grep -q "return 0" "$SECURITY_SCRIPT"; then
    test_pass "Success exit code handling exists"
  else
    test_fail "Success exit code handling not found"
    return 1
  fi
}

test_documentation() {
  test_info "Checking documentation"
  if grep -q "@title\|@notice\|@dev\|@custom" "$SECURITY_SCRIPT"; then
    test_pass "NatSpec-style documentation exists"
  else
    test_fail "NatSpec-style documentation not found"
    return 1
  fi
}

test_comments() {
  test_info "Checking code comments"
  local comment_count
  comment_count=$(grep -c "^#" "$SECURITY_SCRIPT" || true)
  if [[ $comment_count -gt 10 ]]; then
    test_pass "Adequate comments found ($comment_count lines)"
  else
    test_fail "Insufficient comments ($comment_count lines)"
  fi
}

test_security_checks_count() {
  test_info "Checking number of security checks"
  local check_count
  check_count=$(grep -c "^check_" "$SECURITY_SCRIPT" || true)
  if [[ $check_count -ge 10 ]]; then
    test_pass "Sufficient security checks ($check_count)"
  else
    test_fail "Insufficient security checks ($check_count)"
    return 1
  fi
}

# ── Integration Tests ─────────────────────────────────────────────────────────

test_script_runs() {
  test_info "Testing if script runs without errors"
  if bash "$SECURITY_SCRIPT" > /dev/null 2>&1; then
    test_pass "Script executes successfully"
  else
    test_fail "Script execution failed"
    return 1
  fi
}

test_strict_mode() {
  test_info "Testing strict mode flag"
  if bash "$SECURITY_SCRIPT" --strict > /dev/null 2>&1; then
    test_pass "Strict mode flag works"
  else
    test_fail "Strict mode flag failed"
  fi
}

test_report_flag() {
  test_info "Testing report generation flag"
  if bash "$SECURITY_SCRIPT" --report > /dev/null 2>&1; then
    test_pass "Report flag works"
  else
    test_fail "Report flag failed"
  fi
}

test_output_format() {
  test_info "Checking output format"
  local output
  output=$(bash "$SECURITY_SCRIPT" 2>&1 || true)
  
  if echo "$output" | grep -q "\[INFO\]\|\[✓\]\|\[✗\]\|\[⚠\]"; then
    test_pass "Output format is correct"
  else
    test_fail "Output format is incorrect"
  fi
}

# ── Main Test Execution ───────────────────────────────────────────────────────

main() {
  echo "Running security_validation.sh test suite"
  echo "=========================================="
  echo ""
  
  # Unit tests
  test_script_exists
  test_script_executable
  test_script_syntax
  test_shebang
  test_required_functions
  test_error_handling
  test_logging_functions
  test_color_codes
  test_counters
  test_configuration_variables
  test_dependency_check
  test_secret_detection
  test_wasm_validation
  test_report_generation
  test_exit_codes
  test_documentation
  test_comments
  test_security_checks_count
  
  echo ""
  echo "Integration Tests"
  echo "================="
  
  # Integration tests
  test_script_runs
  test_strict_mode
  test_report_flag
  test_output_format
  
  echo ""
  echo "Test Summary"
  echo "============"
  echo "Passed: $TESTS_PASSED"
  echo "Failed: $TESTS_FAILED"
  
  if [[ $TESTS_FAILED -eq 0 ]]; then
    echo -e "${GREEN}All tests passed!${NC}"
    return 0
  else
    echo -e "${RED}Some tests failed!${NC}"
    return 1
  fi
}

# Execute main function
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
  main "$@"
fi
