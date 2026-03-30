//! # computation_optimization.test.rs
//!
//! @notice  Comprehensive test suite for `computation_optimization`.
//!          Covers happy paths, failure paths, boundary conditions, overflow
//!          guards, and security assumption validation.
//!
//! @dev     Tests are grouped to mirror the seven sections of the module:
//!          1. `isqrt`
//!          2. `weighted_average`
//!          3. `tiered_fee_bps`
//!          4. `batch_min_max`
//!          5. `percentile_rank_bps`
//!          6. `deadline_proximity_bps`
//!          7. `compound_progress_bps`
//!
//! @custom:security-note  Every overflow / underflow path is explicitly tested
//!          to confirm `None` is returned rather than a silent wrap-around.

#![cfg(test)]

use crate::computation_optimization::{
    batch_min_max, compound_progress_bps, deadline_proximity_bps, isqrt, percentile_rank_bps,
    tiered_fee_bps, weighted_average, BPS_SCALE, MAX_BATCH, MAX_TIERS,
    FeeTier,
};

// ─────────────────────────────────────────────────────────────────────────────
// 1. isqrt
// ─────────────────────────────────────────────────────────────────────────────

/// @notice  Base case: isqrt(0) == 0.
#[test]
fn isqrt_zero() {
    assert_eq!(isqrt(0), 0);
}

/// @notice  Base case: isqrt(1) == 1.
#[test]
fn isqrt_one() {
    assert_eq!(isqrt(1), 1);
}

/// @notice  Perfect square: isqrt(4) == 2.
#[test]
fn isqrt_perfect_square_4() {
    assert_eq!(isqrt(4), 2);
}

/// @notice  Perfect square: isqrt(9) == 3.
#[test]
fn isqrt_perfect_square_9() {
    assert_eq!(isqrt(9), 3);
}

/// @notice  Perfect square: isqrt(100) == 10.
#[test]
fn isqrt_perfect_square_100() {
    assert_eq!(isqrt(100), 10);
}

/// @notice  Non-perfect square: isqrt(2) == 1 (floor).
#[test]
fn isqrt_non_perfect_floor_2() {
    assert_eq!(isqrt(2), 1);
}

/// @notice  Non-perfect square: isqrt(3) == 1 (floor).
#[test]
fn isqrt_non_perfect_floor_3() {
    assert_eq!(isqrt(3), 1);
}

/// @notice  Non-perfect square: isqrt(8) == 2 (floor).
#[test]
fn isqrt_non_perfect_floor_8() {
    assert_eq!(isqrt(8), 2);
}

/// @notice  Large perfect square: isqrt(1_000_000) == 1_000.
#[test]
fn isqrt_large_perfect_square() {
    assert_eq!(isqrt(1_000_000), 1_000);
}

/// @notice  Large non-perfect: isqrt(999_999) == 999.
#[test]
fn isqrt_large_non_perfect() {
    assert_eq!(isqrt(999_999), 999);
}

/// @notice  Invariant: isqrt(n)^2 <= n < (isqrt(n)+1)^2 for all n.
/// @custom:security-note  Confirms the floor property holds for a range of values.
#[test]
fn isqrt_floor_invariant() {
    for n in 0u128..=1024 {
        let r = isqrt(n);
        assert!(r * r <= n, "r*r > n for n={n}");
        assert!((r + 1) * (r + 1) > n, "(r+1)^2 <= n for n={n}");
    }
}

