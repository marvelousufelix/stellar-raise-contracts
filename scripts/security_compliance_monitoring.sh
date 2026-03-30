#!/bin/bash

# Security Compliance Monitoring for CI/CD
# Monitors security compliance metrics and generates reports

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="${PROJECT_ROOT:-$(dirname "$SCRIPT_DIR")}"
REPORT_DIR="${PROJECT_ROOT}/.security-reports"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
REPORT_FILE="${REPORT_DIR}/compliance_${TIMESTAMP}.json"

# Create report directory
mkdir -p "$REPORT_DIR"

# Initialize report
cat > "$REPORT_FILE" <<EOF
{
  "timestamp": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "checks": {}
}
EOF

# Check 1: Dependency vulnerabilities
check_dependencies() {
  local status="PASS"
  local details=""
  
  if command -v cargo-audit &> /dev/null; then
    if ! cargo audit --deny warnings 2>/dev/null; then
      status="FAIL"
      details="Vulnerable dependencies detected"
    fi
  else
    status="SKIP"
    details="cargo-audit not installed"
  fi
  
  echo "$status|$details"
}

# Check 2: Code security patterns
check_code_patterns() {
  local status="PASS"
  local details=""
  
  # Check for unsafe blocks
  local unsafe_count=$(grep -r "unsafe {" contracts/ 2>/dev/null | wc -l || echo 0)
  if [ "$unsafe_count" -gt 0 ]; then
    status="WARN"
    details="Found $unsafe_count unsafe blocks"
  fi
  
  echo "$status|$details"
}

# Check 3: Test coverage
check_test_coverage() {
  local status="PASS"
  local details=""
  
  if command -v cargo-tarpaulin &> /dev/null; then
    local coverage=$(cargo tarpaulin --out Stdout 2>/dev/null | grep -oP '\d+\.\d+(?=%)' | tail -1 || echo "0")
    if (( $(echo "$coverage < 95" | bc -l) )); then
      status="WARN"
      details="Coverage: ${coverage}% (target: 95%)"
    else
      details="Coverage: ${coverage}%"
    fi
  else
    status="SKIP"
    details="cargo-tarpaulin not installed"
  fi
  
  echo "$status|$details"
}

# Check 4: Security headers in CI
check_ci_security() {
  local status="PASS"
  local details=""
  
  if [ -f ".github/workflows/security.yml" ]; then
    details="Security workflow configured"
  else
    status="WARN"
    details="No security workflow found"
  fi
  
  echo "$status|$details"
}

# Run all checks
echo "Running security compliance checks..."

dep_result=$(check_dependencies)
dep_status="${dep_result%%|*}"
dep_details="${dep_result#*|}"

code_result=$(check_code_patterns)
code_status="${code_result%%|*}"
code_details="${code_result#*|}"

coverage_result=$(check_test_coverage)
coverage_status="${coverage_result%%|*}"
coverage_details="${coverage_result#*|}"

ci_result=$(check_ci_security)
ci_status="${ci_result%%|*}"
ci_details="${ci_result#*|}"

# Update report with results
jq --arg dep_status "$dep_status" --arg dep_details "$dep_details" \
   --arg code_status "$code_status" --arg code_details "$code_details" \
   --arg coverage_status "$coverage_status" --arg coverage_details "$coverage_details" \
   --arg ci_status "$ci_status" --arg ci_details "$ci_details" \
   '.checks = {
     "dependencies": {"status": $dep_status, "details": $dep_details},
     "code_patterns": {"status": $code_status, "details": $code_details},
     "test_coverage": {"status": $coverage_status, "details": $coverage_details},
     "ci_security": {"status": $ci_status, "details": $ci_details}
   }' "$REPORT_FILE" > "${REPORT_FILE}.tmp" && mv "${REPORT_FILE}.tmp" "$REPORT_FILE"

# Print summary
echo "✓ Compliance Report: $REPORT_FILE"
echo ""
echo "Summary:"
echo "  Dependencies:   $dep_status - $dep_details"
echo "  Code Patterns:  $code_status - $code_details"
echo "  Test Coverage:  $coverage_status - $coverage_details"
echo "  CI Security:    $ci_status - $ci_details"

# Exit with error if any check failed
if [[ "$dep_status" == "FAIL" ]] || [[ "$code_status" == "FAIL" ]] || [[ "$coverage_status" == "FAIL" ]] || [[ "$ci_status" == "FAIL" ]]; then
  exit 1
fi

exit 0
