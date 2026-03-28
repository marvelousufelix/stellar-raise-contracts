//! Tests for loop_optimization.rs
//!
//! @notice Covers bounded iteration, early-exit, single-pass aggregation,
//!         deduplication, and all-satisfy semantics.
//! @dev    All tests are pure (no storage) except `deduplicate_sorted` which
//!         needs an `Env` to allocate the output `Vec`.

use soroban_sdk::{Env, Vec};

use crate::loop_optimization::{
    aggregate_stats, all_satisfy, bounded_sum, count_matching, deduplicate_sorted, find_first,
    LoopAggregateStats, MAX_LOOP_ITEMS,
};

// ── Helpers ───────────────────────────────────────────────────────────────────

fn vec_of(env: &Env, values: &[i128]) -> Vec<i128> {
    let mut v = Vec::new(env);
    for &x in values {
        v.push_back(x);
    }
    v
}

// ── bounded_sum ───────────────────────────────────────────────────────────────

#[test]
fn bounded_sum_empty_returns_zero() {
    let env = Env::default();
    assert_eq!(bounded_sum(&vec_of(&env, &[])), 0);
}

#[test]
fn bounded_sum_sums_all_items_under_cap() {
    let env = Env::default();
    assert_eq!(bounded_sum(&vec_of(&env, &[1, 2, 3, 4, 5])), 15);
}

#[test]
fn bounded_sum_saturates_on_overflow() {
    let env = Env::default();
    let v = vec_of(&env, &[i128::MAX, 1]);
    assert_eq!(bounded_sum(&v), i128::MAX);
}

#[test]
fn bounded_sum_respects_cap() {
    let env = Env::default();
    // Build a vec with MAX_LOOP_ITEMS + 1 elements, all equal to 1.
    let mut v: Vec<i128> = Vec::new(&env);
    for _ in 0..=(MAX_LOOP_ITEMS) {
        v.push_back(1);
    }
    // Only MAX_LOOP_ITEMS elements should be summed.
    assert_eq!(bounded_sum(&v), MAX_LOOP_ITEMS as i128);
}

// ── find_first ────────────────────────────────────────────────────────────────

#[test]
fn find_first_returns_none_for_empty() {
    let env = Env::default();
    assert_eq!(find_first(&vec_of(&env, &[]), |v| v > 0), None);
}

#[test]
fn find_first_returns_first_match() {
    let env = Env::default();
    assert_eq!(
        find_first(&vec_of(&env, &[1, 5, 3, 8]), |v| v > 4),
        Some(5)
    );
}

#[test]
fn find_first_returns_none_when_no_match() {
    let env = Env::default();
    assert_eq!(find_first(&vec_of(&env, &[1, 2, 3]), |v| v > 100), None);
}

#[test]
fn find_first_stops_at_cap() {
    let env = Env::default();
    // Place a matching element beyond the cap — should not be found.
    let mut v: Vec<i128> = Vec::new(&env);
    for _ in 0..MAX_LOOP_ITEMS {
        v.push_back(0);
    }
    v.push_back(99); // beyond cap
    assert_eq!(find_first(&v, |x| x == 99), None);
}

// ── count_matching ────────────────────────────────────────────────────────────

#[test]
fn count_matching_empty_returns_zero() {
    let env = Env::default();
    assert_eq!(count_matching(&vec_of(&env, &[]), |v| v > 0), 0);
}

#[test]
fn count_matching_counts_correctly() {
    let env = Env::default();
    assert_eq!(
        count_matching(&vec_of(&env, &[1, 2, 3, 4, 5]), |v| v % 2 == 0),
        2
    );
}

#[test]
fn count_matching_respects_cap() {
    let env = Env::default();
    let mut v: Vec<i128> = Vec::new(&env);
    for _ in 0..=(MAX_LOOP_ITEMS) {
        v.push_back(1);
    }
    assert_eq!(count_matching(&v, |x| x == 1), MAX_LOOP_ITEMS);
}

// ── aggregate_stats ───────────────────────────────────────────────────────────

#[test]
fn aggregate_stats_empty_returns_zero_struct() {
    let env = Env::default();
    assert_eq!(
        aggregate_stats(&vec_of(&env, &[])),
        LoopAggregateStats { count: 0, sum: 0, max: 0, min: 0 }
    );
}

#[test]
fn aggregate_stats_single_element() {
    let env = Env::default();
    assert_eq!(
        aggregate_stats(&vec_of(&env, &[42])),
        LoopAggregateStats { count: 1, sum: 42, max: 42, min: 42 }
    );
}

