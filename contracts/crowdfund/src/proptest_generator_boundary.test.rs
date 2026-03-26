//! # ProptestGeneratorBoundary — Comprehensive Test Suite
//!
//! @title   ProptestGeneratorBoundary Tests
//! @notice  Validates boundary constants, pure helper functions, and the
//!          on-chain contract methods for correctness and security.
//! @dev     Combines unit tests, edge-case regression tests, and
//!          property-based tests (proptest) for full coverage.
//!
//! ## Test Categories
//!
//! 1. **Constant sanity** — verify exported constant values haven't drifted.
//! 2. **Pure helper unit tests** — deterministic inputs/outputs.
//! 3. **On-chain contract tests** — exercise the Soroban client interface.
//! 4. **Property-based tests** — proptest generators over valid/invalid ranges.
//! 5. **Regression seeds** — inputs that previously caused failures.
//! 6. **Frontend UX edge cases** — inputs that affect UI display correctness.
//!
//! ## Security Notes
//!
//! - Negative `raised` values must never produce a non-zero progress percentage.
//! - `goal == 0` must never cause a division-by-zero panic.
//! - Over-funded campaigns must clamp to exactly 10 000 bps (100 %).
//! - Deadline offsets below 1 000 s must be rejected to prevent timing races.

#[cfg(test)]
mod tests {
    use proptest::prelude::*;
    use soroban_sdk::{Env, Symbol};

    use crate::proptest_generator_boundary::{
        clamp_progress_bps, clamp_proptest_cases, compute_progress_bps,
        is_valid_contribution_amount, is_valid_deadline_offset, is_valid_goal,
        is_valid_min_contribution, ProptestGeneratorBoundary, ProptestGeneratorBoundaryClient,
        DEADLINE_OFFSET_MAX, DEADLINE_OFFSET_MIN, FEE_BPS_CAP, GENERATOR_BATCH_MAX, GOAL_MAX,
        GOAL_MIN, MIN_CONTRIBUTION_FLOOR, PROGRESS_BPS_CAP, PROPTEST_CASES_MAX, PROPTEST_CASES_MIN,
    };

    // ── Helpers ───────────────────────────────────────────────────────────────

    /// Spin up a fresh Soroban test environment with the boundary contract.
    fn setup() -> (Env, ProptestGeneratorBoundaryClient<'static>) {
        let env = Env::default();
        let contract_id = env.register(ProptestGeneratorBoundary, ());
        let client = ProptestGeneratorBoundaryClient::new(&env, &contract_id);
        (env, client)
    }

    // ── 1. Constant Sanity Tests ──────────────────────────────────────────────

    /// @notice Ensures exported constants match the documented specification.
    ///         Any drift here indicates an unreviewed change to platform limits.
    #[test]
    fn test_constants_have_expected_values() {
        assert_eq!(DEADLINE_OFFSET_MIN, 1_000);
        assert_eq!(DEADLINE_OFFSET_MAX, 1_000_000);
        assert_eq!(GOAL_MIN, 1_000);
        assert_eq!(GOAL_MAX, 100_000_000);
        assert_eq!(MIN_CONTRIBUTION_FLOOR, 1);
        assert_eq!(PROGRESS_BPS_CAP, 10_000);
        assert_eq!(FEE_BPS_CAP, 10_000);
        assert_eq!(PROPTEST_CASES_MIN, 32);
        assert_eq!(PROPTEST_CASES_MAX, 256);
        assert_eq!(GENERATOR_BATCH_MAX, 512);
    }

    // ── 2. Pure Helper Unit Tests ─────────────────────────────────────────────

    // --- is_valid_deadline_offset ---

    #[test]
    fn test_deadline_offset_at_min_is_valid() {
        assert!(is_valid_deadline_offset(DEADLINE_OFFSET_MIN));
    }

    #[test]
    fn test_deadline_offset_at_max_is_valid() {
        assert!(is_valid_deadline_offset(DEADLINE_OFFSET_MAX));
    }

    #[test]
    fn test_deadline_offset_midpoint_is_valid() {
        assert!(is_valid_deadline_offset(500_000));
    }

    /// @security Offset of 100 was the old (buggy) minimum — must be rejected.
    #[test]
    fn test_deadline_offset_100_rejected_regression() {
        assert!(!is_valid_deadline_offset(100));
    }

    #[test]
    fn test_deadline_offset_zero_rejected() {
        assert!(!is_valid_deadline_offset(0));
    }

    #[test]
    fn test_deadline_offset_one_below_min_rejected() {
        assert!(!is_valid_deadline_offset(DEADLINE_OFFSET_MIN - 1));
    }

