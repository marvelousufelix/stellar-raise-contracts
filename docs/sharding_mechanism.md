# sharding_mechanism

Bounded contributor-list sharding for gas efficiency and network scalability.

## Problem

Soroban charges per-entry read/write fees. A single `Vec<Address>` that grows to hundreds of entries makes `withdraw`, `cancel`, and aggregate scans increasingly expensive and eventually hits the per-transaction resource budget. Without a cap, an adversary can flood the contributor list until any iteration-based operation fails.

## Solution

Partition the contributor list into fixed-size shards. Each shard holds at most `SHARD_SIZE` addresses. Callers process one shard per transaction, keeping per-call gas cost constant regardless of total campaign size.

## Constants

| Constant | Value | Description |
|:---------|------:|:------------|
| `SHARD_SIZE` | 100 | Max addresses per shard |
| `MAX_SHARDS` | 10 | Max number of shards |
| `MAX_TOTAL_CAPACITY` | 1 000 | Total addressable contributors |

## Storage Layout

| Key | Type | Description |
|:----|:-----|:------------|
| `DataKey::ShardCount` | `u32` | Number of shards currently allocated (instance storage) |
| `DataKey::ContributorShard(n)` | `Vec<Address>` | Addresses in shard `n` (persistent storage, TTL extended on write) |

## API

```rust
// Pure helpers — no storage access
fn shard_index(n: u32) -> u32       // which shard the nth contributor belongs to
fn shard_offset(n: u32) -> u32      // position within that shard

// Storage helpers
fn insert(env, address)             // add address; no-op if already present
fn contains(env, address) -> bool   // membership check across all shards
fn total_contributors(env) -> u32   // sum of all shard lengths
fn get_shard(env, index) -> Vec<Address>  // read a single shard
fn shard_count(env) -> u32          // number of allocated shards
```

## Invariants

1. Every shard except possibly the last is exactly `SHARD_SIZE` entries.
2. `shard_index(n)` is deterministic: `n / SHARD_SIZE`.
3. No address appears in more than one shard.
4. Total capacity is hard-capped at `MAX_SHARDS * SHARD_SIZE = 1 000`.

## Gas Efficiency

| Operation | Without sharding | With sharding |
|:----------|:----------------|:--------------|
| Iterate all contributors | O(N) per tx | O(SHARD_SIZE) per tx |
| Insert new contributor | O(N) scan | O(SHARD_SIZE) scan |
| Membership check | O(N) | O(MAX_SHARDS × SHARD_SIZE) worst case |

Processing a full campaign in batches requires `ceil(N / SHARD_SIZE)` transactions, each with predictable and bounded gas cost.

## Security Assumptions

1. **Bounded** — All loops iterate at most `SHARD_SIZE` or `MAX_SHARDS` times.
2. **Overflow-safe** — All arithmetic uses `checked_*` operations.
3. **No auth required** — Shard reads are permissionless view helpers.
4. **Deterministic** — Same inputs always produce the same shard index.
5. **No duplicate insertion** — `insert` checks membership before appending.
6. **Capacity hard cap** — `insert` panics with `"contributor capacity exceeded"` when all shards are full, preventing unbounded growth.
