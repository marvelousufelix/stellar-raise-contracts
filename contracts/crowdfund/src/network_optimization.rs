//! Network optimization helpers for the Stellar Raise crowdfund contract.
//!
//! @title Network Optimization
//! @notice Reduces gas consumption and improves communication efficiency by
//!         batching storage writes, deduplicating event payloads, and providing
//!         read-ahead caching for hot storage paths.
//!
//! # Design Rationale
//!
//! Soroban charges per-entry storage access and per-byte event emission.
//! This module introduces three complementary optimizations:
//!
//! 1. **Write batching** – `BatchWriter` accumulates pending writes and flushes
//!    them in a single pass, avoiding redundant set-calls for the same key.
//! 2. **Event deduplication** – `EventDeduplicator` suppresses duplicate events
//!    within a single transaction, cutting unnecessary network traffic.
//! 3. **Read-ahead cache** – `NetworkCache` pre-loads a configurable set of
//!    storage keys in one pass and serves subsequent reads from memory.
//!
//! # Security Assumptions
//!
//! - `BatchWriter` never silently drops writes; the last write for a given key
//!   wins (last-write-wins semantics, consistent with direct storage calls).
//! - `EventDeduplicator` only suppresses *exact* duplicates (same topic + data
//!   hash). Distinct events are always emitted.
//! - `NetworkCache` is read-only; it never writes to storage.
//! - All helpers are stateless across transactions — no cross-transaction
//!   caching is possible in Soroban's execution model.

use soroban_sdk::Env;

use crate::DataKey;

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/// Maximum number of pending writes held by a `BatchWriter` before an
/// automatic flush is triggered.
///
/// @notice Keeping this value small bounds worst-case memory usage per
///         transaction while still amortising write overhead.
pub const MAX_BATCH_SIZE: usize = 16;

/// Maximum number of event fingerprints tracked by `EventDeduplicator`.
pub const MAX_DEDUP_ENTRIES: usize = 32;

// ---------------------------------------------------------------------------
// GasMetrics
// ---------------------------------------------------------------------------

/// Lightweight counters that track storage and event operations performed
/// within a single transaction.
///
/// @notice These counters are informational only — they do not affect contract
///         behaviour. They are useful for off-chain analysis and test assertions.
///
/// @custom:security All fields are `u32` to prevent overflow in realistic
///                  transaction sizes (Soroban limits operations per tx).
#[derive(Clone, Debug, Default, PartialEq)]
pub struct GasMetrics {
    /// Number of storage reads performed.
    pub reads: u32,
    /// Number of storage writes performed (after deduplication).
    pub writes: u32,
    /// Number of events emitted (after deduplication).
    pub events_emitted: u32,
    /// Number of duplicate events suppressed.
    pub events_suppressed: u32,
    /// Number of writes coalesced (i.e. redundant writes avoided).
    pub writes_coalesced: u32,
}

impl GasMetrics {
    /// Creates a zeroed `GasMetrics` instance.
    pub fn new() -> Self {
        Self::default()
    }

    /// Returns the total number of storage operations (reads + writes).
    ///
    /// @return Sum of `reads` and `writes`.
    pub fn total_storage_ops(&self) -> u32 {
        self.reads.saturating_add(self.writes)
    }

    /// Returns the event emission efficiency as a percentage (0–100).
    ///
    /// Defined as `events_emitted / (events_emitted + events_suppressed) * 100`.
    /// Returns 100 when no events have been processed.
    ///
    /// @return Efficiency percentage in the range [0, 100].
    pub fn event_efficiency_pct(&self) -> u32 {
        let total = self.events_emitted.saturating_add(self.events_suppressed);
        if total == 0 {
            return 100;
        }
        // Multiply first to preserve precision before integer division.
        self.events_emitted.saturating_mul(100) / total
    }
}

// ---------------------------------------------------------------------------
// PendingWrite
// ---------------------------------------------------------------------------

