#!/bin/bash

# Security Reporting for CI/CD
# Generates comprehensive security reports for compliance and documentation

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="${PROJECT_ROOT:-$(dirname "$SCRIPT_DIR")}"
REPORT_DIR="${PROJECT_ROOT}/.security-reports"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
REPORT_FILE="${REPORT_DIR}/security_report_${TIMESTAMP}.json"

# Create report directory
mkdir -p "$REPORT_DIR"

# Initialize report
cat > "$REPORT_FILE" <<EOF
{
  "timestamp": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "report_type": "security_report",
  "sections": {}
}
EOF

# Section 1: Dependency Analysis
analyze_dependencies() {
  local status="PASS"
  local details=""
  local count=0
  
  if command -v cargo-audit &> /dev/null; then
    if cargo audit --deny warnings 2>/dev/null; then
      details="No vulnerable dependencies found"
    else
      status="FAIL"
      details="Vulnerable dependencies detected"
      count=$(cargo audit 2>/dev/null | grep -c "^ID:" || echo 0)
    fi
  else
    status="SKIP"
    details="cargo-audit not installed"
  fi
  
  echo "$status|$details|$count"
}

# Section 2: Code Quality
analyze_code_quality() {
  local status="PASS"
  local details=""
  
  # Check for clippy warnings
  if command -v cargo-clippy &> /dev/null; then
    local warnings=$(cargo clippy --all-targets 2>&1 | grep -c "warning:" || echo 0)
    if [ "$warnings" -gt 0 ]; then
      status="WARN"
      details="Found $warnings clippy warnings"
    else
      details="No clippy warnings"
    fi
  else
    status="SKIP"
    details="cargo-clippy not installed"
  fi
  
  echo "$status|$details"
}

# Section 3: Test Coverage
analyze_test_coverage() {
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

# Section 4: Security Scanning
scan_security() {
  local status="PASS"
  local details=""
  
  # Check for unsafe blocks
  local unsafe_count=$(grep -r "unsafe {" contracts/ 2>/dev/null | wc -l || echo 0)
  if [ "$unsafe_count" -gt 0 ]; then
    status="WARN"
    details="Found $unsafe_count unsafe blocks"
  else
    details="No unsafe blocks found"
  fi
  
  echo "$status|$details"
}

# Section 5: Compliance Check
check_compliance() {
  local status="PASS"
  local details=""
  
  # Check for required security files
  local files_found=0
  [ -f "SECURITY.md" ] && ((files_found++))
  [ -f "CODE_OF_CONDUCT.md" ] && ((files_found++))
  [ -f ".github/workflows/security.yml" ] && ((files_found++))
  
  if [ "$files_found" -eq 3 ]; then
    details="All required security files present"
  else
    status="WARN"
    details="Missing $((3 - files_found)) required security files"
  fi
  
  echo "$status|$details"
}

# Run all analyses
echo "Generating security report..."

dep_result=$(analyze_dependencies)
dep_status="${dep_result%%|*}"
dep_details="${dep_result#*|}"
dep_details="${dep_details%%|*}"
dep_count="${dep_result##*|}"

code_result=$(analyze_code_quality)
code_status="${code_result%%|*}"
code_details="${code_result#*|}"

coverage_result=$(analyze_test_coverage)
coverage_status="${coverage_result%%|*}"
coverage_details="${coverage_result#*|}"

security_result=$(scan_security)
security_status="${security_result%%|*}"
security_details="${security_result#*|}"

compliance_result=$(check_compliance)
compliance_status="${compliance_result%%|*}"
compliance_details="${compliance_result#*|}"

# Update report with results
jq --arg dep_status "$dep_status" --arg dep_details "$dep_details" --arg dep_count "$dep_count" \
   --arg code_status "$code_status" --arg code_details "$code_details" \
   --arg coverage_status "$coverage_status" --arg coverage_details "$coverage_details" \
   --arg security_status "$security_status" --arg security_details "$security_details" \
   --arg compliance_status "$compliance_status" --arg compliance_details "$compliance_details" \
   '.sections = {
     "dependencies": {"status": $dep_status, "details": $dep_details, "count": $dep_count},
     "code_quality": {"status": $code_status, "details": $code_details},
     "test_coverage": {"status": $coverage_status, "details": $coverage_details},
     "security_scan": {"status": $security_status, "details": $security_details},
     "compliance": {"status": $compliance_status, "details": $compliance_details}
   }' "$REPORT_FILE" > "${REPORT_FILE}.tmp" && mv "${REPORT_FILE}.tmp" "$REPORT_FILE"

# Generate summary
echo "✓ Security Report: $REPORT_FILE"
echo ""
echo "Security Report Summary:"
echo "  Dependencies:   $dep_status - $dep_details"
echo "  Code Quality:   $code_status - $code_details"
echo "  Test Coverage:  $coverage_status - $coverage_details"
echo "  Security Scan:  $security_status - $security_details"
echo "  Compliance:     $compliance_status - $compliance_details"

# Exit with error if any critical check failed
if [[ "$dep_status" == "FAIL" ]] || [[ "$code_status" == "FAIL" ]] || [[ "$security_status" == "FAIL" ]]; then
  exit 1
fi

exit 0
