//! Tests for `security_compliance_testing`.
//!
//! @dev  All tests are pure (no Env required) — they exercise the logic
//!       functions directly.  Coverage target: ≥ 95 % of all branches.

#[cfg(test)]
mod tests {
    use crate::security_compliance_testing::{
        run_all_tests, test_arithmetic_bounds, test_contribution_floor,
        test_contributor_limit, test_deadline_buffer, test_goal_minimum,
        test_non_negative_contribution, test_platform_fee, ComplianceParams,
        TestResult, MAX_CONTRIBUTORS, MAX_FEE_BPS, MIN_CONTRIBUTION,
        MIN_DEADLINE_BUFFER_SECS, MIN_GOAL,
    };

    // ── test_goal_minimum ─────────────────────────────────────────────────────

    #[test]
    fn goal_minimum_passes_at_min() {
        assert_eq!(test_goal_minimum(MIN_GOAL), TestResult::Passed);
    }

    #[test]
    fn goal_minimum_passes_above_min() {
        assert_eq!(test_goal_minimum(1_000_000), TestResult::Passed);
    }

    #[test]
    fn goal_minimum_fails_at_zero() {
        assert!(test_goal_minimum(0).is_passed() == false);
    }

    #[test]
    fn goal_minimum_fails_negative() {
        assert!(matches!(test_goal_minimum(-1), TestResult::Failed(_)));
    }

    // ── test_contribution_floor ───────────────────────────────────────────────

    #[test]
    fn contribution_floor_passes_at_min() {
        assert_eq!(test_contribution_floor(MIN_CONTRIBUTION), TestResult::Passed);
    }

    #[test]
    fn contribution_floor_passes_above_min() {
        assert_eq!(test_contribution_floor(100), TestResult::Passed);
    }

    #[test]
    fn contribution_floor_fails_at_zero() {
        assert!(matches!(test_contribution_floor(0), TestResult::Failed(_)));
    }

    #[test]
    fn contribution_floor_fails_negative() {
        assert!(matches!(test_contribution_floor(-5), TestResult::Failed(_)));
    }

    // ── test_platform_fee ─────────────────────────────────────────────────────

    #[test]
    fn platform_fee_passes_at_max() {
        assert_eq!(test_platform_fee(MAX_FEE_BPS), TestResult::Passed);
    }

    #[test]
    fn platform_fee_passes_at_zero() {
        assert_eq!(test_platform_fee(0), TestResult::Passed);
    }

    #[test]
    fn platform_fee_passes_below_max() {
        assert_eq!(test_platform_fee(500), TestResult::Passed);
    }

    #[test]
    fn platform_fee_fails_above_max() {
        assert!(matches!(test_platform_fee(MAX_FEE_BPS + 1), TestResult::Failed(_)));
    }

    #[test]
    fn platform_fee_fails_at_10001_bps() {
        assert!(matches!(test_platform_fee(10_001), TestResult::Failed(_)));
    }

    // ── test_deadline_buffer ──────────────────────────────────────────────────

    #[test]
    fn deadline_buffer_passes_exactly_at_min() {
        let now = 1_000_000u64;
        let deadline = now + MIN_DEADLINE_BUFFER_SECS;
        assert_eq!(test_deadline_buffer(deadline, now), TestResult::Passed);
    }

    #[test]
    fn deadline_buffer_passes_well_in_future() {
        let now = 1_000_000u64;
        let deadline = now + 86_400; // 1 day
        assert_eq!(test_deadline_buffer(deadline, now), TestResult::Passed);
    }

    #[test]
    fn deadline_buffer_fails_too_soon() {
        let now = 1_000_000u64;
        let deadline = now + MIN_DEADLINE_BUFFER_SECS - 1;
        assert!(matches!(test_deadline_buffer(deadline, now), TestResult::Failed(_)));
    }

    #[test]
    fn deadline_buffer_fails_in_past() {
        let now = 1_000_000u64;
        let deadline = now - 1;
        assert!(matches!(test_deadline_buffer(deadline, now), TestResult::Failed(_)));
    }

    #[test]
    fn deadline_buffer_handles_now_near_max() {
        // now near u64::MAX — checked_add should saturate to u64::MAX
        let now = u64::MAX - 10;
        let deadline = u64::MAX;
        // deadline < now + MIN_DEADLINE_BUFFER_SECS (saturates to MAX) → fail
        assert!(matches!(test_deadline_buffer(deadline, now), TestResult::Failed(_)));
    }

    // ── test_arithmetic_bounds ────────────────────────────────────────────────

    #[test]
    fn arithmetic_bounds_passes_at_goal() {
        assert_eq!(test_arithmetic_bounds(1_000, 1_000), TestResult::Passed);
    }

    #[test]
    fn arithmetic_bounds_passes_at_double_goal() {
        assert_eq!(test_arithmetic_bounds(2_000, 1_000), TestResult::Passed);
    }

    #[test]
    fn arithmetic_bounds_passes_below_goal() {
        assert_eq!(test_arithmetic_bounds(500, 1_000), TestResult::Passed);
    }