/// A single pending storage write held by `BatchWriter`.
///
/// @dev Uses `i128` as the value type because the most performance-sensitive
///      hot paths (TotalRaised, Goal, MinContribution) all store `i128`.
///      Extend with an enum payload if other types are needed.
#[derive(Clone, Debug, PartialEq)]
pub struct PendingWrite {
    /// The storage key to write.
    pub key: DataKey,
    /// The value to store.
    pub value: i128,
}

// ---------------------------------------------------------------------------
// BatchWriter
// ---------------------------------------------------------------------------

/// Accumulates storage writes and flushes them in a single pass.
///
/// @notice Duplicate writes to the same key are coalesced — only the last
///         value is retained, matching Soroban's own last-write-wins semantics.
///
/// @custom:security
///   - `flush` is idempotent: calling it on an empty writer is a no-op.
///   - Writes are never reordered relative to each other for the same key.
///   - Auto-flush at `MAX_BATCH_SIZE` prevents unbounded memory growth.
pub struct BatchWriter {
    pending: [Option<PendingWrite>; MAX_BATCH_SIZE],
    len: usize,
}

impl BatchWriter {
    /// Creates a new, empty `BatchWriter`.
    pub fn new() -> Self {
        Self {
            pending: [
                None, None, None, None, None, None, None, None, None, None, None, None, None,
                None, None, None,
            ],
            len: 0,
        }
    }

    /// Queues a write for `key` with `value`.
    ///
    /// If `key` already has a pending write, the value is updated in-place
    /// (coalescing). If the batch is full, the write is applied immediately
    /// to instance storage and the batch is cleared.
    ///
    /// @param env   The Soroban environment.
    /// @param key   The `DataKey` to write.
    /// @param value The `i128` value to store.
    /// @param metrics Mutable metrics counter updated on coalesce or write.
    pub fn queue(
        &mut self,
        env: &Env,
        key: DataKey,
        value: i128,
        metrics: &mut GasMetrics,
    ) {
        // Check for existing entry to coalesce.
        for slot in self.pending[..self.len].iter_mut() {
            if let Some(ref mut pw) = slot {
                if pw.key == key {
                    pw.value = value;
                    metrics.writes_coalesced = metrics.writes_coalesced.saturating_add(1);
                    return;
                }
            }
        }

        if self.len >= MAX_BATCH_SIZE {
            // Batch full — flush immediately to make room.
            self.flush(env, metrics);
        }

        self.pending[self.len] = Some(PendingWrite {
            key,
            value,
        });
        self.len += 1;
    }

    /// Flushes all pending writes to instance storage and clears the batch.
    ///
    /// @param env     The Soroban environment.
    /// @param metrics Mutable metrics counter incremented per write.
    pub fn flush(&mut self, env: &Env, metrics: &mut GasMetrics) {
        for slot in self.pending[..self.len].iter_mut() {
            if let Some(ref pw) = slot {
                env.storage().instance().set(&pw.key, &pw.value);
                metrics.writes = metrics.writes.saturating_add(1);
            }
            *slot = None;
        }
        self.len = 0;
    }

    /// Returns the number of pending (unflushed) writes.
    pub fn pending_count(&self) -> usize {
        self.len
    }

    /// Returns `true` if there are no pending writes.
    pub fn is_empty(&self) -> bool {
        self.len == 0
    }
}

impl Default for BatchWriter {
    fn default() -> Self {
        Self::new()
    }
}

// ---------------------------------------------------------------------------
// EventDeduplicator
// ---------------------------------------------------------------------------

/// Suppresses duplicate events within a single transaction.
///
/// @notice A "duplicate" is defined as an event with the same `(topic, value)`
///         fingerprint. The fingerprint is a simple `u64` hash derived from
///         the topic symbol and the `i128` value.
///
/// @custom:security
///   - Hash collisions are theoretically possible but extremely unlikely for
///     the small number of distinct events emitted per transaction.
///   - The deduplicator never drops non-duplicate events.
///   - The internal table is bounded by `MAX_DEDUP_ENTRIES`.
pub struct EventDeduplicator {
    seen: [u64; MAX_DEDUP_ENTRIES],
    len: usize,
}

