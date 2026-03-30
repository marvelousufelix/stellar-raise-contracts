//! # state_migration
//!
//! @title   StateMigration — Secure on-chain state schema migration helpers.
//!
//! @notice  Provides utilities to version the contract state and apply
//!          deterministic migration steps during upgrades.
//!
//!          This module is designed for upgrade flexibility and requires
//!          explicit action from an authenticated admin flow in the host
//!          contract before legacy data versions become unsupported.
//!
//! ## Security Assumptions
//!
//! 1. Version transitions are strictly monotonic; downgrades are rejected.
//! 2. The host contract must call `migrate_to` only from an authorized entrypoint.
//! 3. Migration steps are idempotent: repeated invocations maintain invariants.
//! 4. Stored version field is in one dedicated key (no conflicting state paths).

#![allow(dead_code)]

use soroban_sdk::{contracterror, contracttype, Env};

/// Per-instance storage key namespace for migration metadata.
#[derive(Clone)]
#[contracttype]
pub enum StateMigrationKey {
    /// Stores the current state schema version as a `u32`.
    Version,
}

/// The current schema version that this contract implementation expects.
pub const CURRENT_SCHEMA_VERSION: u32 = 2;

/// A migration error return type for safe onboarding.
#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq)]
#[repr(u32)]
pub enum StateMigrationError {
    /// The requested target version is less than the current version.
    DowngradeNotAllowed = 1,
    /// The requested target version is not supported by this code.
    UnsupportedVersion = 2,
    /// The migration function was called before the contract was initialized.
    Uninitialized = 3,
}

/// @notice Retrieves the currently saved state schema version.
/// @return version number, or `0` if none is set (legacy/uninitialized).
pub fn get_schema_version(env: &Env) -> u32 {
    env.storage()
        .instance()
        .get(&StateMigrationKey::Version)
        .unwrap_or(0)
}

/// @notice Sets the schema version in instance storage.
pub fn set_schema_version(env: &Env, version: u32) {
    env.storage()
        .instance()
        .set(&StateMigrationKey::Version, &version);
}

/// @notice Checks whether migration is required to reach `target_version`.
/// @return true when the current version is below target.
pub fn needs_migration(env: &Env, target_version: u32) -> bool {
    get_schema_version(env) < target_version
}

/// @notice Perform ordered migrations to reach `target_version`.
///
/// @dev This function applies each migration step in ascending order.
///      It rejects downgrades and unsupported version targets.
///
/// @return the resulting version on success.
pub fn migrate_to(env: &Env, target_version: u32) -> Result<u32, StateMigrationError> {
    let mut current = get_schema_version(env);

    if current == 0 {
        return Err(StateMigrationError::Uninitialized);
    }

    if target_version < current {
        return Err(StateMigrationError::DowngradeNotAllowed);
    }

    if target_version > CURRENT_SCHEMA_VERSION {
        return Err(StateMigrationError::UnsupportedVersion);
    }

    while current < target_version {
        let next = current + 1;
        match next {
            1 => {
                // v0 -> v1 migration path (legacy media setup) runs once.
                migrate_v0_to_v1(env);
            }
            2 => {
                migrate_v1_to_v2(env);
            }
            _ => return Err(StateMigrationError::UnsupportedVersion),
        }

        current = next;
        set_schema_version(env, current);
    }

    Ok(current)
}

// ── Internal migration steps ─────────────────────────────────────────────────

fn migrate_v0_to_v1(_env: &Env) {
    // Spot-migrate legacy values, preserve invariants.
    // No-op in crowdfund sample contract.
}

fn migrate_v1_to_v2(_env: &Env) {
    // Example security migration: enforce non-negative totals.
    // Any rebalancing should be done by host contract around this call.
}

/// @notice Ensures current schema version matches the expected one.
/// @dev Panics if version mismatch to prevent applying incompatible logic.
pub fn enforce_current_version(env: &Env) {
    let version = get_schema_version(env);
    if version != CURRENT_SCHEMA_VERSION {
        panic!("incompatible schema version: expected {} got {}", CURRENT_SCHEMA_VERSION, version);
    }
}
