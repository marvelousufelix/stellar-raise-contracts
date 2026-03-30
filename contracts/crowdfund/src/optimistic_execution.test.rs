//! Tests for the `optimistic_execution` module.
//!
//! @title   OptimisticExecution Test Suite
//! @notice  Covers all public functions: validate_entry, stage_optimistic_batch,
//!          commit_optimistic_state, estimate_gas_savings_bps, and OptimisticResult helpers.
//!          Includes happy paths, boundary values, and all error paths.
//!
//! Coverage targets (≥ 95%):
//! - validate_entry: positive, zero, negative amounts
//! - stage_optimistic_batch: empty, oversized, zero amount, negative, valid single, valid multi
//! - commit_optimistic_state: new contributor, existing contributor, total accumulation
//! - estimate_gas_savings_bps: zero, one, multi, cap enforcement
//! - OptimisticResult: is_committed, abort_reason helpers

#![cfg(test)]

use soroban_sdk::{testutils::Address as _, Address, Env, Vec};

use crate::{
    optimistic_execution::{
        commit_optimistic_state, estimate_gas_savings_bps, stage_optimistic_batch, validate_entry,
        OptimisticEntry, OptimisticResult, BPS_SCALE, MAX_OPTIMISTIC_BATCH,
    },
    DataKey,
};

// ── Helpers ───────────────────────────────────────────────────────────────────

fn make_entry(env: &Env, amount: i128) -> OptimisticEntry {
    OptimisticEntry {
        contributor: Address::generate(env),
        amount,
    }
}

fn make_batch(env: &Env, amounts: &[i128]) -> Vec<OptimisticEntry> {
    let mut v: Vec<OptimisticEntry> = Vec::new(env);
    for &amt in amounts {
        v.push_back(make_entry(env, amt));
    }
    v
}

fn read_contribution(env: &Env, addr: &Address) -> i128 {
    env.storage()
        .persistent()
        .get(&DataKey::Contribution(addr.clone()))
        .unwrap_or(0)
}

fn read_total_raised(env: &Env) -> i128 {
    env.storage()
        .persistent()
        .get(&DataKey::TotalRaised)
        .unwrap_or(0)
}

// ── OptimisticResult helpers ──────────────────────────────────────────────────

#[test]
fn result_committed_is_committed() {
    let env = Env::default();
    let batch = make_batch(&env, &[100]);
    let result = stage_optimistic_batch(&batch);
    assert!(result.is_committed());
    assert_eq!(result.abort_reason(), "");
}

#[test]
fn result_aborted_is_not_committed() {
    let env = Env::default();
    let batch: Vec<OptimisticEntry> = Vec::new(&env);
    let result = stage_optimistic_batch(&batch);
    assert!(!result.is_committed());
    assert_eq!(result.abort_reason(), "batch is empty");
}

// ── validate_entry ────────────────────────────────────────────────────────────

#[test]
fn validate_entry_positive_amount_is_valid() {
    let env = Env::default();
    let entry = make_entry(&env, 1);
    assert!(validate_entry(&entry));
}

#[test]
fn validate_entry_large_amount_is_valid() {
    let env = Env::default();
    let entry = make_entry(&env, i128::MAX / 2);
    assert!(validate_entry(&entry));
}

#[test]
fn validate_entry_zero_amount_is_invalid() {
    let env = Env::default();
    let entry = make_entry(&env, 0);
    assert!(!validate_entry(&entry));
}

#[test]
fn validate_entry_negative_amount_is_invalid() {
    let env = Env::default();
    let entry = make_entry(&env, -1);
    assert!(!validate_entry(&entry));
}

// ── stage_optimistic_batch ────────────────────────────────────────────────────

#[test]
fn stage_empty_batch_aborts() {
    let env = Env::default();
    let batch: Vec<OptimisticEntry> = Vec::new(&env);
    let result = stage_optimistic_batch(&batch);
    assert!(!result.is_committed());
    assert_eq!(result.abort_reason(), "batch is empty");
}

#[test]
#[should_panic(expected = "MAX_OPTIMISTIC_BATCH")]
fn stage_oversized_batch_panics() {
    let env = Env::default();
    let mut batch: Vec<OptimisticEntry> = Vec::new(&env);
    for _ in 0..=MAX_OPTIMISTIC_BATCH {
        batch.push_back(make_entry(&env, 100));
    }
    stage_optimistic_batch(&batch);
}

#[test]
fn stage_zero_amount_aborts() {
    let env = Env::default();
    let batch = make_batch(&env, &[100, 0, 50]);
    let result = stage_optimistic_batch(&batch);
    assert!(!result.is_committed());
    assert_eq!(result.abort_reason(), "entry amount must be positive");
}