impl EventDeduplicator {
    /// Creates a new, empty `EventDeduplicator`.
    pub fn new() -> Self {
        Self {
            seen: [0u64; MAX_DEDUP_ENTRIES],
            len: 0,
        }
    }

    /// Computes a lightweight fingerprint for a `(topic, value)` pair.
    ///
    /// @param topic  A short ASCII topic string (max 32 bytes used).
    /// @param value  The `i128` event payload.
    /// @return A `u64` fingerprint.
    ///
    /// @dev Uses a simple FNV-1a-inspired mix. Not cryptographically secure —
    ///      only used for within-transaction deduplication.
    pub fn fingerprint(topic: &[u8], value: i128) -> u64 {
        let mut h: u64 = 0xcbf2_9ce4_8422_2325; // FNV offset basis
        for &b in topic.iter().take(32) {
            h ^= b as u64;
            h = h.wrapping_mul(0x0000_0100_0000_01b3); // FNV prime
        }
        // Mix in the value bytes.
        let vb = value.to_le_bytes();
        for &b in vb.iter() {
            h ^= b as u64;
            h = h.wrapping_mul(0x0000_0100_0000_01b3);
        }
        h
    }

    /// Returns `true` if the event should be emitted (i.e. not a duplicate).
    ///
    /// Records the fingerprint so subsequent identical calls return `false`.
    /// When the table is full, the event is always emitted (fail-open).
    ///
    /// @param topic  ASCII topic bytes.
    /// @param value  Event payload.
    /// @param metrics Mutable metrics counter updated on suppress or emit.
    /// @return `true` if the event is new and should be emitted.
    pub fn should_emit(
        &mut self,
        topic: &[u8],
        value: i128,
        metrics: &mut GasMetrics,
    ) -> bool {
        let fp = Self::fingerprint(topic, value);

        for &seen_fp in self.seen[..self.len].iter() {
            if seen_fp == fp {
                metrics.events_suppressed = metrics.events_suppressed.saturating_add(1);
                return false;
            }
        }

        if self.len < MAX_DEDUP_ENTRIES {
            self.seen[self.len] = fp;
            self.len += 1;
        }

        metrics.events_emitted = metrics.events_emitted.saturating_add(1);
        true
    }

    /// Returns the number of fingerprints currently tracked.
    pub fn tracked_count(&self) -> usize {
        self.len
    }
}

impl Default for EventDeduplicator {
    fn default() -> Self {
        Self::new()
    }
}

// ---------------------------------------------------------------------------
// NetworkCache
// ---------------------------------------------------------------------------

/// Pre-loads a set of hot storage keys in a single pass and serves subsequent
/// reads from an in-memory cache.
///
/// @notice Reduces per-transaction storage read costs when multiple functions
///         need the same campaign scalars (goal, total_raised, deadline).
///
/// @custom:security
///   - The cache is read-only; it never writes to storage.
///   - Stale reads are impossible within a single transaction because Soroban
///     executes transactions atomically.
#[derive(Clone, Debug, Default)]
pub struct NetworkCache {
    goal: Option<i128>,
    total_raised: Option<i128>,
    deadline: Option<u64>,
    min_contribution: Option<i128>,
}

impl NetworkCache {
    /// Creates an empty `NetworkCache`.
    pub fn new() -> Self {
        Self::default()
    }

