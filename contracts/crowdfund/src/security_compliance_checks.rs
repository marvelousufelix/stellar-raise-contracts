/// Security Compliance Checks Module
///
/// Provides automated security compliance checks for contract testing and regulatory adherence.
/// Validates contract state, access controls, and security invariants.
///
/// # Security Assumptions
/// - All checks are deterministic and repeatable
/// - Check results are immutable
/// - Access control is enforced for sensitive operations
/// - State transitions are validated before execution
/// - Invariants are maintained across all operations

use soroban_sdk::{contracttype, vec, Env, String, Symbol, Vec};

// ── Types ────────────────────────────────────────────────────────────────────

/// Check result status
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
#[repr(u8)]
pub enum CheckStatus {
    /// Check passed
    Passed = 0,
    /// Check failed
    Failed = 1,
    /// Check skipped
    Skipped = 2,
    /// Check error
    Error = 3,
}

impl CheckStatus {
    /// Validates check status value
    pub fn is_valid(status: u8) -> bool {
        status <= 3
    }

    /// Returns string representation
    pub fn as_str(&self) -> &'static str {
        match self {
            CheckStatus::Passed => "passed",
            CheckStatus::Failed => "failed",
            CheckStatus::Skipped => "skipped",
            CheckStatus::Error => "error",
        }
    }
}

/// Individual compliance check result
#[contracttype]
#[derive(Clone, Debug)]
pub struct ComplianceCheck {
    /// Check identifier
    pub check_id: String,
    /// Check name
    pub name: String,
    /// Check description
    pub description: String,
    /// Check status
    pub status: u8,
    /// Error message if failed
    pub error_message: String,
    /// Timestamp of check execution
    pub timestamp: u64,
    /// Check duration in milliseconds
    pub duration_ms: u64,
}

impl ComplianceCheck {
    /// Creates new compliance check
    pub fn new(
        check_id: String,
        name: String,
        description: String,
        status: u8,
        timestamp: u64,
    ) -> Self {
        Self {
            check_id,
            name,
            description,
            status,
            error_message: String::from_slice(&Env::default(), ""),
            timestamp,
            duration_ms: 0,
        }
    }

    /// Sets error message
    pub fn with_error(mut self, error: String) -> Self {
        self.error_message = error;
        self
    }

    /// Sets check duration
    pub fn with_duration(mut self, duration_ms: u64) -> Self {
        self.duration_ms = duration_ms;
        self
    }

    /// Validates check data
    pub fn validate(&self) -> bool {
        !self.check_id.is_empty()
            && !self.name.is_empty()
            && CheckStatus::is_valid(self.status)
            && self.timestamp > 0
    }
}

/// Compliance check suite result
#[contracttype]
#[derive(Clone, Debug)]
pub struct ComplianceCheckSuite {
    /// Suite identifier
    pub suite_id: String,
    /// Suite name
    pub suite_name: String,
    /// Total checks executed
    pub total_checks: u32,
    /// Checks passed
    pub passed_count: u32,
    /// Checks failed
    pub failed_count: u32,
    /// Checks skipped
    pub skipped_count: u32,
    /// Checks with errors
    pub error_count: u32,
    /// Individual check results
    pub checks: Vec<ComplianceCheck>,
    /// Suite execution timestamp
    pub timestamp: u64,
    /// Total suite duration in milliseconds
    pub total_duration_ms: u64,
    /// Overall pass rate (0-100)
    pub pass_rate: u32,
}

impl ComplianceCheckSuite {
    /// Creates new compliance check suite
    pub fn new(
        env: &Env,
        suite_id: String,
        suite_name: String,
        checks: Vec<ComplianceCheck>,
    ) -> Self {
        let total = checks.len() as u32;
        let (passed, failed, skipped, errors) = Self::count_by_status(&checks);
        let pass_rate = Self::calculate_pass_rate(passed, total);
        let timestamp = env.ledger().timestamp();

        Self {
            suite_id,
            suite_name,
            total_checks: total,
            passed_count: passed,
            failed_count: failed,
            skipped_count: skipped,
            error_count: errors,
            checks,
            timestamp,
            total_duration_ms: 0,
            pass_rate,
        }
    }

    /// Counts checks by status
    fn count_by_status(checks: &Vec<ComplianceCheck>) -> (u32, u32, u32, u32) {
        let mut passed = 0u32;
        let mut failed = 0u32;
        let mut skipped = 0u32;
        let mut errors = 0u32;

        for check in checks.iter() {
            match check.status {
                0 => passed += 1,
                1 => failed += 1,
                2 => skipped += 1,
                3 => errors += 1,
                _ => {}
            }
        }

        (passed, failed, skipped, errors)
    }