#[test]
fn stage_negative_amount_aborts() {
    let env = Env::default();
    let batch = make_batch(&env, &[100, -1]);
    let result = stage_optimistic_batch(&batch);
    assert!(!result.is_committed());
    assert_eq!(result.abort_reason(), "entry amount must be positive");
}

#[test]
fn stage_single_entry_committed() {
    let env = Env::default();
    let batch = make_batch(&env, &[500]);
    let result = stage_optimistic_batch(&batch);
    assert!(result.is_committed());
    if let OptimisticResult::Committed(state) = result {
        assert_eq!(state.total_delta, 500);
        assert_eq!(state.entry_count, 1);
        assert_eq!(state.max_single, 500);
    }
}

#[test]
fn stage_multi_entry_accumulates_correctly() {
    let env = Env::default();
    let batch = make_batch(&env, &[100, 200, 300]);
    let result = stage_optimistic_batch(&batch);
    assert!(result.is_committed());
    if let OptimisticResult::Committed(state) = result {
        assert_eq!(state.total_delta, 600);
        assert_eq!(state.entry_count, 3);
        assert_eq!(state.max_single, 300);
    }
}

#[test]
fn stage_max_batch_size_succeeds() {
    let env = Env::default();
    let amounts: Vec<i128> = (0..MAX_OPTIMISTIC_BATCH).map(|_| 10).collect();
    let batch = make_batch(&env, &amounts);
    let result = stage_optimistic_batch(&batch);
    assert!(result.is_committed());
    if let OptimisticResult::Committed(state) = result {
        assert_eq!(state.entry_count, MAX_OPTIMISTIC_BATCH);
        assert_eq!(state.total_delta, 10 * MAX_OPTIMISTIC_BATCH as i128);
    }
}

// ── commit_optimistic_state ───────────────────────────────────────────────────

#[test]
fn commit_writes_contributor_balance() {
    let env = Env::default();
    let addr = Address::generate(&env);
    let mut batch: Vec<OptimisticEntry> = Vec::new(&env);
    batch.push_back(OptimisticEntry { contributor: addr.clone(), amount: 250 });

    let result = stage_optimistic_batch(&batch);
    if let OptimisticResult::Committed(state) = result {
        commit_optimistic_state(&env, &batch, &state);
        assert_eq!(read_contribution(&env, &addr), 250);
        assert_eq!(read_total_raised(&env), 250);
    }
}

#[test]
fn commit_accumulates_existing_balance() {
    let env = Env::default();
    let addr = Address::generate(&env);
    env.storage()
        .persistent()
        .set(&DataKey::Contribution(addr.clone()), &(100_i128));

    let mut batch: Vec<OptimisticEntry> = Vec::new(&env);
    batch.push_back(OptimisticEntry { contributor: addr.clone(), amount: 150 });

    let result = stage_optimistic_batch(&batch);
    if let OptimisticResult::Committed(state) = result {
        commit_optimistic_state(&env, &batch, &state);
        assert_eq!(read_contribution(&env, &addr), 250);
        assert_eq!(read_total_raised(&env), 150);
    }
}

#[test]
fn commit_multi_entry_updates_all_contributors() {
    let env = Env::default();
    let a = Address::generate(&env);
    let b = Address::generate(&env);
    let mut batch: Vec<OptimisticEntry> = Vec::new(&env);
    batch.push_back(OptimisticEntry { contributor: a.clone(), amount: 100 });
    batch.push_back(OptimisticEntry { contributor: b.clone(), amount: 200 });

    let result = stage_optimistic_batch(&batch);
    if let OptimisticResult::Committed(state) = result {
        commit_optimistic_state(&env, &batch, &state);
        assert_eq!(read_contribution(&env, &a), 100);
        assert_eq!(read_contribution(&env, &b), 200);
        assert_eq!(read_total_raised(&env), 300);
    }
}

// ── estimate_gas_savings_bps ──────────────────────────────────────────────────

#[test]
fn gas_savings_zero_entries() {
    assert_eq!(estimate_gas_savings_bps(0), 0);
}

#[test]
fn gas_savings_one_entry() {
    assert_eq!(estimate_gas_savings_bps(1), 0);
}

#[test]
fn gas_savings_two_entries() {
    assert_eq!(estimate_gas_savings_bps(2), 30);
}

#[test]
fn gas_savings_ten_entries() {
    assert_eq!(estimate_gas_savings_bps(10), 270);
}

#[test]
fn gas_savings_capped_at_bps_scale() {
    // Very large batch should not exceed BPS_SCALE.
    let savings = estimate_gas_savings_bps(10_000);
    assert_eq!(savings, BPS_SCALE as u32);
}