    /// Pre-loads all four hot campaign scalars from instance storage.
    ///
    /// @param env     The Soroban environment.
    /// @param metrics Mutable metrics counter incremented per read.
    /// @return A populated `NetworkCache`.
    pub fn preload(env: &Env, metrics: &mut GasMetrics) -> Self {
        let goal: Option<i128> = env.storage().instance().get(&DataKey::Goal);
        metrics.reads = metrics.reads.saturating_add(1);

        let total_raised: Option<i128> = env.storage().instance().get(&DataKey::TotalRaised);
        metrics.reads = metrics.reads.saturating_add(1);

        let deadline: Option<u64> = env.storage().instance().get(&DataKey::Deadline);
        metrics.reads = metrics.reads.saturating_add(1);

        let min_contribution: Option<i128> =
            env.storage().instance().get(&DataKey::MinContribution);
        metrics.reads = metrics.reads.saturating_add(1);

        Self {
            goal,
            total_raised,
            deadline,
            min_contribution,
        }
    }

    /// Returns the cached goal, or `default` if not loaded.
    pub fn goal_or(&self, default: i128) -> i128 {
        self.goal.unwrap_or(default)
    }

    /// Returns the cached total_raised, or `default` if not loaded.
    pub fn total_raised_or(&self, default: i128) -> i128 {
        self.total_raised.unwrap_or(default)
    }

    /// Returns the cached deadline, or `default` if not loaded.
    pub fn deadline_or(&self, default: u64) -> u64 {
        self.deadline.unwrap_or(default)
    }

    /// Returns the cached min_contribution, or `default` if not loaded.
    pub fn min_contribution_or(&self, default: i128) -> i128 {
        self.min_contribution.unwrap_or(default)
    }

    /// Returns `true` if the goal has been loaded into the cache.
    pub fn has_goal(&self) -> bool {
        self.goal.is_some()
    }

    /// Returns `true` if total_raised has been loaded into the cache.
    pub fn has_total_raised(&self) -> bool {
        self.total_raised.is_some()
    }

    /// Returns `true` if the deadline has been loaded into the cache.
    pub fn has_deadline(&self) -> bool {
        self.deadline.is_some()
    }

    /// Returns `true` if min_contribution has been loaded into the cache.
    pub fn has_min_contribution(&self) -> bool {
        self.min_contribution.is_some()
    }

    /// Returns `true` when all four hot fields are cached.
    pub fn is_fully_loaded(&self) -> bool {
        self.goal.is_some()
            && self.total_raised.is_some()
            && self.deadline.is_some()
            && self.min_contribution.is_some()
    }
}

// ---------------------------------------------------------------------------
// Standalone helpers
// ---------------------------------------------------------------------------

/// Computes progress toward the goal in basis points (0–10 000).
///
/// @notice Returns 0 when `goal` is zero to avoid division by zero.
///
/// @param total_raised Current total raised in token units.
/// @param goal         Campaign goal in token units.
/// @return Progress in basis points, capped at 10 000.
pub fn progress_bps(total_raised: i128, goal: i128) -> u32 {
    if goal <= 0 {
        return 0;
    }
    let bps = total_raised
        .saturating_mul(10_000)
        .checked_div(goal)
        .unwrap_or(0);
    bps.min(10_000) as u32
}

/// Returns `true` when `total_raised >= goal` and `goal > 0`.
///
/// @param total_raised Current total raised.
/// @param goal         Campaign goal.
pub fn goal_met(total_raised: i128, goal: i128) -> bool {
    goal > 0 && total_raised >= goal
}

/// Estimates the number of storage reads saved by using `NetworkCache`
/// compared to individual reads, given `call_count` callers each needing
/// all four hot fields.
///
/// @param call_count Number of callers that would each read all four fields.
/// @return Estimated reads saved (always non-negative).
pub fn estimated_reads_saved(call_count: u32) -> u32 {
    // Without cache: call_count * 4 reads.
    // With cache: 4 reads (preload) + 0 per subsequent caller.
    // Saved = (call_count - 1) * 4, floored at 0.
    call_count.saturating_sub(1).saturating_mul(4)
}
