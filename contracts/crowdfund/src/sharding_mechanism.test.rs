//! Tests for `sharding_mechanism`.
//!
//! Coverage:
//! - shard_index / shard_offset: correct bucketing, boundary values
//! - shard_index: panics beyond MAX_TOTAL_CAPACITY
//! - insert: first address, fills a shard, spills into next shard
//! - insert: duplicate is ignored (no double-count)
//! - contains: true when present, false when absent, across shard boundary
//! - total_contributors: empty, single shard, multi-shard
//! - get_shard: returns correct slice, empty for unallocated index
//! - shard_count: zero before any insert, increments on shard overflow
//! - MAX_TOTAL_CAPACITY constant sanity

#![cfg(test)]

use soroban_sdk::{testutils::Address as _, Address, Env};

use crate::sharding_mechanism::{
    contains, get_shard, insert, shard_count, shard_index, shard_offset, total_contributors,
    MAX_SHARDS, MAX_TOTAL_CAPACITY, SHARD_SIZE,
};

// ── Constants ─────────────────────────────────────────────────────────────────

#[test]
fn test_max_total_capacity_equals_shards_times_size() {
    assert_eq!(MAX_TOTAL_CAPACITY, MAX_SHARDS * SHARD_SIZE);
}

// ── shard_index / shard_offset ────────────────────────────────────────────────

#[test]
fn test_shard_index_first_entry() {
    assert_eq!(shard_index(0), 0);
}

#[test]
fn test_shard_index_last_in_first_shard() {
    assert_eq!(shard_index(SHARD_SIZE - 1), 0);
}

#[test]
fn test_shard_index_first_in_second_shard() {
    assert_eq!(shard_index(SHARD_SIZE), 1);
}

#[test]
fn test_shard_index_last_valid_entry() {
    assert_eq!(shard_index(MAX_TOTAL_CAPACITY - 1), MAX_SHARDS - 1);
}

#[test]
fn test_shard_offset_first_entry() {
    assert_eq!(shard_offset(0), 0);
}

#[test]
fn test_shard_offset_wraps_at_shard_boundary() {
    assert_eq!(shard_offset(SHARD_SIZE), 0);
    assert_eq!(shard_offset(SHARD_SIZE + 1), 1);
}

#[test]
#[should_panic(expected = "shard index overflow")]
fn test_shard_index_panics_at_capacity() {
    shard_index(MAX_TOTAL_CAPACITY);
}

// ── insert / contains / total_contributors ────────────────────────────────────

#[test]
fn test_insert_single_address() {
    let env = Env::default();
    let addr = Address::generate(&env);

    insert(&env, &addr);

    assert!(contains(&env, &addr));
    assert_eq!(total_contributors(&env), 1);
    assert_eq!(shard_count(&env), 1);
}

#[test]
fn test_insert_duplicate_is_ignored() {
    let env = Env::default();
    let addr = Address::generate(&env);

    insert(&env, &addr);
    insert(&env, &addr); // second insert must be a no-op

    assert_eq!(total_contributors(&env), 1);
}

#[test]
fn test_insert_multiple_distinct_addresses() {
    let env = Env::default();
    let a = Address::generate(&env);
    let b = Address::generate(&env);
    let c = Address::generate(&env);

    insert(&env, &a);
    insert(&env, &b);
    insert(&env, &c);

    assert_eq!(total_contributors(&env), 3);
    assert!(contains(&env, &a));
    assert!(contains(&env, &b));
    assert!(contains(&env, &c));
}

#[test]
fn test_contains_returns_false_for_absent_address() {
    let env = Env::default();
    let present = Address::generate(&env);
    let absent = Address::generate(&env);

    insert(&env, &present);

    assert!(!contains(&env, &absent));
}

#[test]
fn test_total_contributors_zero_when_empty() {
    let env = Env::default();
    assert_eq!(total_contributors(&env), 0);
}

#[test]
fn test_shard_count_zero_before_any_insert() {
    let env = Env::default();
    assert_eq!(shard_count(&env), 0);
}

// ── Shard overflow (spill into next shard) ────────────────────────────────────

#[test]
fn test_shard_spills_into_second_shard_when_full() {
    let env = Env::default();

    // Fill the first shard completely.
    for _ in 0..SHARD_SIZE {
        insert(&env, &Address::generate(&env));
    }
    assert_eq!(shard_count(&env), 1);
    assert_eq!(total_contributors(&env), SHARD_SIZE);

    // One more address should spill into shard 1.
    let overflow = Address::generate(&env);
    insert(&env, &overflow);

    assert_eq!(shard_count(&env), 2);
    assert_eq!(total_contributors(&env), SHARD_SIZE + 1);
    assert!(contains(&env, &overflow));

    // The overflow address must be in shard 1, not shard 0.
    let shard1 = get_shard(&env, 1);
    assert!(shard1.contains(&overflow));
}

// ── get_shard ─────────────────────────────────────────────────────────────────

#[test]
fn test_get_shard_returns_empty_for_unallocated_index() {
    let env = Env::default();
    let shard = get_shard(&env, 5);
    assert_eq!(shard.len(), 0);
}

#[test]
fn test_get_shard_returns_correct_addresses() {
    let env = Env::default();
    let a = Address::generate(&env);
    let b = Address::generate(&env);

    insert(&env, &a);
    insert(&env, &b);

    let shard0 = get_shard(&env, 0);
    assert!(shard0.contains(&a));
    assert!(shard0.contains(&b));
}
