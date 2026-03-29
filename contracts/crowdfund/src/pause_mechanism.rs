//! # pause_mechanism
//!
//! @title   PauseMechanism — Emergency pause/unpause for the crowdfund contract.
//!
//! @notice  Provides a two-role pause system:
//!          - `PAUSER_ROLE` (or `DEFAULT_ADMIN_ROLE`) can pause immediately.
//!          - Only `DEFAULT_ADMIN_ROLE` can unpause — asymmetric by design.
//!
//!          When paused, `contribute()` and `withdraw()` are blocked.
//!          All other read-only functions remain available.
//!
//! @dev     This module is a focused facade over `access_control`.
//!          Storage layout uses `DataKey::Paused` (bool) in instance storage.
//!
//! ## Security Assumptions
//! 1. `PAUSER_ROLE` is a low-privilege hot key — it can freeze but not unfreeze.
//! 2. `DEFAULT_ADMIN_ROLE` should be a hardware wallet or multisig.
//! 3. Pause state persists across ledger closes until explicitly unpaused.
//! 4. Every pause/unpause emits an on-chain event for off-chain monitoring.

use soroban_sdk::{Address, Env};

use crate::access_control;

/// @notice Pause the contract, blocking `contribute()` and `withdraw()`.
/// @dev    Callable by `PAUSER_ROLE` or `DEFAULT_ADMIN_ROLE`.
///         Emits `(access, paused)` event with the caller address.
///
/// # Arguments
/// * `caller` — Must be the stored `PAUSER_ROLE` or `DEFAULT_ADMIN_ROLE`.
///
/// # Panics
/// * `"not authorized to pause"` if `caller` holds neither role.
pub fn pause(env: &Env, caller: &Address) {
    access_control::pause(env, caller);
}

/// @notice Unpause the contract, re-enabling `contribute()` and `withdraw()`.
/// @dev    Only `DEFAULT_ADMIN_ROLE` may unpause.
///         Emits `(access, unpaused)` event with the caller address.
///
/// # Arguments
/// * `caller` — Must be the stored `DEFAULT_ADMIN_ROLE`.
///
/// # Panics
/// * `"only DEFAULT_ADMIN_ROLE can unpause"` if `caller` is not the admin.
pub fn unpause(env: &Env, caller: &Address) {
    access_control::unpause(env, caller);
}

/// @notice Returns `true` if the contract is currently paused.
/// @dev    Pure storage read — no auth required.
pub fn is_paused(env: &Env) -> bool {
    access_control::is_paused(env)
}

/// @notice Panics with `"contract is paused"` if the contract is paused.
/// @dev    Call at the top of any state-mutating entry point that must be
///         blocked during an emergency (e.g. `contribute`, `withdraw`).
pub fn assert_not_paused(env: &Env) {
    access_control::assert_not_paused(env);
}
