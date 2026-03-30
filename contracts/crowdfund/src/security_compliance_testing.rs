//! # security_compliance_testing
//!
//! @title   SecurityComplianceTesting — Automated compliance validation for
//!          the crowdfund contract.
//!
//! @notice  Provides a suite of on-chain compliance test helpers that verify
//!          security invariants hold across all contract states.  Intended to
//!          be called by CI pipelines and governance tooling.
//!
//! @dev     All public functions are pure or read-only — they never mutate
//!          state.  Safe to call from simulation contexts.
//!
//! ## Security Assumptions
//!
//! 1. **Read-only** — No function in this module writes to storage.
//! 2. **No auth required** — Compliance tests are permissionless.
//! 3. **Deterministic** — Same ledger state → same result.
//! 4. **Overflow-safe** — All arithmetic uses `checked_*` operations.
//! 5. **Bounded** — Iteration is over fixed-size constant sets (O(1)).

#![allow(dead_code)]

// ── Constants ─────────────────────────────────────────────────────────────────

/// Maximum allowed platform fee in basis points (10 %).
pub const MAX_FEE_BPS: u32 = 1_000;

/// Minimum compliant campaign goal (1 token unit).
pub const MIN_GOAL: i128 = 1;

/// Minimum compliant contribution floor (1 token unit).
pub const MIN_CONTRIBUTION: i128 = 1;

/// Maximum contributors before a compliance warning is raised.
pub const MAX_CONTRIBUTORS: u32 = 128;

/// Minimum deadline buffer in seconds from "now" at initialization.
pub const MIN_DEADLINE_BUFFER_SECS: u64 = 60;

// ── Result type ───────────────────────────────────────────────────────────────

/// Outcome of a single compliance test.
///
/// @notice `Passed` means the invariant holds; `Failed` carries a static
///         description of the violation for off-chain logging.
#[derive(Clone, PartialEq, Debug)]
pub enum TestResult {
    Passed,
    Failed(&'static str),
}

impl TestResult {
    /// Returns `true` when the test passed.
    pub fn is_passed(&self) -> bool {
        matches!(self, TestResult::Passed)
    }

    /// Returns the violation message, or `""` when passed.
    pub fn message(&self) -> &'static str {
        match self {
            TestResult::Passed => "",
            TestResult::Failed(msg) => msg,
        }
    }
}

// ── Individual compliance tests ───────────────────────────────────────────────

/// @notice Validates that the campaign goal meets the minimum threshold.
/// @param  goal  Campaign funding goal in token units.
/// @return `Passed` if goal ≥ MIN_GOAL, `Failed` otherwise.
pub fn test_goal_minimum(goal: i128) -> TestResult {
    if goal >= MIN_GOAL {
        TestResult::Passed
    } else {
        TestResult::Failed("Campaign goal is below the minimum compliant threshold")
    }
}

/// @notice Validates that the minimum contribution floor is compliant.
/// @param  min_contribution  Minimum contribution amount in token units.
/// @return `Passed` if min_contribution ≥ MIN_CONTRIBUTION, `Failed` otherwise.
pub fn test_contribution_floor(min_contribution: i128) -> TestResult {
    if min_contribution >= MIN_CONTRIBUTION {
        TestResult::Passed
    } else {
        TestResult::Failed("Minimum contribution is below the compliant floor")
    }
}

/// @notice Validates that the platform fee does not exceed MAX_FEE_BPS.
/// @param  fee_bps  Platform fee in basis points.
/// @return `Passed` if fee_bps ≤ MAX_FEE_BPS, `Failed` otherwise.
pub fn test_platform_fee(fee_bps: u32) -> TestResult {
    if fee_bps <= MAX_FEE_BPS {
        TestResult::Passed
    } else {
        TestResult::Failed("Platform fee exceeds the maximum allowed basis points")
    }
}

/// @notice Validates that the campaign deadline is sufficiently in the future.
/// @param  deadline     Campaign deadline as a Unix timestamp (seconds).
/// @param  now          Current ledger timestamp (seconds).
/// @return `Passed` if deadline > now + MIN_DEADLINE_BUFFER_SECS, `Failed` otherwise.
pub fn test_deadline_buffer(deadline: u64, now: u64) -> TestResult {
    let min_deadline = now.checked_add(MIN_DEADLINE_BUFFER_SECS).unwrap_or(u64::MAX);
    if deadline >= min_deadline {
        TestResult::Passed
    } else {
        TestResult::Failed("Campaign deadline does not provide the minimum required buffer")
    }
}

/// @notice Validates that total_raised does not exceed the goal by more than 2×.
/// @dev    An anomaly here may indicate an arithmetic bug or replay attack.
/// @param  total_raised  Total tokens raised so far.
/// @param  goal          Campaign funding goal.
/// @return `Passed` if total_raised ≤ goal * 2, `Failed` otherwise.
pub fn test_arithmetic_bounds(total_raised: i128, goal: i128) -> TestResult {
    let upper = goal.checked_mul(2).unwrap_or(i128::MAX);
    if total_raised <= upper {
        TestResult::Passed
    } else {
        TestResult::Failed("Total raised exceeds plausible arithmetic bounds (goal × 2)")
    }
}

/// @notice Validates that no individual contribution is negative.
/// @param  amount  Contribution amount to validate.
/// @return `Passed` if amount ≥ 0, `Failed` otherwise.
pub fn test_non_negative_contribution(amount: i128) -> TestResult {
    if amount >= 0 {
        TestResult::Passed
    } else {
        TestResult::Failed("Negative contribution amount detected")
    }
}

/// @notice Validates that the contributor count is within the compliant limit.
/// @param  count  Current number of unique contributors.
/// @return `Passed` if count ≤ MAX_CONTRIBUTORS, `Failed` otherwise.
pub fn test_contributor_limit(count: u32) -> TestResult {
    if count <= MAX_CONTRIBUTORS {
        TestResult::Passed
    } else {
        TestResult::Failed("Contributor count exceeds the maximum compliant limit")
    }
}

// ── Aggregate audit ───────────────────────────────────────────────────────────

/// Summary returned by [`run_all_tests`].
#[derive(Clone, Debug)]
pub struct ComplianceSummary {
    pub total: u32,
    pub passed: u32,
    pub failed: u32,
    pub all_passed: bool,
}

/// Parameters for a full compliance test run.
pub struct ComplianceParams {
    pub goal: i128,
    pub min_contribution: i128,
    pub fee_bps: u32,
    pub deadline: u64,
    pub now: u64,
    pub total_raised: i128,
    pub contributor_count: u32,
}

/// @notice Runs all compliance tests and returns an aggregate summary.
/// @dev    Iterates over a fixed set of checks — O(1) with respect to
///         contributor count.  Safe to call from any context.
/// @param  p  Compliance parameters snapshot.
/// @return `ComplianceSummary` with pass/fail counts.
pub fn run_all_tests(p: &ComplianceParams) -> ComplianceSummary {
    let checks: &[TestResult] = &[
        test_goal_minimum(p.goal),
        test_contribution_floor(p.min_contribution),
        test_platform_fee(p.fee_bps),
        test_deadline_buffer(p.deadline, p.now),
        test_arithmetic_bounds(p.total_raised, p.goal),
        test_contributor_limit(p.contributor_count),
    ];

    let total = checks.len() as u32;
    let passed = checks.iter().filter(|r| r.is_passed()).count() as u32;
    let failed = total - passed;

    ComplianceSummary {
        total,
        passed,
        failed,
        all_passed: failed == 0,
    }
}
