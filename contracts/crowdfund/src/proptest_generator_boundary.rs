//! # Proptest Generator Boundary Conditions
//!
//! @title   ProptestGeneratorBoundary
//! @notice  Central authority for all boundary constants and validation helpers
//!          used by property-based tests and frontend UI input validation.
//! @dev     Standalone pure functions are exported for use in `#[cfg(test)]`
//!          modules. The `ProptestGeneratorBoundary` contract exposes the same
//!          logic on-chain so off-chain scripts can query current platform limits
//!          without hard-coding them.
//!
//! ## Security Assumptions
//!
//! - **Overflow safety**: All goal and contribution values are bounded well below
//!   `i128::MAX`, eliminating integer-overflow risk in arithmetic.
//! - **Division-by-zero**: `compute_progress_bps` / `clamp_progress_bps` guard
//!   against `goal == 0` before dividing.
//! - **Timestamp validity**: `DEADLINE_OFFSET_MIN` (1 000 s) prevents campaigns
//!   so short they cause timing races in CI; `DEADLINE_OFFSET_MAX` (1 000 000 s)
//!   prevents unreasonably far-future deadlines.
//! - **Basis-point cap**: `PROGRESS_BPS_CAP` and `FEE_BPS_CAP` are both 10 000,
//!   ensuring frontend progress bars and fee displays never exceed 100 %.
//! - **Immutable constants**: All limits are compile-time constants, so they
//!   cannot be mutated at runtime.

// proptest_generator_boundary — Boundary constants and validation helpers.

use soroban_sdk::{contract, contractimpl, Env, Symbol};

// ── Boundary Constants ────────────────────────────────────────────────────────

/// Minimum deadline offset in seconds from `now` (~17 minutes).
///
/// @notice Values below this caused flaky proptest timing races and
///         flickering countdown displays in the frontend UI.
pub const DEADLINE_OFFSET_MIN: u64 = 1_000;

/// Maximum deadline offset in seconds from `now` (~11.5 days).
///
/// @notice Prevents unreasonably far-future deadlines that break UI date
///         formatting and exceed reasonable campaign windows.
pub const DEADLINE_OFFSET_MAX: u64 = 1_000_000;

/// Minimum valid funding goal in token stroops.
///
/// @notice Goals below this produce division-by-zero or near-zero progress
///         percentages that render incorrectly in the frontend progress bar.
pub const GOAL_MIN: i128 = 1_000;

/// Maximum valid funding goal for proptest generation.
///
/// @notice Caps generator output to avoid i128 overflow in fee and progress
///         calculations. 100 M stroops ≈ 10 XLM at 7-decimal precision.
pub const GOAL_MAX: i128 = 100_000_000;

/// Absolute floor for `min_contribution` values.
///
/// @notice Ensures at least one stroop must be contributed, preventing
///         zero-amount contribution exploits.
pub const MIN_CONTRIBUTION_FLOOR: i128 = 1;

/// Basis-point cap for campaign progress display (100 %).
///
/// @notice Frontend progress bars clamp to this value so over-funded
///         campaigns never render above 100 %.
pub const PROGRESS_BPS_CAP: u32 = 10_000;

/// Basis-point cap for platform fees (100 %).
///
/// @notice Prevents fee configurations that would consume the entire
///         campaign payout.
pub const FEE_BPS_CAP: u32 = 10_000;

/// Minimum number of proptest cases per property test.
///
/// @dev Keeps CI runtimes predictable; below 32 cases gives poor coverage.
pub const PROPTEST_CASES_MIN: u32 = 32;

/// Maximum number of proptest cases per property test.
///
/// @dev Above 256 cases the test suite exceeds the 15-minute CI timeout.
pub const PROPTEST_CASES_MAX: u32 = 256;

/// Maximum batch size for generator output slices.
pub const GENERATOR_BATCH_MAX: u32 = 512;

// ── Pure Validation Helpers ───────────────────────────────────────────────────
//
// These are standalone `pub fn` (no `Env`) so they can be called directly
// from `#[cfg(test)]` proptest blocks without spinning up a Soroban environment.

/// Returns `true` if `offset` is within `[DEADLINE_OFFSET_MIN, DEADLINE_OFFSET_MAX]`.
///
/// @param  offset  Seconds from the current ledger timestamp to the campaign deadline.
/// @return `true`  when the offset is a safe, UI-displayable campaign duration.
///
/// @security Rejects values < 1 000 that cause timing races and values that
///           could overflow a `u64` timestamp when added to `now`.
#[inline]
pub fn is_valid_deadline_offset(offset: u64) -> bool {
    (DEADLINE_OFFSET_MIN..=DEADLINE_OFFSET_MAX).contains(&offset)
}

/// Returns `true` if `goal` is within `[GOAL_MIN, GOAL_MAX]`.
///
/// @param  goal  Funding target in the token's smallest unit (stroops).
/// @return `true` when the goal is safe for arithmetic and UI display.
///
/// @security Rejects `goal <= 0` which would cause division-by-zero in
///           `compute_progress_bps` and break the frontend progress bar.
#[inline]
pub fn is_valid_goal(goal: i128) -> bool {
    (GOAL_MIN..=GOAL_MAX).contains(&goal)
}