    /// Calculates pass rate
    fn calculate_pass_rate(passed: u32, total: u32) -> u32 {
        if total == 0 {
            return 100;
        }
        (passed * 100) / total
    }

    /// Validates suite data
    pub fn validate(&self) -> bool {
        !self.suite_id.is_empty()
            && !self.suite_name.is_empty()
            && self.total_checks > 0
            && self.pass_rate <= 100
            && self.checks.iter().all(|c| c.validate())
    }

    /// Checks if all tests passed
    pub fn all_passed(&self) -> bool {
        self.failed_count == 0 && self.error_count == 0
    }

    /// Checks if any tests failed
    pub fn has_failures(&self) -> bool {
        self.failed_count > 0 || self.error_count > 0
    }
}

// ── Check Implementations ────────────────────────────────────────────────────

/// Access control check
pub fn check_access_control(
    env: &Env,
    caller: &soroban_sdk::Address,
    authorized_address: &soroban_sdk::Address,
) -> ComplianceCheck {
    let start_time = env.ledger().timestamp();
    let is_authorized = caller == authorized_address;

    let status = if is_authorized {
        CheckStatus::Passed as u8
    } else {
        CheckStatus::Failed as u8
    };

    let mut check = ComplianceCheck::new(
        String::from_slice(env, "access_control"),
        String::from_slice(env, "Access Control Check"),
        String::from_slice(env, "Verifies caller is authorized"),
        status,
        start_time,
    );

    if !is_authorized {
        check = check.with_error(String::from_slice(env, "Unauthorized caller"));
    }

    check
}

/// State invariant check
pub fn check_state_invariant(
    env: &Env,
    condition: bool,
    check_name: &str,
    error_msg: &str,
) -> ComplianceCheck {
    let start_time = env.ledger().timestamp();

    let status = if condition {
        CheckStatus::Passed as u8
    } else {
        CheckStatus::Failed as u8
    };

    let mut check = ComplianceCheck::new(
        String::from_slice(env, check_name),
        String::from_slice(env, check_name),
        String::from_slice(env, "State invariant validation"),
        status,
        start_time,
    );

    if !condition {
        check = check.with_error(String::from_slice(env, error_msg));
    }

    check
}

/// Input validation check
pub fn check_input_validation(
    env: &Env,
    value: i128,
    min: i128,
    max: i128,
    check_name: &str,
) -> ComplianceCheck {
    let start_time = env.ledger().timestamp();
    let is_valid = value >= min && value <= max;

    let status = if is_valid {
        CheckStatus::Passed as u8
    } else {
        CheckStatus::Failed as u8
    };

    let mut check = ComplianceCheck::new(
        String::from_slice(env, check_name),
        String::from_slice(env, check_name),
        String::from_slice(env, "Input range validation"),
        status,
        start_time,
    );

    if !is_valid {
        let error = format!("Value {} outside range [{}, {}]", value, min, max);
        check = check.with_error(String::from_slice(env, &error));
    }

    check
}

/// Reentrancy guard check
pub fn check_reentrancy_guard(
    env: &Env,
    guard_active: bool,
) -> ComplianceCheck {
    let start_time = env.ledger().timestamp();

    let status = if guard_active {
        CheckStatus::Passed as u8
    } else {
        CheckStatus::Failed as u8
    };

    let mut check = ComplianceCheck::new(
        String::from_slice(env, "reentrancy_guard"),
        String::from_slice(env, "Reentrancy Guard Check"),
        String::from_slice(env, "Verifies reentrancy protection is active"),
        status,
        start_time,
    );

    if !guard_active {
        check = check.with_error(String::from_slice(env, "Reentrancy guard not active"));
    }

    check
}

/// Timestamp validation check
pub fn check_timestamp_validity(
    env: &Env,
    timestamp: u64,
    current_time: u64,
) -> ComplianceCheck {
    let start_time = env.ledger().timestamp();
    let is_valid = timestamp <= current_time;

    let status = if is_valid {
        CheckStatus::Passed as u8
    } else {
        CheckStatus::Failed as u8
    };

    let mut check = ComplianceCheck::new(
        String::from_slice(env, "timestamp_validity"),
        String::from_slice(env, "Timestamp Validity Check"),
        String::from_slice(env, "Verifies timestamp is not in future"),
        status,
        start_time,
    );

    if !is_valid {
        check = check.with_error(String::from_slice(env, "Timestamp is in the future"));
    }

    check
}