    #[test]
    fn test_deadline_offset_one_above_max_rejected() {
        assert!(!is_valid_deadline_offset(DEADLINE_OFFSET_MAX + 1));
    }

    // --- is_valid_goal ---

    #[test]
    fn test_goal_at_min_is_valid() {
        assert!(is_valid_goal(GOAL_MIN));
    }

    #[test]
    fn test_goal_at_max_is_valid() {
        assert!(is_valid_goal(GOAL_MAX));
    }

    #[test]
    fn test_goal_midpoint_is_valid() {
        assert!(is_valid_goal(50_000_000));
    }

    /// @security goal == 0 causes division-by-zero in progress calculation.
    #[test]
    fn test_goal_zero_rejected() {
        assert!(!is_valid_goal(0));
    }

    #[test]
    fn test_goal_negative_rejected() {
        assert!(!is_valid_goal(-1));
    }

    #[test]
    fn test_goal_one_below_min_rejected() {
        assert!(!is_valid_goal(GOAL_MIN - 1));
    }

    #[test]
    fn test_goal_one_above_max_rejected() {
        assert!(!is_valid_goal(GOAL_MAX + 1));
    }

    // --- is_valid_min_contribution ---

    #[test]
    fn test_min_contribution_floor_with_goal_min_is_valid() {
        assert!(is_valid_min_contribution(MIN_CONTRIBUTION_FLOOR, GOAL_MIN));
    }

    #[test]
    fn test_min_contribution_equal_to_goal_is_valid() {
        assert!(is_valid_min_contribution(GOAL_MIN, GOAL_MIN));
    }

    #[test]
    fn test_min_contribution_zero_rejected() {
        assert!(!is_valid_min_contribution(0, GOAL_MIN));
    }

    /// @security min_contribution > goal makes the campaign permanently un-fundable.
    #[test]
    fn test_min_contribution_above_goal_rejected() {
        assert!(!is_valid_min_contribution(GOAL_MIN + 1, GOAL_MIN));
    }

    // --- is_valid_contribution_amount ---

    #[test]
    fn test_contribution_at_min_is_valid() {
        assert!(is_valid_contribution_amount(1_000, 1_000));
    }

    #[test]
    fn test_contribution_above_min_is_valid() {
        assert!(is_valid_contribution_amount(100_000, 1_000));
    }

    #[test]
    fn test_contribution_below_min_rejected() {
        assert!(!is_valid_contribution_amount(999, 1_000));
    }

    #[test]
    fn test_contribution_zero_rejected_when_min_is_one() {
        assert!(!is_valid_contribution_amount(0, 1));
    }

    // --- clamp_progress_bps ---

    #[test]
    fn test_clamp_progress_bps_zero() {
        assert_eq!(clamp_progress_bps(0), 0);
    }

    #[test]
    fn test_clamp_progress_bps_negative_clamped_to_zero() {
        assert_eq!(clamp_progress_bps(-500), 0);
    }

    #[test]
    fn test_clamp_progress_bps_midpoint_unchanged() {
        assert_eq!(clamp_progress_bps(5_000), 5_000);
    }

    #[test]
    fn test_clamp_progress_bps_at_cap() {
        assert_eq!(clamp_progress_bps(10_000), 10_000);
    }

    #[test]
    fn test_clamp_progress_bps_above_cap_clamped() {
        assert_eq!(clamp_progress_bps(15_000), 10_000);
    }

    // --- compute_progress_bps ---

    #[test]
    fn test_compute_progress_bps_half_funded() {
        assert_eq!(compute_progress_bps(500, 1_000), 5_000);
    }

    #[test]
    fn test_compute_progress_bps_fully_funded() {
        assert_eq!(compute_progress_bps(1_000, 1_000), 10_000);
    }

    /// @security Over-funded campaigns must cap at 100 %, not overflow.
    #[test]
    fn test_compute_progress_bps_over_funded_capped() {
        assert_eq!(compute_progress_bps(2_000, 1_000), 10_000);
    }

    /// @security goal == 0 must return 0, not panic.
    #[test]
    fn test_compute_progress_bps_zero_goal_returns_zero() {
        assert_eq!(compute_progress_bps(500, 0), 0);
    }

    /// @security Negative raised must return 0, not a wrapped value.
    #[test]
    fn test_compute_progress_bps_negative_raised_returns_zero() {
        assert_eq!(compute_progress_bps(-100, 1_000), 0);
    }

    #[test]
    fn test_compute_progress_bps_zero_raised() {
        assert_eq!(compute_progress_bps(0, 1_000), 0);
    }

    // --- clamp_proptest_cases ---

    #[test]
    fn test_clamp_proptest_cases_below_min() {
        assert_eq!(clamp_proptest_cases(0), PROPTEST_CASES_MIN);
    }