/// Returns `true` if `min_contribution` is a valid floor for the given `goal`.
///
/// @param  min_contribution  Minimum amount a contributor must send.
/// @param  goal              The campaign's funding target.
/// @return `true` when `MIN_CONTRIBUTION_FLOOR <= min_contribution <= goal`.
///
/// @security Ensures `min_contribution` never exceeds `goal`, which would
///           make the campaign permanently un-fundable.
#[inline]
pub fn is_valid_min_contribution(min_contribution: i128, goal: i128) -> bool {
    min_contribution >= MIN_CONTRIBUTION_FLOOR && min_contribution <= goal
}

/// Returns `true` if `amount >= min_contribution`.
///
/// @param  amount           The contribution amount being validated.
/// @param  min_contribution The campaign's minimum contribution floor.
/// @return `true` when the amount meets the minimum threshold.
#[inline]
pub fn is_valid_contribution_amount(amount: i128, min_contribution: i128) -> bool {
    amount >= min_contribution
}

/// Clamps a raw basis-point value into `[0, PROGRESS_BPS_CAP]`.
///
/// @param  raw  Unclamped progress value (may be negative or > 10 000).
/// @return A `u32` in `[0, 10_000]` safe for frontend progress-bar rendering.
///
/// @notice Negative inputs (e.g. when `raised < 0`) are treated as 0 %.
///         Over-funded campaigns are capped at exactly 100 %.
#[inline]
pub fn clamp_progress_bps(raw: i128) -> u32 {
    if raw <= 0 {
        0
    } else if raw >= PROGRESS_BPS_CAP as i128 {
        PROGRESS_BPS_CAP
    } else {
        raw as u32
    }
}

/// Computes campaign progress in basis points from `raised` and `goal`.
///
/// @param  raised  Total tokens raised so far.
/// @param  goal    Campaign funding target (must be > 0).
/// @return Basis points in `[0, 10_000]`; returns 0 when `goal <= 0`.
///
/// @security Uses `saturating_mul` to prevent overflow on large `raised`
///           values before dividing by `goal`.
#[inline]
pub fn compute_progress_bps(raised: i128, goal: i128) -> u32 {
    if goal <= 0 {
        return 0;
    }
    let raw = raised.saturating_mul(10_000) / goal;
    clamp_progress_bps(raw)
}

/// Clamps a requested proptest case count into `[PROPTEST_CASES_MIN, PROPTEST_CASES_MAX]`.
///
/// @param  requested  Caller-supplied case count.
/// @return A value guaranteed to be in `[32, 256]`.
#[inline]
pub fn clamp_proptest_cases(requested: u32) -> u32 {
    requested.clamp(PROPTEST_CASES_MIN, PROPTEST_CASES_MAX)
}

// ── On-Chain Contract ─────────────────────────────────────────────────────────

/// On-chain contract that exposes boundary constants and validation logic so
/// off-chain scripts and other contracts can query current platform limits.
///
/// @notice All methods are pure (read-only) and do not modify contract state.
#[contract]
pub struct ProptestGeneratorBoundary;

#[contractimpl]
impl ProptestGeneratorBoundary {
    /// Returns the minimum deadline offset in seconds.
    ///
    /// @return `DEADLINE_OFFSET_MIN` (1 000).
    pub fn deadline_offset_min(_env: Env) -> u64 {
        DEADLINE_OFFSET_MIN
    }

    /// Returns the maximum deadline offset in seconds.
    ///
    /// @return `DEADLINE_OFFSET_MAX` (1 000 000).
    pub fn deadline_offset_max(_env: Env) -> u64 {
        DEADLINE_OFFSET_MAX
    }

    /// Returns the minimum valid goal amount in stroops.
    ///
    /// @return `GOAL_MIN` (1 000).
    pub fn goal_min(_env: Env) -> i128 {
        GOAL_MIN
    }

    /// Returns the maximum goal amount for proptest generation.
    ///
    /// @return `GOAL_MAX` (100 000 000).
    pub fn goal_max(_env: Env) -> i128 {
        GOAL_MAX
    }

    /// Returns the absolute floor for contribution amounts.
    ///
    /// @return `MIN_CONTRIBUTION_FLOOR` (1).
    pub fn min_contribution_floor(_env: Env) -> i128 {
        MIN_CONTRIBUTION_FLOOR
    }

    /// Returns `true` if `offset` is within the valid deadline range.
    ///
    /// @param  offset  Seconds from now to the campaign deadline.
    /// @return Boolean validity result.
    pub fn is_valid_deadline_offset(_env: Env, offset: u64) -> bool {
        is_valid_deadline_offset(offset)
    }

    /// Returns `true` if `goal` is within the valid goal range.
    ///
    /// @param  goal  Funding target in stroops.
    /// @return Boolean validity result.
    pub fn is_valid_goal(_env: Env, goal: i128) -> bool {
        is_valid_goal(goal)
    }

    /// Clamps a requested proptest case count into safe operating bounds.
    ///
    /// @param  requested  Caller-supplied case count.
    /// @return Clamped value in `[32, 256]`.
    pub fn clamp_proptest_cases(_env: Env, requested: u32) -> u32 {
        clamp_proptest_cases(requested)
    }

    /// Computes campaign progress in basis points, capped at 10 000.
    ///
    /// @param  raised  Total tokens raised.
    /// @param  goal    Campaign funding target.
    /// @return Basis points in `[0, 10_000]`.
    pub fn compute_progress_bps(_env: Env, raised: i128, goal: i128) -> u32 {
        compute_progress_bps(raised, goal)
    }

    /// Returns a diagnostic tag symbol used in boundary log events.
    ///
    /// @return The `Symbol` `"boundary"`.
    pub fn log_tag(_env: Env) -> Symbol {
        Symbol::new(&_env, "boundary")
    }
}
