//! # computation_optimization
//!
//! @title   ComputationOptimization — Gas-efficient on-chain computation helpers
//!          for the Stellar Raise crowdfunding contract.
//!
//! @notice  Provides pure, storage-thin utilities that reduce instruction count
//!          and ledger I/O for the most common on-chain computations:
//!
//!          1. **Integer square-root** — O(log n) Newton–Raphson, no floats.
//!          2. **Weighted-average contribution** — single-pass, overflow-safe.
//!          3. **Tiered fee calculation** — basis-point tiers, no branching loops.
//!          4. **Batch min/max scan** — single pass over a bounded slice.
//!          5. **Contribution percentile rank** — O(n) rank without sorting.
//!          6. **Deadline proximity score** — normalised urgency in bps.
//!          7. **Compound progress** — multi-goal progress in one call.
//!
//! @dev     All public functions are **pure** (no storage reads/writes) unless
//!          explicitly noted.  Callers in `lib.rs` are responsible for auth and
//!          campaign-status checks before invoking mutating helpers.
//!
//! ## Security Assumptions
//!
//! 1. **No auth required** — all helpers are read-only utilities.
//! 2. **Overflow-safe** — `checked_*` / `saturating_*` used throughout;
//!    functions return `None` or a saturated value on overflow.
//! 3. **Bounded iteration** — every loop is capped at `MAX_BATCH` (50) to
//!    prevent unbounded gas consumption.
//! 4. **No floating-point** — all ratios use basis points (1 bps = 0.01 %)
//!    to stay within Soroban's deterministic integer model.
//! 5. **Deterministic** — outputs depend only on inputs; no randomness or
//!    timestamp reads inside pure helpers.

#![allow(dead_code)]

// ── Constants ─────────────────────────────────────────────────────────────────

/// @notice  Basis-point scale factor (10 000 bps = 100 %).
pub const BPS_SCALE: i128 = 10_000;

/// @notice  Maximum number of elements processed in a single batch call.
/// @dev     Aligns with `algorithm_optimization::MAX_BATCH_SIZE`.
pub const MAX_BATCH: usize = 50;

/// @notice  Maximum number of fee tiers supported by `tiered_fee_bps`.
pub const MAX_TIERS: usize = 8;

// ── 1. Integer square-root ────────────────────────────────────────────────────

/// @notice  Computes the integer square root of `n` using Newton–Raphson.
///
/// @dev     Returns the largest integer `r` such that `r * r <= n`.
///          Uses only integer arithmetic — no floating-point, no `std`.
///          Converges in O(log n) iterations.
///
/// @custom:security-note  `n = 0` and `n = 1` are handled as base cases.
///          Overflow is impossible because the intermediate `(x + n/x) / 2`
///          is always ≤ `n` for `n ≥ 1`.
///
/// @param   n  Non-negative integer to take the square root of.
/// @return  Integer square root of `n`.
pub fn isqrt(n: u128) -> u128 {
    if n < 2 {
        return n;
    }
    let mut x = n;
    let mut y = (x + 1) / 2;
    while y < x {
        x = y;
        y = (x + n / x) / 2;
    }
    x
}

// ── 2. Weighted-average contribution ─────────────────────────────────────────

/// @notice  Computes the weighted average of `amounts` using `weights` as
///          coefficients, in a single pass.
///
/// @dev     Returns `(sum(amounts[i] * weights[i])) / sum(weights[i])`.
///          Both slices must have the same length (≤ `MAX_BATCH`).
///          Returns `None` when:
///          - slices have different lengths,
///          - total weight is zero,
///          - any intermediate product overflows `i128`.
///
/// @custom:security-note  Uses `checked_mul` and `checked_add` to prevent
///          silent overflow on large token amounts.
///
/// @param   amounts  Contribution amounts (must be ≥ 0).
/// @param   weights  Corresponding weights (must be ≥ 0).
/// @return  Weighted average, or `None` on invalid input / overflow.
pub fn weighted_average(amounts: &[i128], weights: &[i128]) -> Option<i128> {
    if amounts.len() != weights.len() {
        return None;
    }
    if amounts.len() > MAX_BATCH {
        return None;
    }

    let mut weighted_sum: i128 = 0;
    let mut total_weight: i128 = 0;

    for (a, w) in amounts.iter().zip(weights.iter()) {
        if *w < 0 || *a < 0 {
            return None;
        }
        let product = a.checked_mul(*w)?;
        weighted_sum = weighted_sum.checked_add(product)?;
        total_weight = total_weight.checked_add(*w)?;
    }

    if total_weight == 0 {
        return None;
    }

    Some(weighted_sum / total_weight)
}

// ── 3. Tiered fee calculation ─────────────────────────────────────────────────

/// @notice  A single fee tier: contributions up to `threshold` (inclusive)
///          are charged `fee_bps` basis points.
///
/// @dev     Tiers must be provided in ascending `threshold` order.
///          The last tier's `threshold` acts as a catch-all ceiling.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct FeeTier {
    /// @notice  Upper bound of this tier (inclusive), in token units.
    pub threshold: i128,
    /// @notice  Fee rate for this tier in basis points (0–10 000).
    pub fee_bps: u32,
}