    #[test]
    fn test_clamp_proptest_cases_at_min() {
        assert_eq!(clamp_proptest_cases(PROPTEST_CASES_MIN), PROPTEST_CASES_MIN);
    }

    #[test]
    fn test_clamp_proptest_cases_midpoint() {
        assert_eq!(clamp_proptest_cases(100), 100);
    }

    #[test]
    fn test_clamp_proptest_cases_at_max() {
        assert_eq!(clamp_proptest_cases(PROPTEST_CASES_MAX), PROPTEST_CASES_MAX);
    }

    #[test]
    fn test_clamp_proptest_cases_above_max() {
        assert_eq!(clamp_proptest_cases(1_000), PROPTEST_CASES_MAX);
    }

    // ── 3. On-Chain Contract Tests ────────────────────────────────────────────

    #[test]
    fn test_contract_constants_match_rust_constants() {
        let (_env, client) = setup();
        assert_eq!(client.deadline_offset_min(), DEADLINE_OFFSET_MIN);
        assert_eq!(client.deadline_offset_max(), DEADLINE_OFFSET_MAX);
        assert_eq!(client.goal_min(), GOAL_MIN);
        assert_eq!(client.goal_max(), GOAL_MAX);
        assert_eq!(client.min_contribution_floor(), MIN_CONTRIBUTION_FLOOR);
    }

    #[test]
    fn test_contract_is_valid_deadline_offset() {
        let (_env, client) = setup();
        assert!(client.is_valid_deadline_offset(&DEADLINE_OFFSET_MIN));
        assert!(client.is_valid_deadline_offset(&500_000u64));
        assert!(client.is_valid_deadline_offset(&DEADLINE_OFFSET_MAX));
        assert!(!client.is_valid_deadline_offset(&(DEADLINE_OFFSET_MIN - 1)));
        assert!(!client.is_valid_deadline_offset(&(DEADLINE_OFFSET_MAX + 1)));
    }

    #[test]
    fn test_contract_is_valid_goal() {
        let (_env, client) = setup();
        assert!(client.is_valid_goal(&GOAL_MIN));
        assert!(client.is_valid_goal(&50_000_000i128));
        assert!(client.is_valid_goal(&GOAL_MAX));
        assert!(!client.is_valid_goal(&(GOAL_MIN - 1)));
        assert!(!client.is_valid_goal(&(GOAL_MAX + 1)));
    }

    #[test]
    fn test_contract_clamp_proptest_cases() {
        let (_env, client) = setup();
        assert_eq!(client.clamp_proptest_cases(&0u32), PROPTEST_CASES_MIN);
        assert_eq!(client.clamp_proptest_cases(&100u32), 100);
        assert_eq!(client.clamp_proptest_cases(&1_000u32), PROPTEST_CASES_MAX);
    }

    #[test]
    fn test_contract_compute_progress_bps() {
        let (_env, client) = setup();
        assert_eq!(client.compute_progress_bps(&500i128, &1_000i128), 5_000);
        assert_eq!(client.compute_progress_bps(&2_000i128, &1_000i128), 10_000);
        assert_eq!(client.compute_progress_bps(&500i128, &0i128), 0);
        assert_eq!(client.compute_progress_bps(&(-100i128), &1_000i128), 0);
    }

    #[test]
    fn test_contract_log_tag() {
        let (env, client) = setup();
        assert_eq!(client.log_tag(), Symbol::new(&env, "boundary"));
    }

    // ── 4. Property-Based Tests ───────────────────────────────────────────────