#[test]
fn aggregate_stats_multiple_elements() {
    let env = Env::default();
    let stats = aggregate_stats(&vec_of(&env, &[3, 1, 4, 1, 5, 9, 2, 6]));
    assert_eq!(stats.count, 8);
    assert_eq!(stats.sum, 31);
    assert_eq!(stats.max, 9);
    assert_eq!(stats.min, 1);
}

#[test]
fn aggregate_stats_negative_values() {
    let env = Env::default();
    let stats = aggregate_stats(&vec_of(&env, &[-5, -1, -3]));
    assert_eq!(stats.count, 3);
    assert_eq!(stats.sum, -9);
    assert_eq!(stats.max, -1);
    assert_eq!(stats.min, -5);
}

#[test]
fn aggregate_stats_respects_cap() {
    let env = Env::default();
    let mut v: Vec<i128> = Vec::new(&env);
    for _ in 0..=(MAX_LOOP_ITEMS) {
        v.push_back(1);
    }
    let stats = aggregate_stats(&v);
    assert_eq!(stats.count, MAX_LOOP_ITEMS);
    assert_eq!(stats.sum, MAX_LOOP_ITEMS as i128);
}

#[test]
fn aggregate_stats_sum_saturates() {
    let env = Env::default();
    let stats = aggregate_stats(&vec_of(&env, &[i128::MAX, i128::MAX]));
    assert_eq!(stats.sum, i128::MAX);
}

// ── deduplicate_sorted ────────────────────────────────────────────────────────

#[test]
fn deduplicate_sorted_empty_returns_empty() {
    let env = Env::default();
    let result = deduplicate_sorted(&env, &vec_of(&env, &[]));
    assert_eq!(result.len(), 0);
}

#[test]
fn deduplicate_sorted_no_duplicates_unchanged() {
    let env = Env::default();
    let result = deduplicate_sorted(&env, &vec_of(&env, &[1, 2, 3]));
    assert_eq!(result.len(), 3);
}

#[test]
fn deduplicate_sorted_removes_consecutive_duplicates() {
    let env = Env::default();
    let result = deduplicate_sorted(&env, &vec_of(&env, &[1, 1, 2, 2, 3]));
    assert_eq!(result.len(), 3);
    assert_eq!(result.get(0), Some(1));
    assert_eq!(result.get(1), Some(2));
    assert_eq!(result.get(2), Some(3));
}

#[test]
fn deduplicate_sorted_all_same() {
    let env = Env::default();
    let result = deduplicate_sorted(&env, &vec_of(&env, &[7, 7, 7, 7]));
    assert_eq!(result.len(), 1);
    assert_eq!(result.get(0), Some(7));
}

#[test]
fn deduplicate_sorted_respects_cap() {
    let env = Env::default();
    let mut v: Vec<i128> = Vec::new(&env);
    for i in 0..=(MAX_LOOP_ITEMS as i128) {
        v.push_back(i);
    }
    let result = deduplicate_sorted(&env, &v);
    assert_eq!(result.len(), MAX_LOOP_ITEMS);
}

// ── all_satisfy ───────────────────────────────────────────────────────────────

#[test]
fn all_satisfy_empty_returns_true() {
    let env = Env::default();
    assert!(all_satisfy(&vec_of(&env, &[]), |v| v > 0));
}

#[test]
fn all_satisfy_all_match() {
    let env = Env::default();
    assert!(all_satisfy(&vec_of(&env, &[2, 4, 6, 8]), |v| v % 2 == 0));
}

#[test]
fn all_satisfy_one_fails() {
    let env = Env::default();
    assert!(!all_satisfy(&vec_of(&env, &[2, 4, 5, 8]), |v| v % 2 == 0));
}

#[test]
fn all_satisfy_short_circuits_on_first_failure() {
    let env = Env::default();
    // First element fails — should return false immediately.
    assert!(!all_satisfy(&vec_of(&env, &[1, 2, 4, 6]), |v| v % 2 == 0));
}

#[test]
fn all_satisfy_respects_cap() {
    let env = Env::default();
    // All elements within cap satisfy; element beyond cap does not.
    let mut v: Vec<i128> = Vec::new(&env);
    for _ in 0..MAX_LOOP_ITEMS {
        v.push_back(2);
    }
    v.push_back(1); // odd, beyond cap
    assert!(all_satisfy(&v, |x| x % 2 == 0));
}