/// Balance check
pub fn check_balance(
    env: &Env,
    balance: i128,
    required: i128,
) -> ComplianceCheck {
    let start_time = env.ledger().timestamp();
    let is_sufficient = balance >= required;

    let status = if is_sufficient {
        CheckStatus::Passed as u8
    } else {
        CheckStatus::Failed as u8
    };

    let mut check = ComplianceCheck::new(
        String::from_slice(env, "balance_check"),
        String::from_slice(env, "Balance Check"),
        String::from_slice(env, "Verifies sufficient balance"),
        status,
        start_time,
    );

    if !is_sufficient {
        let error = format!("Insufficient balance: {} < {}", balance, required);
        check = check.with_error(String::from_slice(env, &error));
    }

    check
}

// ── Suite Builders ───────────────────────────────────────────────────────────

/// Builds a compliance check suite
pub fn build_check_suite(
    env: &Env,
    suite_id: String,
    suite_name: String,
    checks: Vec<ComplianceCheck>,
) -> ComplianceCheckSuite {
    ComplianceCheckSuite::new(env, suite_id, suite_name, checks)
}

/// Adds check to suite
pub fn add_check_to_suite(
    mut suite: ComplianceCheckSuite,
    check: ComplianceCheck,
) -> ComplianceCheckSuite {
    if !check.validate() {
        return suite;
    }

    let mut checks = suite.checks.clone();
    checks.push_back(check);

    let total = checks.len() as u32;
    let (passed, failed, skipped, errors) = ComplianceCheckSuite::count_by_status(&checks);
    let pass_rate = ComplianceCheckSuite::calculate_pass_rate(passed, total);

    ComplianceCheckSuite {
        total_checks: total,
        passed_count: passed,
        failed_count: failed,
        skipped_count: skipped,
        error_count: errors,
        checks,
        pass_rate,
        ..suite
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_check_status_validation() {
        assert!(CheckStatus::is_valid(0));
        assert!(CheckStatus::is_valid(3));
        assert!(!CheckStatus::is_valid(4));
    }

    #[test]
    fn test_compliance_check_creation() {
        let env = Env::default();
        let check = ComplianceCheck::new(
            String::from_slice(&env, "check-1"),
            String::from_slice(&env, "Test Check"),
            String::from_slice(&env, "Test description"),
            CheckStatus::Passed as u8,
            1000,
        );

        assert!(check.validate());
        assert_eq!(check.status, CheckStatus::Passed as u8);
    }

    #[test]
    fn test_compliance_check_with_error() {
        let env = Env::default();
        let check = ComplianceCheck::new(
            String::from_slice(&env, "check-1"),
            String::from_slice(&env, "Test Check"),
            String::from_slice(&env, "Test description"),
            CheckStatus::Failed as u8,
            1000,
        )
        .with_error(String::from_slice(&env, "Test error"));

        assert_eq!(check.error_message, String::from_slice(&env, "Test error"));
    }

    #[test]
    fn test_compliance_check_suite_creation() {
        let env = Env::default();
        let mut checks = vec![&env];
        checks.push_back(ComplianceCheck::new(
            String::from_slice(&env, "check-1"),
            String::from_slice(&env, "Check 1"),
            String::from_slice(&env, "Description"),
            CheckStatus::Passed as u8,
            1000,
        ));

        let suite = ComplianceCheckSuite::new(
            &env,
            String::from_slice(&env, "suite-1"),
            String::from_slice(&env, "Test Suite"),
            checks,
        );

        assert_eq!(suite.total_checks, 1);
        assert_eq!(suite.passed_count, 1);
        assert!(suite.all_passed());
    }

    #[test]
    fn test_pass_rate_calculation() {
        assert_eq!(ComplianceCheckSuite::calculate_pass_rate(0, 0), 100);
        assert_eq!(ComplianceCheckSuite::calculate_pass_rate(1, 1), 100);
        assert_eq!(ComplianceCheckSuite::calculate_pass_rate(1, 2), 50);
        assert_eq!(ComplianceCheckSuite::calculate_pass_rate(3, 4), 75);
    }

    #[test]
    fn test_check_access_control_authorized() {
        let env = Env::default();
        let addr1 = soroban_sdk::Address::generate(&env);
        let check = check_access_control(&env, &addr1, &addr1);

        assert_eq!(check.status, CheckStatus::Passed as u8);
    }

    #[test]
    fn test_check_access_control_unauthorized() {
        let env = Env::default();
        let addr1 = soroban_sdk::Address::generate(&env);
        let addr2 = soroban_sdk::Address::generate(&env);
        let check = check_access_control(&env, &addr1, &addr2);

        assert_eq!(check.status, CheckStatus::Failed as u8);
    }

    #[test]
    fn test_check_state_invariant_true() {
        let env = Env::default();
        let check = check_state_invariant(&env, true, "test_check", "Should not fail");

        assert_eq!(check.status, CheckStatus::Passed as u8);
    }

    #[test]
    fn test_check_state_invariant_false() {
        let env = Env::default();
        let check = check_state_invariant(&env, false, "test_check", "Test error");

        assert_eq!(check.status, CheckStatus::Failed as u8);
    }

    #[test]
    fn test_check_input_validation_valid() {
        let env = Env::default();
        let check = check_input_validation(&env, 50, 0, 100, "range_check");

        assert_eq!(check.status, CheckStatus::Passed as u8);
    }

    #[test]
    fn test_check_input_validation_invalid() {
        let env = Env::default();
        let check = check_input_validation(&env, 150, 0, 100, "range_check");

        assert_eq!(check.status, CheckStatus::Failed as u8);
    }

    #[test]
    fn test_check_reentrancy_guard_active() {
        let env = Env::default();
        let check = check_reentrancy_guard(&env, true);

        assert_eq!(check.status, CheckStatus::Passed as u8);
    }

    #[test]
    fn test_check_reentrancy_guard_inactive() {
        let env = Env::default();
        let check = check_reentrancy_guard(&env, false);

        assert_eq!(check.status, CheckStatus::Failed as u8);
    }

    #[test]
    fn test_check_timestamp_validity_valid() {
        let env = Env::default();
        let check = check_timestamp_validity(&env, 1000, 2000);

        assert_eq!(check.status, CheckStatus::Passed as u8);
    }

    #[test]
    fn test_check_timestamp_validity_invalid() {
        let env = Env::default();
        let check = check_timestamp_validity(&env, 3000, 2000);

        assert_eq!(check.status, CheckStatus::Failed as u8);
    }

    #[test]
    fn test_check_balance_sufficient() {
        let env = Env::default();
        let check = check_balance(&env, 1000, 500);

        assert_eq!(check.status, CheckStatus::Passed as u8);
    }

    #[test]
    fn test_check_balance_insufficient() {
        let env = Env::default();
        let check = check_balance(&env, 300, 500);

        assert_eq!(check.status, CheckStatus::Failed as u8);
    }

    #[test]
    fn test_add_check_to_suite() {
        let env = Env::default();
        let mut checks = vec![&env];
        checks.push_back(ComplianceCheck::new(
            String::from_slice(&env, "check-1"),
            String::from_slice(&env, "Check 1"),
            String::from_slice(&env, "Description"),
            CheckStatus::Passed as u8,
            1000,
        ));

        let mut suite = ComplianceCheckSuite::new(
            &env,
            String::from_slice(&env, "suite-1"),
            String::from_slice(&env, "Test Suite"),
            checks,
        );

        let new_check = ComplianceCheck::new(
            String::from_slice(&env, "check-2"),
            String::from_slice(&env, "Check 2"),
            String::from_slice(&env, "Description"),
            CheckStatus::Passed as u8,
            1000,
        );

        suite = add_check_to_suite(suite, new_check);

        assert_eq!(suite.total_checks, 2);
        assert_eq!(suite.passed_count, 2);
    }

    #[test]
    fn test_suite_with_mixed_results() {
        let env = Env::default();
        let mut checks = vec![&env];
        checks.push_back(ComplianceCheck::new(
            String::from_slice(&env, "check-1"),
            String::from_slice(&env, "Check 1"),
            String::from_slice(&env, "Description"),
            CheckStatus::Passed as u8,
            1000,
        ));
        checks.push_back(ComplianceCheck::new(
            String::from_slice(&env, "check-2"),
            String::from_slice(&env, "Check 2"),
            String::from_slice(&env, "Description"),
            CheckStatus::Failed as u8,
            1000,
        ));

        let suite = ComplianceCheckSuite::new(
            &env,
            String::from_slice(&env, "suite-1"),
            String::from_slice(&env, "Test Suite"),
            checks,
        );

        assert_eq!(suite.total_checks, 2);
        assert_eq!(suite.passed_count, 1);
        assert_eq!(suite.failed_count, 1);
        assert_eq!(suite.pass_rate, 50);
        assert!(!suite.all_passed());
        assert!(suite.has_failures());
    }
}