/// @notice  Edge case: isqrt(u128::MAX) does not panic.
#[test]
fn isqrt_u128_max_no_panic() {
    let r = isqrt(u128::MAX);
    assert!(r * r <= u128::MAX);
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. weighted_average
// ─────────────────────────────────────────────────────────────────────────────

/// @notice  Happy path: equal weights produce a simple average.
#[test]
fn weighted_avg_equal_weights() {
    let amounts = [100i128, 200, 300];
    let weights = [1i128, 1, 1];
    assert_eq!(weighted_average(&amounts, &weights), Some(200));
}

/// @notice  Happy path: unequal weights skew the result.
#[test]
fn weighted_avg_unequal_weights() {
    // (100*1 + 200*3) / (1+3) = 700/4 = 175
    let amounts = [100i128, 200];
    let weights = [1i128, 3];
    assert_eq!(weighted_average(&amounts, &weights), Some(175));
}

/// @notice  Happy path: single element returns that element.
#[test]
fn weighted_avg_single_element() {
    assert_eq!(weighted_average(&[500], &[7]), Some(500));
}

/// @notice  Failure path: mismatched slice lengths return None.
#[test]
fn weighted_avg_mismatched_lengths_returns_none() {
    assert_eq!(weighted_average(&[100, 200], &[1]), None);
}

/// @notice  Failure path: zero total weight returns None.
#[test]
fn weighted_avg_zero_total_weight_returns_none() {
    assert_eq!(weighted_average(&[100, 200], &[0, 0]), None);
}

/// @notice  Failure path: negative weight returns None.
/// @custom:security-note  Negative weights could invert the average.
#[test]
fn weighted_avg_negative_weight_returns_none() {
    assert_eq!(weighted_average(&[100], &[-1]), None);
}

/// @notice  Failure path: negative amount returns None.
#[test]
fn weighted_avg_negative_amount_returns_none() {
    assert_eq!(weighted_average(&[-100], &[1]), None);
}

/// @notice  Failure path: oversized slice returns None.
/// @custom:security-note  Prevents unbounded gas consumption.
#[test]
fn weighted_avg_oversized_slice_returns_none() {
    let amounts = vec![1i128; MAX_BATCH + 1];
    let weights = vec![1i128; MAX_BATCH + 1];
    assert_eq!(weighted_average(&amounts, &weights), None);
}

/// @notice  Failure path: overflow in product returns None.
/// @custom:security-note  Confirms checked_mul fires correctly.
#[test]
fn weighted_avg_overflow_returns_none() {
    assert_eq!(weighted_average(&[i128::MAX], &[2]), None);
}

/// @notice  Edge case: empty slices return None (zero weight).
#[test]
fn weighted_avg_empty_slices_returns_none() {
    assert_eq!(weighted_average(&[], &[]), None);
}

/// @notice  Edge case: exactly MAX_BATCH elements is accepted.
#[test]
fn weighted_avg_at_max_batch_accepted() {
    let amounts = vec![10i128; MAX_BATCH];
    let weights = vec![1i128; MAX_BATCH];
    assert_eq!(weighted_average(&amounts, &weights), Some(10));
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. tiered_fee_bps
// ─────────────────────────────────────────────────────────────────────────────

fn default_tiers() -> [FeeTier; 3] {
    [
        FeeTier { threshold: 1_000,  fee_bps: 500  }, // 5 %
        FeeTier { threshold: 10_000, fee_bps: 300  }, // 3 %
        FeeTier { threshold: i128::MAX, fee_bps: 100 }, // 1 %
    ]
}

/// @notice  Happy path: amount in first tier.
#[test]
fn tiered_fee_first_tier() {
    // 500 * 500 / 10_000 = 25
    assert_eq!(tiered_fee_bps(500, &default_tiers()), Some(25));
}

/// @notice  Happy path: amount exactly at first tier threshold.
#[test]
fn tiered_fee_at_first_threshold() {
    // 1_000 * 500 / 10_000 = 50
    assert_eq!(tiered_fee_bps(1_000, &default_tiers()), Some(50));
}

/// @notice  Happy path: amount in second tier.
#[test]
fn tiered_fee_second_tier() {
    // 5_000 * 300 / 10_000 = 150
    assert_eq!(tiered_fee_bps(5_000, &default_tiers()), Some(150));
}

/// @notice  Happy path: amount exceeds all thresholds — falls back to last tier.
#[test]
fn tiered_fee_fallback_last_tier() {
    // 100_000 * 100 / 10_000 = 1_000
    assert_eq!(tiered_fee_bps(100_000, &default_tiers()), Some(1_000));
}

/// @notice  Happy path: single tier.
#[test]
fn tiered_fee_single_tier() {
    let tiers = [FeeTier { threshold: i128::MAX, fee_bps: 200 }];
    // 1_000 * 200 / 10_000 = 20
    assert_eq!(tiered_fee_bps(1_000, &tiers), Some(20));
}

/// @notice  Failure path: empty tiers returns None.
#[test]
fn tiered_fee_empty_tiers_returns_none() {
    assert_eq!(tiered_fee_bps(100, &[]), None);
}

/// @notice  Failure path: zero amount returns None.
#[test]
fn tiered_fee_zero_amount_returns_none() {
    assert_eq!(tiered_fee_bps(0, &default_tiers()), None);
}

/// @notice  Failure path: negative amount returns None.
/// @custom:security-note  Negative amounts must never produce a negative fee.
#[test]
fn tiered_fee_negative_amount_returns_none() {
    assert_eq!(tiered_fee_bps(-1, &default_tiers()), None);
}

/// @notice  Failure path: too many tiers returns None.
#[test]
fn tiered_fee_too_many_tiers_returns_none() {
    let tiers = vec![FeeTier { threshold: 1_000, fee_bps: 100 }; MAX_TIERS + 1];
    assert_eq!(tiered_fee_bps(100, &tiers), None);
}

/// @notice  Edge case: zero fee_bps produces zero fee.
#[test]
fn tiered_fee_zero_fee_bps() {
    let tiers = [FeeTier { threshold: i128::MAX, fee_bps: 0 }];
    assert_eq!(tiered_fee_bps(1_000, &tiers), Some(0));
}

/// @notice  Edge case: exactly MAX_TIERS tiers is accepted.
#[test]
fn tiered_fee_at_max_tiers_accepted() {
    let tiers = vec![FeeTier { threshold: i128::MAX, fee_bps: 100 }; MAX_TIERS];
    assert!(tiered_fee_bps(1_000, &tiers).is_some());
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. batch_min_max
// ─────────────────────────────────────────────────────────────────────────────

/// @notice  Happy path: single element — min == max.
#[test]
fn batch_min_max_single() {
    assert_eq!(batch_min_max(&[42]), Some((42, 42)));
}

/// @notice  Happy path: two elements.
#[test]
fn batch_min_max_two_elements() {
    assert_eq!(batch_min_max(&[10, 20]), Some((10, 20)));
}

/// @notice  Happy path: multiple elements.
#[test]
fn batch_min_max_multiple() {
    assert_eq!(batch_min_max(&[5, 1, 9, 3, 7]), Some((1, 9)));
}

/// @notice  Happy path: all equal elements.
#[test]
fn batch_min_max_all_equal() {
    assert_eq!(batch_min_max(&[4, 4, 4]), Some((4, 4)));
}

/// @notice  Happy path: negative values.
#[test]
fn batch_min_max_negative_values() {
    assert_eq!(batch_min_max(&[-5, -1, -9]), Some((-9, -1)));
}

/// @notice  Happy path: mixed positive and negative.
#[test]
fn batch_min_max_mixed_signs() {
    assert_eq!(batch_min_max(&[-3, 0, 5]), Some((-3, 5)));
}

/// @notice  Failure path: empty slice returns None.
#[test]
fn batch_min_max_empty_returns_none() {
    assert_eq!(batch_min_max(&[]), None);
}

/// @notice  Failure path: oversized slice returns None.
/// @custom:security-note  Prevents unbounded gas consumption.
#[test]
fn batch_min_max_oversized_returns_none() {
    let values = vec![1i128; MAX_BATCH + 1];
    assert_eq!(batch_min_max(&values), None);
}

/// @notice  Edge case: exactly MAX_BATCH elements is accepted.
#[test]
fn batch_min_max_at_max_batch_accepted() {
    let values = vec![1i128; MAX_BATCH];
    assert!(batch_min_max(&values).is_some());
}

/// @notice  Edge case: i128::MIN and i128::MAX in same slice.
#[test]
fn batch_min_max_extreme_values() {
    assert_eq!(
        batch_min_max(&[i128::MIN, 0, i128::MAX]),
        Some((i128::MIN, i128::MAX))
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// 5. percentile_rank_bps
// ─────────────────────────────────────────────────────────────────────────────

/// @notice  Happy path: target is the maximum — 100th percentile.
#[test]
fn percentile_rank_maximum_value() {
    assert_eq!(percentile_rank_bps(100, &[10, 50, 100]), Some(BPS_SCALE));
}

/// @notice  Happy path: target is the minimum — lowest percentile.
#[test]
fn percentile_rank_minimum_value() {
    // 1 out of 3 values ≤ 10 → 1/3 * 10_000 = 3_333
    assert_eq!(percentile_rank_bps(10, &[10, 50, 100]), Some(3_333));
}

/// @notice  Happy path: target below all values — 0th percentile.
#[test]
fn percentile_rank_below_all() {
    // 0 out of 3 values ≤ 5 → 0
    assert_eq!(percentile_rank_bps(5, &[10, 50, 100]), Some(0));
}

/// @notice  Happy path: target equals all values — 100th percentile.
#[test]
fn percentile_rank_all_equal() {
    assert_eq!(percentile_rank_bps(7, &[7, 7, 7]), Some(BPS_SCALE));
}

/// @notice  Happy path: single element equal to target.
#[test]
fn percentile_rank_single_equal() {
    assert_eq!(percentile_rank_bps(42, &[42]), Some(BPS_SCALE));
}

/// @notice  Happy path: single element above target.
#[test]
fn percentile_rank_single_above() {
    assert_eq!(percentile_rank_bps(1, &[100]), Some(0));
}

/// @notice  Failure path: empty slice returns None.
#[test]
fn percentile_rank_empty_returns_none() {
    assert_eq!(percentile_rank_bps(10, &[]), None);
}

/// @notice  Failure path: oversized slice returns None.
/// @custom:security-note  Prevents unbounded gas consumption.
#[test]
fn percentile_rank_oversized_returns_none() {
    let values = vec![1i128; MAX_BATCH + 1];
    assert_eq!(percentile_rank_bps(1, &values), None);
}

/// @notice  Edge case: exactly MAX_BATCH elements is accepted.
#[test]
fn percentile_rank_at_max_batch_accepted() {
    let values = vec![1i128; MAX_BATCH];
    assert!(percentile_rank_bps(1, &values).is_some());
}

// ─────────────────────────────────────────────────────────────────────────────
// 6. deadline_proximity_bps
// ─────────────────────────────────────────────────────────────────────────────

/// @notice  Happy path: exactly at start — score is 0.
#[test]
fn deadline_proximity_at_start() {
    assert_eq!(deadline_proximity_bps(0, 0, 1_000), 0);
}

/// @notice  Happy path: halfway through — score is ~5000 bps.
#[test]
fn deadline_proximity_halfway() {
    assert_eq!(deadline_proximity_bps(500, 0, 1_000), 5_000);
}

/// @notice  Happy path: exactly at deadline — score is BPS_SCALE.
#[test]
fn deadline_proximity_at_deadline() {
    assert_eq!(deadline_proximity_bps(1_000, 0, 1_000), BPS_SCALE as u32);
}

/// @notice  Happy path: past deadline — score is BPS_SCALE (clamped).
#[test]
fn deadline_proximity_past_deadline() {
    assert_eq!(deadline_proximity_bps(2_000, 0, 1_000), BPS_SCALE as u32);
}

/// @notice  Happy path: one second before deadline.
#[test]
fn deadline_proximity_one_second_before() {
    // 999/1000 * 10_000 = 9_990
    assert_eq!(deadline_proximity_bps(999, 0, 1_000), 9_990);
}

/// @notice  Failure path: deadline == start returns 0 (invalid range).
#[test]
fn deadline_proximity_zero_duration_returns_zero() {
    assert_eq!(deadline_proximity_bps(500, 500, 500), 0);
}

/// @notice  Failure path: deadline < start returns 0.
#[test]
fn deadline_proximity_deadline_before_start_returns_zero() {
    assert_eq!(deadline_proximity_bps(500, 1_000, 500), 0);
}

/// @notice  Failure path: now < start returns 0 (campaign not started).
#[test]
fn deadline_proximity_before_start_returns_zero() {
    assert_eq!(deadline_proximity_bps(50, 100, 1_000), 0);
}

/// @notice  Edge case: non-zero start offset.
#[test]
fn deadline_proximity_non_zero_start() {
    // elapsed = 600-100 = 500, duration = 1100-100 = 1000 → 5000 bps
    assert_eq!(deadline_proximity_bps(600, 100, 1_100), 5_000);
}

/// @notice  Edge case: large timestamps do not overflow.
#[test]
fn deadline_proximity_large_timestamps() {
    let start = u64::MAX / 2;
    let deadline = start + 1_000;
    let now = start + 500;
    assert_eq!(deadline_proximity_bps(now, start, deadline), 5_000);
}

// ─────────────────────────────────────────────────────────────────────────────
// 7. compound_progress_bps
// ─────────────────────────────────────────────────────────────────────────────

/// @notice  Happy path: single goal, half raised.
#[test]
fn compound_progress_single_goal_half() {
    assert_eq!(compound_progress_bps(500, &[1_000]), Some(vec![5_000]));
}

/// @notice  Happy path: single goal, fully met.
#[test]
fn compound_progress_single_goal_full() {
    assert_eq!(compound_progress_bps(1_000, &[1_000]), Some(vec![10_000]));
}

/// @notice  Happy path: multiple goals, varying progress.
#[test]
fn compound_progress_multiple_goals() {
    // raised=500: goal1=1000→5000bps, goal2=500→10000bps, goal3=2000→2500bps
    let result = compound_progress_bps(500, &[1_000, 500, 2_000]);
    assert_eq!(result, Some(vec![5_000, 10_000, 2_500]));
}

/// @notice  Happy path: zero raised — all goals at 0 bps.
#[test]
fn compound_progress_zero_raised() {
    assert_eq!(compound_progress_bps(0, &[1_000, 2_000]), Some(vec![0, 0]));
}

/// @notice  Happy path: raised exceeds goal — saturates at BPS_SCALE.
#[test]
fn compound_progress_over_goal_saturates() {
    assert_eq!(compound_progress_bps(2_000, &[1_000]), Some(vec![10_000]));
}

/// @notice  Failure path: empty goals returns None.
#[test]
fn compound_progress_empty_goals_returns_none() {
    assert_eq!(compound_progress_bps(500, &[]), None);
}

/// @notice  Failure path: zero goal returns None.
/// @custom:security-note  Division by zero must be prevented.
#[test]
fn compound_progress_zero_goal_returns_none() {
    assert_eq!(compound_progress_bps(500, &[1_000, 0]), None);
}

/// @notice  Failure path: negative goal returns None.
#[test]
fn compound_progress_negative_goal_returns_none() {
    assert_eq!(compound_progress_bps(500, &[-1]), None);
}

/// @notice  Failure path: oversized goals slice returns None.
/// @custom:security-note  Prevents unbounded gas consumption.
#[test]
fn compound_progress_oversized_returns_none() {
    let goals = vec![1_000i128; MAX_BATCH + 1];
    assert_eq!(compound_progress_bps(500, &goals), None);
}

/// @notice  Edge case: exactly MAX_BATCH goals is accepted.
#[test]
fn compound_progress_at_max_batch_accepted() {
    let goals = vec![1_000i128; MAX_BATCH];
    assert!(compound_progress_bps(500, &goals).is_some());
}

/// @notice  Edge case: negative total_raised produces 0 bps for all goals.
#[test]
fn compound_progress_negative_raised_produces_zero() {
    // saturating_mul(-500, 10_000) = -5_000_000; clamp(0, 10_000) = 0
    let result = compound_progress_bps(-500, &[1_000]);
    assert_eq!(result, Some(vec![0]));
}

// ─────────────────────────────────────────────────────────────────────────────
// 8. Security assumption validation
// ─────────────────────────────────────────────────────────────────────────────

/// @notice  BPS_SCALE is exactly 10_000.
#[test]
fn security_bps_scale_is_10000() {
    assert_eq!(BPS_SCALE, 10_000);
}

/// @notice  MAX_BATCH is exactly 50.
#[test]
fn security_max_batch_is_50() {
    assert_eq!(MAX_BATCH, 50);
}

/// @notice  MAX_TIERS is exactly 8.
#[test]
fn security_max_tiers_is_8() {
    assert_eq!(MAX_TIERS, 8);
}

/// @notice  isqrt never panics on any u128 value (spot-check large values).
#[test]
fn security_isqrt_no_panic_spot_check() {
    for n in [0u128, 1, 2, u64::MAX as u128, u128::MAX / 2, u128::MAX] {
        let _ = isqrt(n);
    }
}

/// @notice  weighted_average with all-zero weights returns None, not zero.
/// @custom:security-note  Zero-weight average is undefined; must not silently
///          return 0 which could be mistaken for a valid result.
#[test]
fn security_weighted_avg_all_zero_weights_is_none() {
    assert_eq!(weighted_average(&[100, 200], &[0, 0]), None);
}

/// @notice  tiered_fee_bps never returns a fee larger than the amount.
/// @custom:security-note  Fee > amount would be economically invalid.
#[test]
fn security_tiered_fee_never_exceeds_amount() {
    let tiers = [FeeTier { threshold: i128::MAX, fee_bps: 10_000 }]; // 100% fee
    let amount = 1_000i128;
    let fee = tiered_fee_bps(amount, &tiers).unwrap();
    assert!(fee <= amount, "fee {fee} exceeds amount {amount}");
}

/// @notice  deadline_proximity_bps result is always in [0, BPS_SCALE].
#[test]
fn security_deadline_proximity_always_in_range() {
    let cases = [
        (0u64, 0u64, 1_000u64),
        (500, 0, 1_000),
        (1_000, 0, 1_000),
        (2_000, 0, 1_000),
        (50, 100, 1_000),
    ];
    for (now, start, deadline) in cases {
        let score = deadline_proximity_bps(now, start, deadline);
        assert!(score <= BPS_SCALE as u32, "score {score} out of range");
    }
}

/// @notice  compound_progress_bps results are always in [0, BPS_SCALE].
#[test]
fn security_compound_progress_always_in_range() {
    let cases: &[(i128, &[i128])] = &[
        (0, &[1_000]),
        (500, &[1_000]),
        (1_000, &[1_000]),
        (2_000, &[1_000]),
        (-500, &[1_000]),
    ];
    for (raised, goals) in cases {
        if let Some(results) = compound_progress_bps(*raised, goals) {
            for r in results {
                assert!(r <= BPS_SCALE as u32, "progress {r} out of range");
            }
        }
    }
}
