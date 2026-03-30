//! # emergency_stop
//!
//! @title   EmergencyStop — Permanent, irreversible contract shutdown.
//!
//! @notice  Provides a one-way kill switch distinct from the reversible pause
//!          mechanism.  Once triggered, the contract is permanently stopped:
//!          all state-mutating entry points are blocked forever and the
//!          campaign status is set to `Cancelled` so contributors can reclaim
//!          funds via `refund_single`.
//!
//! @dev     ### Difference from pause
//!          `pause` / `unpause` is a reversible, operational control.
//!          `emergency_stop` is irreversible — it cannot be undone even by
//!          `DEFAULT_ADMIN_ROLE`.  Use it only when the contract is
//!          irrecoverably compromised.
//!
//!          ### Storage layout
//!          - `DataKey::EmergencyStopped` (bool, instance storage) — set to
//!            `true` on trigger; never cleared.
//!
//!          ### Blocked entry points
//!          Call `assert_not_stopped` at the top of any state-mutating function:
//!          `contribute`, `withdraw`, `pledge`, `collect_pledges`, `cancel`,
//!          `upgrade`, `update_metadata`.
//!
//! ## Security Assumptions
//! 1. Only `DEFAULT_ADMIN_ROLE` may trigger the emergency stop.
//! 2. The stop is **irreversible** — no function clears `EmergencyStopped`.
//! 3. Triggering emits `(emergency, stopped)` for off-chain monitoring.
//! 4. After stop, `refund_single` remains callable so contributors are not
//!    permanently locked out of their funds.
//! 5. `assert_not_stopped` is a cheap storage read — negligible gas cost.

#![allow(dead_code)]

use soroban_sdk::{Address, Env, Symbol};

use crate::{access_control, DataKey, Status};

// ── Core functions ────────────────────────────────────────────────────────────

/// @notice Trigger the emergency stop — permanently halts the contract.
/// @dev    Only `DEFAULT_ADMIN_ROLE` may call this.
///         Sets `DataKey::EmergencyStopped = true` and transitions the campaign
///         status to `Cancelled` so contributors can claim refunds immediately.
///         Emits `(emergency, stopped)` with the caller address.
///
/// # Arguments
/// * `caller` — Must be the stored `DEFAULT_ADMIN_ROLE`.
///
/// # Panics
/// * `"only DEFAULT_ADMIN_ROLE can trigger emergency stop"` if not admin.
/// * `"already stopped"` if the emergency stop was already triggered.
pub fn trigger(env: &Env, caller: &Address) {
    caller.require_auth();

    let admin = access_control::get_default_admin(env);
    if *caller != admin {
        panic!("only DEFAULT_ADMIN_ROLE can trigger emergency stop");
    }

    if is_stopped(env) {
        panic!("already stopped");
    }

    env.storage()
        .instance()
        .set(&DataKey::EmergencyStopped, &true);

    // Transition campaign to Cancelled so refund_single becomes available.
    env.storage()
        .instance()
        .set(&DataKey::Status, &Status::Cancelled);

    env.events().publish(
        (
            Symbol::new(env, "emergency"),
            Symbol::new(env, "stopped"),
        ),
        caller.clone(),
    );
}

/// @notice Returns `true` if the emergency stop has been triggered.
/// @dev    Pure storage read — no auth required.
pub fn is_stopped(env: &Env) -> bool {
    env.storage()
        .instance()
        .get(&DataKey::EmergencyStopped)
        .unwrap_or(false)
}

/// @notice Panics with `"emergency stop active"` if the stop has been triggered.
/// @dev    Call at the top of every state-mutating entry point.
pub fn assert_not_stopped(env: &Env) {
    if is_stopped(env) {
        panic!("emergency stop active");
    }
}
