//! # Security Baseline Scanning
//!
//! This module provides on-chain security baseline checks for the Stellar Raise
//! crowdfund contract. It validates that critical invariants hold at any point
//! in the contract lifecycle and surfaces violations as typed errors.
//!
//! ## What it checks
//!
//! | Check | Invariant |
//! |-------|-----------|
//! | Admin set | `DataKey::Admin` must be present after initialisation |
//! | Creator set | `DataKey::Creator` must be present after initialisation |
//! | Goal positive | Funding goal must be > 0 |
//! | Deadline future | Deadline must be > current ledger timestamp at init |
//! | Min contribution non-negative | `min_contribution` must be ≥ 0 |
//! | Total raised non-negative | `total_raised` must never go below 0 |
//! | Status consistent | `Status` key must be present |
//! | Contribution non-negative | Any stored per-contributor amount must be ≥ 0 |
//!
//! ## Security Assumptions
//!
//! 1. `run_baseline_scan` is **read-only** — it never mutates state.
//! 2. Any `ScanError` returned indicates a corrupted or mis-initialised
//!    contract and should be treated as a critical finding.
//! 3. The scan is callable by anyone; there is no auth gate because it only
//!    reads storage.
//! 4. Individual checks are exposed as public functions so off-chain tooling
//!    can run targeted assertions.

#![allow(missing_docs)]

use soroban_sdk::{contracterror, Address, Env, Vec};

use crate::{DataKey, Status};

// ── Error type ────────────────────────────────────────────────────────────────

/// Errors returned when a security baseline check fails.
#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum ScanError {
    /// `DataKey::Admin` is missing from storage.
    AdminNotSet = 100,
    /// `DataKey::Creator` is missing from storage.
    CreatorNotSet = 101,
    /// The funding goal is zero or negative.
    GoalInvalid = 102,
    /// The deadline is not set or is in the past relative to the ledger.
    DeadlineInvalid = 103,
    /// `min_contribution` is negative.
    MinContributionInvalid = 104,
    /// `total_raised` is negative (should never happen).
    TotalRaisedNegative = 105,
    /// `DataKey::Status` is missing from storage.
    StatusNotSet = 106,
    /// A per-contributor contribution amount is negative.
    ContributionNegative = 107,
}

// ── Full scan ─────────────────────────────────────────────────────────────────

/// Run all baseline security checks and return the first error found, or
/// `Ok(())` if all checks pass.
///
/// @notice Read-only — does not mutate any state.
/// @param env Soroban environment.
/// @return `Ok(())` when all invariants hold, `Err(ScanError)` on first violation.
pub fn run_baseline_scan(env: &Env) -> Result<(), ScanError> {
    check_admin_set(env)?;
    check_creator_set(env)?;
    check_goal_positive(env)?;
    check_deadline_valid(env)?;
    check_min_contribution_valid(env)?;
    check_total_raised_non_negative(env)?;
    check_status_set(env)?;
    check_contributions_non_negative(env)?;
    Ok(())
}

// ── Individual checks ─────────────────────────────────────────────────────────

/// Verify that the admin key is present in storage.
///
/// @notice Fails with `ScanError::AdminNotSet` if missing.
pub fn check_admin_set(env: &Env) -> Result<(), ScanError> {
    if env.storage().instance().has(&DataKey::Admin) {
        Ok(())
    } else {
        Err(ScanError::AdminNotSet)
    }
}

/// Verify that the creator key is present in storage.
///
/// @notice Fails with `ScanError::CreatorNotSet` if missing.
pub fn check_creator_set(env: &Env) -> Result<(), ScanError> {
    if env.storage().instance().has(&DataKey::Creator) {
        Ok(())
    } else {
        Err(ScanError::CreatorNotSet)
    }
}

/// Verify that the funding goal is strictly positive.
///
/// @notice Fails with `ScanError::GoalInvalid` if goal ≤ 0 or not set.
pub fn check_goal_positive(env: &Env) -> Result<(), ScanError> {
    let goal: Option<i128> = env.storage().instance().get(&DataKey::Goal);
    match goal {
        Some(g) if g > 0 => Ok(()),
        _ => Err(ScanError::GoalInvalid),
    }
}

/// Verify that the deadline is set and is strictly after the current ledger
/// timestamp.
///
/// @notice Fails with `ScanError::DeadlineInvalid` if deadline ≤ now or not set.
/// @dev    This check is only meaningful during an active campaign. After the
///         deadline has passed the check will always return an error — callers
///         should only invoke this during the Active phase.
pub fn check_deadline_valid(env: &Env) -> Result<(), ScanError> {
    let deadline: Option<u64> = env.storage().instance().get(&DataKey::Deadline);
    match deadline {
        Some(d) if d > env.ledger().timestamp() => Ok(()),
        _ => Err(ScanError::DeadlineInvalid),
    }
}

/// Verify that `min_contribution` is non-negative.
///
/// @notice Fails with `ScanError::MinContributionInvalid` if < 0 or not set.
pub fn check_min_contribution_valid(env: &Env) -> Result<(), ScanError> {
    let min: Option<i128> = env.storage().instance().get(&DataKey::MinContribution);
    match min {
        Some(m) if m >= 0 => Ok(()),
        _ => Err(ScanError::MinContributionInvalid),
    }
}

/// Verify that `total_raised` is non-negative.
///
/// @notice Fails with `ScanError::TotalRaisedNegative` if < 0.
pub fn check_total_raised_non_negative(env: &Env) -> Result<(), ScanError> {
    let total: i128 = env
        .storage()
        .instance()
        .get(&DataKey::TotalRaised)
        .unwrap_or(0);
    if total >= 0 {
        Ok(())
    } else {
        Err(ScanError::TotalRaisedNegative)
    }
}

/// Verify that the `Status` key is present in storage.
///
/// @notice Fails with `ScanError::StatusNotSet` if missing.
pub fn check_status_set(env: &Env) -> Result<(), ScanError> {
    let status: Option<Status> = env.storage().instance().get(&DataKey::Status);
    if status.is_some() {
        Ok(())
    } else {
        Err(ScanError::StatusNotSet)
    }
}

/// Verify that every stored per-contributor contribution amount is non-negative.
///
/// @notice Iterates the `Contributors` persistent list. O(n) where n is the
///         number of contributors — bounded by `MAX_CONTRIBUTORS`.
/// @notice Fails with `ScanError::ContributionNegative` on first negative value.
pub fn check_contributions_non_negative(env: &Env) -> Result<(), ScanError> {
    let contributors: Vec<Address> = env
        .storage()
        .persistent()
        .get(&DataKey::Contributors)
        .unwrap_or_else(|| Vec::new(env));

    for contributor in contributors.iter() {
        let amount: i128 = env
            .storage()
            .persistent()
            .get(&DataKey::Contribution(contributor))
            .unwrap_or(0);
        if amount < 0 {
            return Err(ScanError::ContributionNegative);
        }
    }
    Ok(())
}
