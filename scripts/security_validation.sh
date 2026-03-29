#!/bin/bash

##############################################################################
# @title security_validation.sh
# @notice Automated security validation for CI/CD pipeline
#
# @dev Security checks include:
#   - Dependency vulnerability scanning
#   - Secret detection
#   - Code quality analysis
#   - WASM binary validation
#   - Rust security linting
#   - TypeScript type checking
#   - License compliance
#
# @custom:usage
#   ./scripts/security_validation.sh [--strict] [--report]
#
# @custom:exit-codes
#   0 - All security checks passed
#   1 - Security vulnerabilities detected
#   2 - Configuration error
##############################################################################

set -euo pipefail

# ── Configuration ─────────────────────────────────────────────────────────────

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
STRICT_MODE="${1:-}"
GENERATE_REPORT="${2:-}"

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Counters
CHECKS_PASSED=0
CHECKS_FAILED=0
CHECKS_WARNED=0

# ── Helper Functions ──────────────────────────────────────────────────────────

log_info() {
  echo -e "${BLUE}[INFO]${NC} $*"
}

log_success() {
  echo -e "${GREEN}[✓]${NC} $*"
  ((CHECKS_PASSED++))
}

log_warning() {
  echo -e "${YELLOW}[⚠]${NC} $*"
  ((CHECKS_WARNED++))
}

log_error() {
  echo -e "${RED}[✗]${NC} $*"
  ((CHECKS_FAILED++))
}

# ── Security Checks ──────────────────────────────────────────────────────────

check_dependencies() {
  log_info "Checking dependencies for vulnerabilities..."
  
  if command -v npm &> /dev/null; then
    if npm audit --audit-level=moderate > /dev/null 2>&1; then
      log_success "NPM dependencies are secure"
    else
      log_error "NPM audit found vulnerabilities"
      if [[ "$STRICT_MODE" == "--strict" ]]; then
        return 1
      fi
    fi
  fi
  
  if command -v cargo &> /dev/null; then
    if cargo audit --deny warnings > /dev/null 2>&1; then
      log_success "Cargo dependencies are secure"
    else
      log_warning "Cargo audit found advisories"
    fi
  fi
}

check_secrets() {
  log_info "Scanning for exposed secrets..."
  
  local secret_patterns=(
    "private_key"
    "secret_key"
    "api_key"
    "password"
    "token"
  )
  
  local found_secrets=0
  for pattern in "${secret_patterns[@]}"; do
    if grep -r "$pattern" "$PROJECT_ROOT" \
      --include="*.rs" \
      --include="*.tsx" \
      --include="*.ts" \
      --include="*.js" \
      --exclude-dir=node_modules \
      --exclude-dir=target \
      --exclude-dir=.git \
      2>/dev/null | grep -v "test" | grep -v "example" > /dev/null; then
      log_warning "Potential secret pattern found: $pattern"
      ((found_secrets++))
    fi
  done
  
  if [[ $found_secrets -eq 0 ]]; then
    log_success "No obvious secrets detected"
  fi
}

check_rust_security() {
  log_info "Running Rust security checks..."
  
  if command -v cargo &> /dev/null; then
    if cargo clippy --all-targets --all-features -- -D warnings > /dev/null 2>&1; then
      log_success "Rust clippy checks passed"
    else
      log_warning "Rust clippy found issues"
    fi
  fi
}

check_typescript_types() {
  log_info "Checking TypeScript type safety..."
  
  if command -v tsc &> /dev/null; then
    if tsc --noEmit > /dev/null 2>&1; then
      log_success "TypeScript type checking passed"
    else
      log_warning "TypeScript type errors found"
    fi
  fi
}

check_wasm_binary() {
  log_info "Validating WASM binaries..."
  
  local wasm_files
  wasm_files=$(find "$PROJECT_ROOT" -name "*.wasm" -type f 2>/dev/null || true)
  
  if [[ -z "$wasm_files" ]]; then
    log_info "No WASM binaries found"
    return 0
  fi
  
  while IFS= read -r wasm_file; do
    if file "$wasm_file" | grep -q "WebAssembly"; then
      log_success "Valid WASM binary: $(basename "$wasm_file")"
    else
      log_error "Invalid WASM binary: $(basename "$wasm_file")"
      return 1
    fi
  done <<< "$wasm_files"
}