/// @notice  Computes the platform fee for `amount` using a tiered fee schedule.
///
/// @dev     Iterates tiers in order and returns the fee for the first tier
///          whose `threshold >= amount`.  Falls back to the last tier if none
///          match (i.e. `amount` exceeds all thresholds).
///
///          Fee = `amount * fee_bps / BPS_SCALE`, rounded down.
///
/// @custom:security-note  `tiers` must not be empty and must be sorted by
///          `threshold` ascending.  Returns `None` on overflow or empty input.
///
/// @param   amount  Contribution amount (must be > 0).
/// @param   tiers   Ordered fee tiers (max `MAX_TIERS`).
/// @return  Fee amount in token units, or `None` on invalid input / overflow.
pub fn tiered_fee_bps(amount: i128, tiers: &[FeeTier]) -> Option<i128> {
    if tiers.is_empty() || tiers.len() > MAX_TIERS || amount <= 0 {
        return None;
    }

    let applicable = tiers
        .iter()
        .find(|t| amount <= t.threshold)
        .unwrap_or_else(|| tiers.last().unwrap());

    amount
        .checked_mul(applicable.fee_bps as i128)?
        .checked_div(BPS_SCALE)
}

// ── 4. Batch min/max scan ─────────────────────────────────────────────────────

/// @notice  Returns `(min, max)` of a non-empty slice in a single pass.
///
/// @dev     O(n) with no allocations.  Returns `None` for empty or
///          oversized slices.
///
/// @custom:security-note  Bounded at `MAX_BATCH` to prevent unbounded gas.
///
/// @param   values  Slice of `i128` values (1 ≤ len ≤ `MAX_BATCH`).
/// @return  `Some((min, max))` or `None` if the slice is empty / too large.
pub fn batch_min_max(values: &[i128]) -> Option<(i128, i128)> {
    if values.is_empty() || values.len() > MAX_BATCH {
        return None;
    }

    let mut min = values[0];
    let mut max = values[0];

    for &v in &values[1..] {
        if v < min {
            min = v;
        }
        if v > max {
            max = v;
        }
    }

    Some((min, max))
}

// ── 5. Contribution percentile rank ──────────────────────────────────────────

/// @notice  Returns the percentile rank of `target` within `values` in bps.
///
/// @dev     Percentile rank = (number of values ≤ target) / total * BPS_SCALE.
///          O(n) — no sorting required.  Returns `None` for empty or oversized
///          slices.
///
/// @custom:security-note  Uses integer division; result is in [0, BPS_SCALE].
///
/// @param   target  The value whose rank is computed.
/// @param   values  All contribution amounts (1 ≤ len ≤ `MAX_BATCH`).
/// @return  Percentile rank in bps, or `None` on invalid input.
pub fn percentile_rank_bps(target: i128, values: &[i128]) -> Option<i128> {
    if values.is_empty() || values.len() > MAX_BATCH {
        return None;
    }

    let count_lte = values.iter().filter(|&&v| v <= target).count() as i128;
    let total = values.len() as i128;

    count_lte.checked_mul(BPS_SCALE)?.checked_div(total)
}

// ── 6. Deadline proximity score ───────────────────────────────────────────────

/// @notice  Returns a normalised urgency score in bps: 0 = far from deadline,
///          BPS_SCALE = at or past deadline.
///
/// @dev     Score = `(elapsed / total_duration) * BPS_SCALE`, clamped to
///          `[0, BPS_SCALE]`.
///
///          `elapsed  = now - start`
///          `duration = deadline - start`
///
///          Returns `0` when `now < start` (campaign not yet started).
///          Returns `BPS_SCALE` when `now >= deadline`.
///
/// @custom:security-note  All arithmetic is on `u64`; no overflow possible
///          for realistic timestamps (Unix epoch fits in u64 for centuries).
///
/// @param   now       Current ledger timestamp (Unix seconds).
/// @param   start     Campaign start timestamp.
/// @param   deadline  Campaign deadline timestamp (must be > `start`).
/// @return  Urgency score in bps, or `0` on invalid input.
pub fn deadline_proximity_bps(now: u64, start: u64, deadline: u64) -> u32 {
    if deadline <= start || now < start {
        return 0;
    }
    if now >= deadline {
        return BPS_SCALE as u32;
    }

    let elapsed = (now - start) as u128;
    let duration = (deadline - start) as u128;

    ((elapsed * BPS_SCALE as u128) / duration) as u32
}

// ── 7. Compound progress ──────────────────────────────────────────────────────

/// @notice  Computes progress in bps for each goal in `goals` against
///          `total_raised`, in a single pass.
///
/// @dev     For each goal `g`: progress = `(total_raised * BPS_SCALE) / g`,
///          clamped to `[0, BPS_SCALE]`.
///
///          Returns `None` when `goals` is empty, oversized, or contains a
///          non-positive value.
///
/// @custom:security-note  Uses `saturating_mul` to prevent overflow on large
///          balances; result is always ≤ BPS_SCALE.
///
/// @param   total_raised  Current total raised (must be ≥ 0).
/// @param   goals         Ordered list of funding goals (max `MAX_BATCH`).
/// @return  Vec of progress values in bps, parallel to `goals`, or `None`.
pub fn compound_progress_bps(total_raised: i128, goals: &[i128]) -> Option<Vec<u32>> {
    if goals.is_empty() || goals.len() > MAX_BATCH {
        return None;
    }

    let mut results = Vec::with_capacity(goals.len());

    for &g in goals {
        if g <= 0 {
            return None;
        }
        let raw = total_raised.saturating_mul(BPS_SCALE) / g;
        results.push(raw.clamp(0, BPS_SCALE) as u32);
    }

    Some(results)
}
