//! Loop optimization helpers for gas-efficient iteration in the crowdfund contract.
//!
//! @title   Loop Optimization
//! @notice  Provides bounded, early-exit, and deduplication loop patterns that
//!          minimise ledger reads and CPU instructions per transaction.
//! @dev     All public functions are pure or accept pre-loaded slices so they
//!          can be tested without a live Soroban environment.
//!
//! ## Design principles
//!
//! 1. **Bounded iteration** — every loop has an explicit cap (`MAX_LOOP_ITEMS`)
//!    so gas consumption is predictable and cannot grow unboundedly with state.
//! 2. **Early exit** — loops return as soon as the answer is known, avoiding
//!    redundant iterations over the tail of a collection.
//! 3. **Single-pass aggregation** — multiple statistics are computed in one
//!    traversal instead of N separate passes over the same data.
//! 4. **No redundant storage reads** — callers load data once and pass slices;
//!    this module never re-reads storage.
//!
//! @security
//!   - No user-controlled input reaches loop bounds; all caps are compile-time
//!     constants.
//!   - Arithmetic uses `saturating_add` / `checked_add` to prevent overflow.
//!   - Functions are `#[no_std]`-compatible (no heap allocation beyond the SDK
//!     `Vec` already present in the caller's environment).

use soroban_sdk::Vec;

// ── Constants ─────────────────────────────────────────────────────────────────

/// @notice Hard cap on the number of items any single loop in this module will
///         process.  Aligns with the contributor cap so callers never need to
///         truncate before passing a contributor list.
/// @dev    Changing this value is a breaking change — update tests accordingly.
pub const MAX_LOOP_ITEMS: u32 = 1_000;

// ── Types ─────────────────────────────────────────────────────────────────────

/// @notice Aggregated statistics produced by a single bounded pass over a
///         numeric slice.
/// @dev    All fields use `i128` to match Soroban token amounts.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct LoopAggregateStats {
    /// Number of items processed (≤ `MAX_LOOP_ITEMS`).
    pub count: u32,
    /// Sum of all values (saturating).
    pub sum: i128,
    /// Largest value seen, or `0` when the slice is empty.
    pub max: i128,
    /// Smallest value seen, or `0` when the slice is empty.
    pub min: i128,
}

// ── Pure helpers ──────────────────────────────────────────────────────────────

/// @title   bounded_sum
/// @notice  Sums up to `MAX_LOOP_ITEMS` values from `items`, returning early
///          once the cap is reached.
/// @param   items  Pre-loaded numeric slice.
/// @return  Saturating sum of the first `min(items.len(), MAX_LOOP_ITEMS)` values.
///
/// @custom:gas  O(min(n, MAX_LOOP_ITEMS)) — predictable upper bound.
/// @custom:security  Arithmetic uses `saturating_add`; result never wraps.
pub fn bounded_sum(items: &Vec<i128>) -> i128 {
    let mut total: i128 = 0;
    let mut processed: u32 = 0;
    for value in items.iter() {
        if processed >= MAX_LOOP_ITEMS {
            break;
        }
        total = total.saturating_add(value);
        processed += 1;
    }
    total
}

/// @title   find_first
/// @notice  Returns the first value in `items` that satisfies `predicate`,
///          or `None` if no match is found within `MAX_LOOP_ITEMS`.
/// @param   items      Pre-loaded numeric slice.
/// @param   predicate  Pure function applied to each element.
/// @return  First matching value, or `None`.
///
/// @custom:gas  O(k) where k is the index of the first match — best case O(1).
pub fn find_first(items: &Vec<i128>, predicate: impl Fn(i128) -> bool) -> Option<i128> {
    let mut processed: u32 = 0;
    for value in items.iter() {
        if processed >= MAX_LOOP_ITEMS {
            break;
        }
        if predicate(value) {
            return Some(value);
        }
        processed += 1;
    }
    None
}