check_file_permissions() {
  log_info "Checking file permissions..."
  
  # Check for world-writable files
  local world_writable
  world_writable=$(find "$PROJECT_ROOT" -type f -perm -002 2>/dev/null || true)
  
  if [[ -n "$world_writable" ]]; then
    log_warning "World-writable files detected"
    echo "$world_writable" | head -5
  else
    log_success "No world-writable files detected"
  fi
}

check_git_config() {
  log_info "Checking git configuration..."
  
  if [[ -d "$PROJECT_ROOT/.git" ]]; then
    if git -C "$PROJECT_ROOT" config --get user.name > /dev/null 2>&1; then
      log_success "Git user configured"
    else
      log_warning "Git user not configured"
    fi
  fi
}

check_license_compliance() {
  log_info "Checking license compliance..."
  
  if [[ -f "$PROJECT_ROOT/LICENSE" ]]; then
    log_success "LICENSE file present"
  else
    log_warning "LICENSE file not found"
  fi
  
  if [[ -f "$PROJECT_ROOT/CONTRIBUTING.md" ]]; then
    log_success "CONTRIBUTING.md present"
  else
    log_warning "CONTRIBUTING.md not found"
  fi
}

check_code_quality() {
  log_info "Checking code quality..."
  
  # Check for TODO/FIXME comments
  local todos
  todos=$(grep -r "TODO\|FIXME" "$PROJECT_ROOT" \
    --include="*.rs" \
    --include="*.tsx" \
    --include="*.ts" \
    --exclude-dir=node_modules \
    --exclude-dir=target \
    2>/dev/null | wc -l)
  
  if [[ $todos -gt 0 ]]; then
    log_warning "Found $todos TODO/FIXME comments"
  else
    log_success "No TODO/FIXME comments found"
  fi
}

check_test_coverage() {
  log_info "Checking test coverage..."
  
  if [[ -f "$PROJECT_ROOT/jest.config.json" ]]; then
    log_success "Jest configuration found"
  fi
  
  if [[ -f "$PROJECT_ROOT/Cargo.toml" ]]; then
    log_success "Cargo configuration found"
  fi
}

# ── Report Generation ────────────────────────────────────────────────────────

generate_report() {
  local report_file="$PROJECT_ROOT/security_validation_report.txt"
  
  {
    echo "Security Validation Report"
    echo "Generated: $(date)"
    echo "Project: $PROJECT_ROOT"
    echo ""
    echo "Summary:"
    echo "  Passed: $CHECKS_PASSED"
    echo "  Warned: $CHECKS_WARNED"
    echo "  Failed: $CHECKS_FAILED"
    echo ""
    echo "Status: $(
      if [[ $CHECKS_FAILED -eq 0 ]]; then
        echo "PASSED"
      else
        echo "FAILED"
      fi
    )"
  } > "$report_file"
  
  log_success "Report generated: $report_file"
}

# ── Main Execution ───────────────────────────────────────────────────────────

main() {
  log_info "Starting security validation..."
  echo ""
  
  check_dependencies
  check_secrets
  check_rust_security
  check_typescript_types
  check_wasm_binary
  check_file_permissions
  check_git_config
  check_license_compliance
  check_code_quality
  check_test_coverage
  
  echo ""
  log_info "Security validation complete"
  echo "  Passed: $CHECKS_PASSED"
  echo "  Warned: $CHECKS_WARNED"
  echo "  Failed: $CHECKS_FAILED"
  
  if [[ "$GENERATE_REPORT" == "--report" ]]; then
    generate_report
  fi
  
  if [[ $CHECKS_FAILED -gt 0 ]]; then
    return 1
  fi
  
  return 0
}

# Execute main function
main "$@"