    #[test]
    fn arithmetic_bounds_fails_above_double() {
        assert!(matches!(test_arithmetic_bounds(2_001, 1_000), TestResult::Failed(_)));
    }

    #[test]
    fn arithmetic_bounds_passes_zero_raised() {
        assert_eq!(test_arithmetic_bounds(0, 1_000), TestResult::Passed);
    }

    #[test]
    fn arithmetic_bounds_handles_goal_overflow() {
        // goal * 2 overflows i128 → saturates to i128::MAX → always passes
        assert_eq!(test_arithmetic_bounds(i128::MAX, i128::MAX), TestResult::Passed);
    }

    // ── test_non_negative_contribution ───────────────────────────────────────

    #[test]
    fn non_negative_passes_at_zero() {
        assert_eq!(test_non_negative_contribution(0), TestResult::Passed);
    }

    #[test]
    fn non_negative_passes_positive() {
        assert_eq!(test_non_negative_contribution(100), TestResult::Passed);
    }

    #[test]
    fn non_negative_fails_negative_one() {
        assert!(matches!(test_non_negative_contribution(-1), TestResult::Failed(_)));
    }

    #[test]
    fn non_negative_fails_large_negative() {
        assert!(matches!(test_non_negative_contribution(i128::MIN), TestResult::Failed(_)));
    }

    // ── test_contributor_limit ────────────────────────────────────────────────

    #[test]
    fn contributor_limit_passes_at_max() {
        assert_eq!(test_contributor_limit(MAX_CONTRIBUTORS), TestResult::Passed);
    }

    #[test]
    fn contributor_limit_passes_at_zero() {
        assert_eq!(test_contributor_limit(0), TestResult::Passed);
    }

    #[test]
    fn contributor_limit_passes_below_max() {
        assert_eq!(test_contributor_limit(MAX_CONTRIBUTORS - 1), TestResult::Passed);
    }

    #[test]
    fn contributor_limit_fails_above_max() {
        assert!(matches!(test_contributor_limit(MAX_CONTRIBUTORS + 1), TestResult::Failed(_)));
    }

    // ── TestResult helpers ────────────────────────────────────────────────────

    #[test]
    fn test_result_is_passed_true_for_passed() {
        assert!(TestResult::Passed.is_passed());
    }

    #[test]
    fn test_result_is_passed_false_for_failed() {
        assert!(!TestResult::Failed("err").is_passed());
    }

    #[test]
    fn test_result_message_empty_for_passed() {
        assert_eq!(TestResult::Passed.message(), "");
    }

    #[test]
    fn test_result_message_returns_violation() {
        let msg = "some violation";
        assert_eq!(TestResult::Failed(msg).message(), msg);
    }

    // ── run_all_tests ─────────────────────────────────────────────────────────

    fn compliant_params() -> ComplianceParams {
        ComplianceParams {
            goal: 1_000,
            min_contribution: 10,
            fee_bps: 250,
            deadline: 2_000_000,
            now: 1_000_000,
            total_raised: 500,
            contributor_count: 10,
        }
    }

    #[test]
    fn run_all_tests_all_pass() {
        let summary = run_all_tests(&compliant_params());
        assert!(summary.all_passed);
        assert_eq!(summary.failed, 0);
        assert_eq!(summary.passed, summary.total);
    }

    #[test]
    fn run_all_tests_total_is_six() {
        let summary = run_all_tests(&compliant_params());
        assert_eq!(summary.total, 6);
    }

    #[test]
    fn run_all_tests_detects_bad_goal() {
        let mut p = compliant_params();
        p.goal = 0;
        let summary = run_all_tests(&p);
        assert!(!summary.all_passed);
        assert!(summary.failed >= 1);
    }

    #[test]
    fn run_all_tests_detects_bad_fee() {
        let mut p = compliant_params();
        p.fee_bps = 9_999;
        let summary = run_all_tests(&p);
        assert!(!summary.all_passed);
    }

    #[test]
    fn run_all_tests_detects_bad_deadline() {
        let mut p = compliant_params();
        p.deadline = p.now; // no buffer
        let summary = run_all_tests(&p);
        assert!(!summary.all_passed);
    }

    #[test]
    fn run_all_tests_detects_arithmetic_anomaly() {
        let mut p = compliant_params();
        p.total_raised = p.goal * 3; // exceeds goal * 2
        let summary = run_all_tests(&p);
        assert!(!summary.all_passed);
    }

    #[test]
    fn run_all_tests_detects_contributor_overflow() {
        let mut p = compliant_params();
        p.contributor_count = MAX_CONTRIBUTORS + 1;
        let summary = run_all_tests(&p);
        assert!(!summary.all_passed);
    }

    #[test]
    fn run_all_tests_multiple_failures_counted() {
        let p = ComplianceParams {
            goal: 0,           // fail
            min_contribution: 0, // fail
            fee_bps: 99_999,   // fail
            deadline: 0,
            now: 1_000_000,    // fail (deadline in past)
            total_raised: 0,
            contributor_count: 0,
        };
        let summary = run_all_tests(&p);
        assert!(summary.failed >= 3);
        assert_eq!(summary.passed + summary.failed, summary.total);
    }
}