/// @title   count_matching
/// @notice  Counts values in `items` that satisfy `predicate`, up to
///          `MAX_LOOP_ITEMS`.
/// @param   items      Pre-loaded numeric slice.
/// @param   predicate  Pure function applied to each element.
/// @return  Number of matching elements (≤ `MAX_LOOP_ITEMS`).
///
/// @custom:gas  O(min(n, MAX_LOOP_ITEMS)).
pub fn count_matching(items: &Vec<i128>, predicate: impl Fn(i128) -> bool) -> u32 {
    let mut count: u32 = 0;
    let mut processed: u32 = 0;
    for value in items.iter() {
        if processed >= MAX_LOOP_ITEMS {
            break;
        }
        if predicate(value) {
            count += 1;
        }
        processed += 1;
    }
    count
}

/// @title   aggregate_stats
/// @notice  Computes count, sum, max, and min in a **single pass** over
///          `items`, bounded by `MAX_LOOP_ITEMS`.
/// @param   items  Pre-loaded numeric slice.
/// @return  `LoopAggregateStats` with all four fields populated.
///
/// @custom:gas  O(min(n, MAX_LOOP_ITEMS)) — four statistics for the cost of one.
/// @custom:security  Sum uses `saturating_add`; max/min comparisons are branchless.
pub fn aggregate_stats(items: &Vec<i128>) -> LoopAggregateStats {
    let mut count: u32 = 0;
    let mut sum: i128 = 0;
    let mut max: i128 = i128::MIN;
    let mut min: i128 = i128::MAX;

    for value in items.iter() {
        if count >= MAX_LOOP_ITEMS {
            break;
        }
        sum = sum.saturating_add(value);
        if value > max {
            max = value;
        }
        if value < min {
            min = value;
        }
        count += 1;
    }

    if count == 0 {
        return LoopAggregateStats { count: 0, sum: 0, max: 0, min: 0 };
    }

    LoopAggregateStats { count, sum, max, min }
}

/// @title   deduplicate_sorted
/// @notice  Returns a new `Vec` with consecutive duplicate values removed,
///          processing at most `MAX_LOOP_ITEMS` elements.
/// @dev     Input must be sorted for full deduplication; unsorted input only
///          removes *adjacent* duplicates (same semantics as `std::dedup`).
/// @param   env    The Soroban environment (needed to allocate the output `Vec`).
/// @param   items  Pre-loaded, sorted numeric slice.
/// @return  Deduplicated `Vec<i128>`.
///
/// @custom:gas  O(min(n, MAX_LOOP_ITEMS)) — single pass, no nested loops.
pub fn deduplicate_sorted(env: &soroban_sdk::Env, items: &Vec<i128>) -> Vec<i128> {
    let mut result: Vec<i128> = Vec::new(env);
    let mut last: Option<i128> = None;
    let mut processed: u32 = 0;

    for value in items.iter() {
        if processed >= MAX_LOOP_ITEMS {
            break;
        }
        if last != Some(value) {
            result.push_back(value);
            last = Some(value);
        }
        processed += 1;
    }

    result
}

/// @title   all_satisfy
/// @notice  Returns `true` only when every element in `items` (up to
///          `MAX_LOOP_ITEMS`) satisfies `predicate`.  Short-circuits on the
///          first failure.
/// @param   items      Pre-loaded numeric slice.
/// @param   predicate  Pure function applied to each element.
/// @return  `true` if all elements satisfy the predicate, `false` otherwise.
///          Returns `true` for an empty slice (vacuous truth).
///
/// @custom:gas  O(k) where k is the index of the first non-matching element.
pub fn all_satisfy(items: &Vec<i128>, predicate: impl Fn(i128) -> bool) -> bool {
    let mut processed: u32 = 0;
    for value in items.iter() {
        if processed >= MAX_LOOP_ITEMS {
            break;
        }
        if !predicate(value) {
            return false;
        }
        processed += 1;
    }
    true
}
