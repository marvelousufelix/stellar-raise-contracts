# Network Optimization

## Overview

The `network_optimization` module reduces gas consumption and communication overhead in the Stellar Raise crowdfund contract. It introduces three complementary mechanisms: write batching, event deduplication, and read-ahead caching for hot storage paths.

Soroban charges per-entry storage access and per-byte event emission. This module minimises those costs without changing observable contract behaviour.

---

## Files

| File | Purpose |
|---|---|
| `contracts/crowdfund/src/network_optimization.rs` | Module implementation |
| `contracts/crowdfund/src/network_optimization.test.rs` | Comprehensive test suite |
| `docs/network_optimization.md` | This document |

---

## Core Types

### `GasMetrics`

Lightweight counters that track storage and event operations within a single transaction.

```rust
pub struct GasMetrics {
    pub reads: u32,
    pub writes: u32,
    pub events_emitted: u32,
    pub events_suppressed: u32,
    pub writes_coalesced: u32,
}
```

| Method | Description |
|---|---|
| `new()` / `default()` | Creates zeroed counters |
| `total_storage_ops()` | Returns `reads + writes` (saturating) |
| `event_efficiency_pct()` | Returns `emitted / (emitted + suppressed) * 100` |

### `BatchWriter`

Accumulates `i128` storage writes and flushes them in a single pass.

```rust
let mut writer = BatchWriter::new();
let mut metrics = GasMetrics::new();

writer.queue(&env, DataKey::Goal, 10_000, &mut metrics);
writer.queue(&env, DataKey::TotalRaised, 3_000, &mut metrics);
writer.flush(&env, &mut metrics);
```

**Behaviour:**
- Duplicate writes to the same key are coalesced (last-write-wins).
- Auto-flushes when the internal buffer reaches `MAX_BATCH_SIZE` (16).
- `flush()` on an empty writer is a no-op.

| Method | Description |
|---|---|
| `new()` / `default()` | Creates an empty writer |
| `queue(env, key, value, metrics)` | Queues a write, coalescing if key exists |
| `flush(env, metrics)` | Writes all pending entries to instance storage |
| `pending_count()` | Number of unflushed writes |
| `is_empty()` | `true` when no writes are pending |

### `EventDeduplicator`

Suppresses duplicate `(topic, value)` events within a single transaction.

```rust
let mut dedup = EventDeduplicator::new();
let mut metrics = GasMetrics::new();

if dedup.should_emit(b"pledge_received", amount, &mut metrics) {
    env.events().publish(("campaign", "pledge_received"), amount);
}
```

**Behaviour:**
- A "duplicate" is an event with the same topic bytes and `i128` value.
- Uses an FNV-1a-inspired fingerprint — not cryptographically secure, only for within-transaction dedup.
- When the internal table is full (`MAX_DEDUP_ENTRIES = 32`), events are emitted unconditionally (fail-open).

| Method | Description |
|---|---|
| `new()` / `default()` | Creates an empty deduplicator |
| `fingerprint(topic, value)` | Computes a `u64` fingerprint |
| `should_emit(topic, value, metrics)` | Returns `true` if the event is new |
| `tracked_count()` | Number of fingerprints currently tracked |

### `NetworkCache`

Pre-loads the four hot campaign scalars in a single pass.

```rust
let mut metrics = GasMetrics::new();
let cache = NetworkCache::preload(&env, &mut metrics);

let goal = cache.goal_or(0);
let raised = cache.total_raised_or(0);
```

**Behaviour:**
- Reads `Goal`, `TotalRaised`, `Deadline`, and `MinContribution` from instance storage.
- Subsequent reads are served from memory — no additional storage access.
- Read-only; never writes to storage.

| Method | Description |
|---|---|
| `new()` / `default()` | Creates an empty cache |
| `preload(env, metrics)` | Loads all four fields, increments `metrics.reads` by 4 |
| `goal_or(default)` | Returns cached goal or `default` |
| `total_raised_or(default)` | Returns cached total_raised or `default` |
| `deadline_or(default)` | Returns cached deadline or `default` |
| `min_contribution_or(default)` | Returns cached min_contribution or `default` |
| `is_fully_loaded()` | `true` when all four fields are cached |

---

## Standalone Helpers

```rust
// Progress toward goal in basis points (0–10 000).
let bps = progress_bps(total_raised, goal);

// Boolean goal-met check.
let met = goal_met(total_raised, goal);

// Estimate reads saved by caching across N callers.
let saved = estimated_reads_saved(call_count);
```

| Function | Description |
|---|---|
| `progress_bps(total_raised, goal)` | Returns progress in bps, capped at 10 000; 0 when goal ≤ 0 |
| `goal_met(total_raised, goal)` | `true` when `total_raised >= goal` and `goal > 0` |
| `estimated_reads_saved(call_count)` | `(call_count - 1) * 4`, saturating |

---

## Security Assumptions

- `BatchWriter` never silently drops writes. The last write for a given key wins, consistent with direct `env.storage().instance().set()` calls.
- `EventDeduplicator` only suppresses exact duplicates. Distinct events are always emitted. The fingerprint hash is not cryptographically secure and is only used for within-transaction deduplication where collision risk is negligible.
- `NetworkCache` is strictly read-only. Stale reads are impossible within a single Soroban transaction because execution is atomic.
- All counters in `GasMetrics` use saturating arithmetic to prevent overflow panics.
- `MAX_BATCH_SIZE` (16) and `MAX_DEDUP_ENTRIES` (32) bound worst-case memory usage per transaction.

---

## Test Coverage

Run the test suite with:

```bash
cargo test -p crowdfund network_optimization
```

Expected: all tests pass. Coverage targets ≥ 95% statement/branch/function/line.

Test categories:
- `GasMetrics`: construction, arithmetic, saturation edge cases
- `BatchWriter`: queue, coalesce, auto-flush, last-write-wins, flush empty
- `EventDeduplicator`: first emit, duplicate suppress, different topic/value, table-full fail-open, negative/zero values
- `NetworkCache`: preload, defaults when absent, partial load, fully-loaded flag
- `progress_bps`: zero goal, zero raised, half-way, goal met, over-goal cap, negative inputs
- `goal_met`: exact, over, under, zero goal, zero raised
- `estimated_reads_saved`: zero, one, five callers, saturation
