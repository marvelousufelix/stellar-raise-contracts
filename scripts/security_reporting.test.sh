#!/bin/bash

# Tests for security_reporting.sh

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SCRIPT_UNDER_TEST="${SCRIPT_DIR}/security_reporting.sh"
TEST_REPORT_DIR="/tmp/security_reporting_test_$$"

# Setup
setup() {
  mkdir -p "$TEST_REPORT_DIR/contracts"
  mkdir -p "$TEST_REPORT_DIR/.github/workflows"
  touch "$TEST_REPORT_DIR/.github/workflows/security.yml"
  touch "$TEST_REPORT_DIR/SECURITY.md"
  touch "$TEST_REPORT_DIR/CODE_OF_CONDUCT.md"
}

# Cleanup
teardown() {
  rm -rf "$TEST_REPORT_DIR"
}

# Test 1: Report file creation
test_report_creation() {
  echo "Test 1: Report file creation..."
  
  (cd "$TEST_REPORT_DIR" && PROJECT_ROOT="$TEST_REPORT_DIR" bash "$SCRIPT_UNDER_TEST") > /dev/null 2>&1 || true
  
  local report_count=$(find "$TEST_REPORT_DIR/.security-reports" -name "security_report_*.json" 2>/dev/null | wc -l)
  if [ "$report_count" -gt 0 ]; then
    echo "✓ PASS: Report file created"
    return 0
  else
    echo "✗ FAIL: No report file created"
    return 1
  fi
}

# Test 2: Report JSON structure
test_report_structure() {
  echo "Test 2: Report JSON structure..."
  
  (cd "$TEST_REPORT_DIR" && PROJECT_ROOT="$TEST_REPORT_DIR" bash "$SCRIPT_UNDER_TEST") > /dev/null 2>&1 || true
  
  local report_file=$(find "$TEST_REPORT_DIR/.security-reports" -name "security_report_*.json" 2>/dev/null | head -1)
  if [ -z "$report_file" ]; then
    echo "✗ FAIL: No report file found"
    return 1
  fi
  
  if jq -e '.timestamp and .report_type and .sections' "$report_file" > /dev/null 2>&1; then
    echo "✓ PASS: Report has valid JSON structure"
    return 0
  else
    echo "✗ FAIL: Invalid JSON structure"
    return 1
  fi
}

# Test 3: All sections present
test_sections_present() {
  echo "Test 3: All sections present..."
  
  (cd "$TEST_REPORT_DIR" && PROJECT_ROOT="$TEST_REPORT_DIR" bash "$SCRIPT_UNDER_TEST") > /dev/null 2>&1 || true
  
  local report_file=$(find "$TEST_REPORT_DIR/.security-reports" -name "security_report_*.json" 2>/dev/null | head -1)
  if [ -z "$report_file" ]; then
    echo "✗ FAIL: No report file found"
    return 1
  fi
  
  local sections=$(jq '.sections | keys | length' "$report_file")
  if [ "$sections" -ge 5 ]; then
    echo "✓ PASS: All sections present ($sections sections)"
    return 0
  else
    echo "✗ FAIL: Missing sections (found $sections, expected 5)"
    return 1
  fi
}

# Test 4: Status values valid
test_status_values() {
  echo "Test 4: Status values valid..."
  
  (cd "$TEST_REPORT_DIR" && PROJECT_ROOT="$TEST_REPORT_DIR" bash "$SCRIPT_UNDER_TEST") > /dev/null 2>&1 || true
  
  local report_file=$(find "$TEST_REPORT_DIR/.security-reports" -name "security_report_*.json" 2>/dev/null | head -1)
  if [ -z "$report_file" ]; then
    echo "✗ FAIL: No report file found"
    return 1
  fi
  
  local statuses=$(jq -r '.sections[].status' "$report_file" | sort -u)
  local valid=true
  
  while IFS= read -r status; do
    if [[ ! "$status" =~ ^(PASS|FAIL|WARN|SKIP)$ ]]; then
      valid=false
      break
    fi
  done <<< "$statuses"
  
  if [ "$valid" = true ]; then
    echo "✓ PASS: All status values valid"
    return 0
  else
    echo "✗ FAIL: Invalid status values found"
    return 1
  fi
}

# Test 5: Timestamp format
test_timestamp_format() {
  echo "Test 5: Timestamp format..."
  
  (cd "$TEST_REPORT_DIR" && PROJECT_ROOT="$TEST_REPORT_DIR" bash "$SCRIPT_UNDER_TEST") > /dev/null 2>&1 || true
  
  local report_file=$(find "$TEST_REPORT_DIR/.security-reports" -name "security_report_*.json" 2>/dev/null | head -1)
  if [ -z "$report_file" ]; then
    echo "✗ FAIL: No report file found"
    return 1
  fi
  
  local timestamp=$(jq -r '.timestamp' "$report_file")
  if [[ "$timestamp" =~ ^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}Z$ ]]; then
    echo "✓ PASS: Timestamp format valid"
    return 0
  else
    echo "✗ FAIL: Invalid timestamp format: $timestamp"
    return 1
  fi
}

# Test 6: Report type field
test_report_type() {
  echo "Test 6: Report type field..."
  
  (cd "$TEST_REPORT_DIR" && PROJECT_ROOT="$TEST_REPORT_DIR" bash "$SCRIPT_UNDER_TEST") > /dev/null 2>&1 || true
  
  local report_file=$(find "$TEST_REPORT_DIR/.security-reports" -name "security_report_*.json" 2>/dev/null | head -1)
  if [ -z "$report_file" ]; then
    echo "✗ FAIL: No report file found"
    return 1
  fi
  
  local report_type=$(jq -r '.report_type' "$report_file")
  if [ "$report_type" = "security_report" ]; then
    echo "✓ PASS: Report type is correct"
    return 0
  else
    echo "✗ FAIL: Invalid report type: $report_type"
    return 1
  fi
}

# Run all tests
main() {
  local passed=0
  local failed=0
  
  setup
  
  test_report_creation && ((passed++)) || ((failed++))
  test_report_structure && ((passed++)) || ((failed++))
  test_sections_present && ((passed++)) || ((failed++))
  test_status_values && ((passed++)) || ((failed++))
  test_timestamp_format && ((passed++)) || ((failed++))
  test_report_type && ((passed++)) || ((failed++))
  
  teardown
  
  echo ""
  echo "Test Results: $passed passed, $failed failed"
  
  if [ "$failed" -eq 0 ]; then
    echo "✓ All tests passed!"
    return 0
  else
    echo "✗ Some tests failed"
    return 1
  fi
}

main "$@"