    proptest! {
        #![proptest_config(ProptestConfig::with_cases(64))]

        /// Any offset in [MIN, MAX] must be accepted.
        #[test]
        fn prop_valid_deadline_offset_always_accepted(
            offset in DEADLINE_OFFSET_MIN..=DEADLINE_OFFSET_MAX
        ) {
            prop_assert!(is_valid_deadline_offset(offset));
        }

        /// Any offset below MIN must be rejected.
        #[test]
        fn prop_deadline_offset_below_min_always_rejected(
            offset in 0u64..DEADLINE_OFFSET_MIN
        ) {
            prop_assert!(!is_valid_deadline_offset(offset));
        }

        /// Any offset above MAX must be rejected.
        #[test]
        fn prop_deadline_offset_above_max_always_rejected(
            offset in (DEADLINE_OFFSET_MAX + 1)..=(DEADLINE_OFFSET_MAX + 100_000)
        ) {
            prop_assert!(!is_valid_deadline_offset(offset));
        }

        /// Any goal in [MIN, MAX] must be accepted.
        #[test]
        fn prop_valid_goal_always_accepted(goal in GOAL_MIN..=GOAL_MAX) {
            prop_assert!(is_valid_goal(goal));
        }

        /// Any goal below MIN must be rejected.
        #[test]
        fn prop_goal_below_min_always_rejected(goal in (-1_000_000i128..GOAL_MIN)) {
            prop_assert!(!is_valid_goal(goal));
        }

        /// Any goal above MAX must be rejected.
        #[test]
        fn prop_goal_above_max_always_rejected(
            goal in (GOAL_MAX + 1)..=(GOAL_MAX + 1_000_000)
        ) {
            prop_assert!(!is_valid_goal(goal));
        }

        /// Progress bps must never exceed PROGRESS_BPS_CAP for any raised/goal combo.
        #[test]
        fn prop_progress_bps_never_exceeds_cap(
            raised in -1_000i128..=200_000_000i128,
            goal in GOAL_MIN..=GOAL_MAX
        ) {
            let bps = compute_progress_bps(raised, goal);
            prop_assert!(bps <= PROGRESS_BPS_CAP);
        }

        /// clamp_progress_bps must never exceed PROGRESS_BPS_CAP.
        #[test]
        fn prop_clamp_progress_bps_never_exceeds_cap(raw in -100_000i128..=100_000i128) {
            prop_assert!(clamp_progress_bps(raw) <= PROGRESS_BPS_CAP);
        }

        /// clamp_proptest_cases output must always be in [MIN, MAX].
        #[test]
        fn prop_clamp_proptest_cases_always_in_bounds(requested in 0u32..=1_000u32) {
            let clamped = clamp_proptest_cases(requested);
            prop_assert!(clamped >= PROPTEST_CASES_MIN);
            prop_assert!(clamped <= PROPTEST_CASES_MAX);
        }

        /// min_contribution in [1, goal] must always be valid for that goal.
        #[test]
        fn prop_min_contribution_in_range_always_valid(
            (goal, min) in (GOAL_MIN..=GOAL_MAX)
                .prop_flat_map(|g| (Just(g), MIN_CONTRIBUTION_FLOOR..=g))
        ) {
            prop_assert!(is_valid_min_contribution(min, goal));
        }

        /// Contribution >= min_contribution must always be valid.
        #[test]
        fn prop_contribution_at_or_above_min_always_valid(
            (min_contribution, amount) in (MIN_CONTRIBUTION_FLOOR..=1_000_000i128)
                .prop_flat_map(|m| (Just(m), m..=(m + 10_000_000)))
        ) {
            prop_assert!(is_valid_contribution_amount(amount, min_contribution));
        }
    }

    // ── 5. Regression Seeds ───────────────────────────────────────────────────
    //
    // These inputs previously caused test failures and are pinned here to
    // prevent regressions.

    /// @notice Seed: goal=1M, offset=100 — the old buggy minimum caused flaky CI.
    #[test]
    fn regression_seed_goal_1m_offset_100_rejected() {
        assert!(is_valid_goal(1_000_000));
        assert!(!is_valid_deadline_offset(100)); // 100 is below the fixed MIN of 1_000
    }

    /// @notice Seed: goal=2M, offset=100, contribution=100K.
    #[test]
    fn regression_seed_goal_2m_offset_100_rejected() {
        assert!(is_valid_goal(2_000_000));
        assert!(!is_valid_deadline_offset(100));
        assert!(is_valid_contribution_amount(100_000, 1_000));
    }

    // ── 6. Frontend UX Edge Cases ─────────────────────────────────────────────

    /// @notice A 0 % progress bar must render as exactly 0, not a negative number.
    #[test]
    fn frontend_zero_raised_renders_zero_percent() {
        assert_eq!(compute_progress_bps(0, GOAL_MIN), 0);
    }

    /// @notice A 100 % progress bar must render as exactly 10 000 bps.
    #[test]
    fn frontend_fully_funded_renders_100_percent() {
        assert_eq!(compute_progress_bps(GOAL_MIN, GOAL_MIN), 10_000);
    }

    /// @notice An over-funded campaign must still render as 100 %, not > 100 %.
    #[test]
    fn frontend_over_funded_capped_at_100_percent() {
        assert_eq!(compute_progress_bps(GOAL_MAX * 2, GOAL_MIN), 10_000);
    }

    /// @notice Fee cap must equal progress cap so both display consistently.
    #[test]
    fn frontend_fee_cap_equals_progress_cap() {
        assert_eq!(FEE_BPS_CAP, PROGRESS_BPS_CAP);
    }

    /// @notice Deadline offset of exactly 1 000 s renders a valid countdown.
    #[test]
    fn frontend_minimum_deadline_renders_valid_countdown() {
        assert!(is_valid_deadline_offset(1_000));
    }
}
