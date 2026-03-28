//! # sharding_mechanism
//!
//! @title   ShardingMechanism — Bounded contributor-list sharding for gas efficiency.
//!
//! @notice  Partitions the contributor address list into fixed-size shards so
//!          that no single transaction needs to iterate the entire list.
//!          Each shard holds at most `SHARD_SIZE` addresses, keeping per-shard
//!          gas cost predictable regardless of total campaign size.
//!
//! @dev     ### Why sharding?
//!          Soroban charges per-entry read/write fees.  A single `Vec<Address>`
//!          that grows to hundreds of entries makes `withdraw`, `cancel`, and
//!          aggregate scans increasingly expensive and eventually hits the
//!          per-transaction resource budget.  Sharding caps the per-call cost
//!          at `SHARD_SIZE` entries.
//!
//!          ### Storage layout
//!          - `DataKey::ShardCount`          — u32, total number of shards allocated.
//!          - `DataKey::ContributorShard(n)` — `Vec<Address>` for shard index `n`.
//!
//!          ### Invariants
//!          1. Every shard except possibly the last is exactly `SHARD_SIZE` entries.
//!          2. `shard_index(n)` is deterministic: `n / SHARD_SIZE`.
//!          3. No address appears in more than one shard.
//!          4. Total addressable capacity = `MAX_SHARDS * SHARD_SIZE`.
//!
//! ## Security Assumptions
//! 1. **Bounded** — All loops iterate at most `SHARD_SIZE` or `MAX_SHARDS` times.
//! 2. **Overflow-safe** — All arithmetic uses `checked_*` operations.
//! 3. **No auth required** — Shard reads are permissionless view helpers.
//! 4. **Deterministic** — Same inputs always produce the same shard index.
//! 5. **No duplicate insertion** — `insert` checks membership before appending.

#![allow(dead_code)]

use soroban_sdk::{Address, Env, Vec};

use crate::DataKey;

// ── Constants ─────────────────────────────────────────────────────────────────

/// @notice Maximum addresses per shard.
/// @dev    Aligned with `MAX_BATCH_SIZE * 10` so a full shard can be processed
///         in ten batch calls.  Adjust upward only after profiling gas costs.
pub const SHARD_SIZE: u32 = 100;

/// @notice Maximum number of shards (caps total addressable contributors).
/// @dev    `MAX_SHARDS * SHARD_SIZE` = 1 000 contributors maximum.
pub const MAX_SHARDS: u32 = 10;

/// @notice Total contributor capacity across all shards.
pub const MAX_TOTAL_CAPACITY: u32 = MAX_SHARDS * SHARD_SIZE;

// ── Shard index helpers ───────────────────────────────────────────────────────

/// @notice Returns the shard index for the nth contributor (0-based).
/// @dev    Pure function — no storage access.
///
/// # Panics
/// * `"shard index overflow"` if `n >= MAX_TOTAL_CAPACITY`.
pub fn shard_index(n: u32) -> u32 {
    assert!(n < MAX_TOTAL_CAPACITY, "shard index overflow");
    n / SHARD_SIZE
}

/// @notice Returns the position within its shard for the nth contributor.
pub fn shard_offset(n: u32) -> u32 {
    n % SHARD_SIZE
}

/// @notice Returns the `DataKey` for a given shard index.
pub fn shard_key(index: u32) -> DataKey {
    DataKey::ContributorShard(index)
}

// ── Storage helpers ───────────────────────────────────────────────────────────

/// @notice Load a shard from storage, returning an empty `Vec` if absent.
pub fn load_shard(env: &Env, index: u32) -> Vec<Address> {
    env.storage()
        .persistent()
        .get(&shard_key(index))
        .unwrap_or_else(|| Vec::new(env))
}

/// @notice Persist a shard to storage and extend its TTL.
pub fn save_shard(env: &Env, index: u32, shard: &Vec<Address>) {
    let key = shard_key(index);
    env.storage().persistent().set(&key, shard);
    env.storage().persistent().extend_ttl(&key, 100, 100);
}

/// @notice Returns the current number of allocated shards.
pub fn shard_count(env: &Env) -> u32 {
    env.storage()
        .instance()
        .get(&DataKey::ShardCount)
        .unwrap_or(0)
}

fn set_shard_count(env: &Env, count: u32) {
    env.storage().instance().set(&DataKey::ShardCount, &count);
}

// ── Insert ────────────────────────────────────────────────────────────────────

/// @notice Insert `address` into the sharded contributor list.
/// @dev    No-op if `address` is already present (checked in the active shard).
///         Allocates a new shard when the current one is full.
///
/// # Panics
/// * `"contributor capacity exceeded"` if all shards are full.
/// * `"shard size overflow"` on internal arithmetic overflow.
pub fn insert(env: &Env, address: &Address) {
    let count = shard_count(env);

    // Determine the active shard index (last allocated, or 0 if none).
    let active_idx = if count == 0 { 0 } else { count - 1 };
    let mut active = load_shard(env, active_idx);

    // Duplicate check within the active shard.
    if active.contains(address) {
        return;
    }

    // If active shard is full, open a new one.
    if active.len() >= SHARD_SIZE {
        let new_idx = count; // next shard index
        assert!(new_idx < MAX_SHARDS, "contributor capacity exceeded");
        let mut new_shard = Vec::new(env);
        new_shard.push_back(address.clone());
        save_shard(env, new_idx, &new_shard);
        set_shard_count(env, new_idx.checked_add(1).expect("shard size overflow"));
        return;
    }

    // Append to the active shard.
    active.push_back(address.clone());
    save_shard(env, active_idx, &active);

    // Initialise shard count on first insert.
    if count == 0 {
        set_shard_count(env, 1);
    }
}

// ── Lookup ────────────────────────────────────────────────────────────────────

/// @notice Returns `true` if `address` exists in any shard.
/// @dev    Iterates at most `MAX_SHARDS` shards, each at most `SHARD_SIZE` entries.
pub fn contains(env: &Env, address: &Address) -> bool {
    let count = shard_count(env);
    for i in 0..count {
        if load_shard(env, i).contains(address) {
            return true;
        }
    }
    false
}

/// @notice Returns the total number of contributors across all shards.
pub fn total_contributors(env: &Env) -> u32 {
    let count = shard_count(env);
    let mut total: u32 = 0;
    for i in 0..count {
        let len = load_shard(env, i).len();
        total = total.checked_add(len).expect("contributor count overflow");
    }
    total
}

/// @notice Returns the addresses in shard `index`, or an empty `Vec` if absent.
pub fn get_shard(env: &Env, index: u32) -> Vec<Address> {
    load_shard(env, index)
}
