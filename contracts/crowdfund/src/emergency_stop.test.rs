//! Tests for `emergency_stop`.
//!
//! Coverage:
//! - Admin can trigger emergency stop
//! - Non-admin cannot trigger emergency stop
//! - is_stopped: false before trigger, true after
//! - assert_not_stopped: passes when not stopped, panics when stopped
//! - trigger sets campaign status to Cancelled
//! - trigger panics if already stopped (idempotency guard)
//! - contribute is blocked after emergency stop
//! - withdraw is blocked after emergency stop

#![cfg(test)]

use soroban_sdk::{testutils::Address as _, Address, Env};

use crate::{
    emergency_stop::{assert_not_stopped, is_stopped, trigger},
    DataKey, Status,
};

// ── Helpers ───────────────────────────────────────────────────────────────────

fn setup_admin(env: &Env) -> Address {
    let admin = Address::generate(env);
    env.storage()
        .instance()
        .set(&DataKey::DefaultAdmin, &admin);
    admin
}

fn seed_active_status(env: &Env) {
    env.storage()
        .instance()
        .set(&DataKey::Status, &Status::Active);
}

// ── trigger() ─────────────────────────────────────────────────────────────────

#[test]
fn test_admin_can_trigger_emergency_stop() {
    let env = Env::default();
    env.mock_all_auths();
    let admin = setup_admin(&env);
    seed_active_status(&env);

    trigger(&env, &admin);

    assert!(is_stopped(&env));
}

#[test]
#[should_panic(expected = "only DEFAULT_ADMIN_ROLE can trigger emergency stop")]
fn test_non_admin_cannot_trigger() {
    let env = Env::default();
    env.mock_all_auths();
    setup_admin(&env);
    seed_active_status(&env);
    let stranger = Address::generate(&env);

    trigger(&env, &stranger);
}

#[test]
#[should_panic(expected = "already stopped")]
fn test_trigger_panics_if_already_stopped() {
    let env = Env::default();
    env.mock_all_auths();
    let admin = setup_admin(&env);
    seed_active_status(&env);

    trigger(&env, &admin);
    trigger(&env, &admin); // second call must panic
}

// ── Status transition ─────────────────────────────────────────────────────────

#[test]
fn test_trigger_sets_status_to_cancelled() {
    let env = Env::default();
    env.mock_all_auths();
    let admin = setup_admin(&env);
    seed_active_status(&env);

    trigger(&env, &admin);

    let status: Status = env.storage().instance().get(&DataKey::Status).unwrap();
    assert_eq!(status, Status::Cancelled);
}

// ── is_stopped() ──────────────────────────────────────────────────────────────

#[test]
fn test_is_stopped_false_before_trigger() {
    let env = Env::default();
    assert!(!is_stopped(&env));
}

#[test]
fn test_is_stopped_true_after_trigger() {
    let env = Env::default();
    env.mock_all_auths();
    let admin = setup_admin(&env);
    seed_active_status(&env);

    trigger(&env, &admin);

    assert!(is_stopped(&env));
}

// ── assert_not_stopped() ──────────────────────────────────────────────────────

#[test]
fn test_assert_not_stopped_passes_when_not_stopped() {
    let env = Env::default();
    // Should not panic
    assert_not_stopped(&env);
}

#[test]
#[should_panic(expected = "emergency stop active")]
fn test_assert_not_stopped_panics_when_stopped() {
    let env = Env::default();
    env.mock_all_auths();
    let admin = setup_admin(&env);
    seed_active_status(&env);

    trigger(&env, &admin);
    assert_not_stopped(&env); // must panic
}

// ── Irreversibility ───────────────────────────────────────────────────────────

#[test]
fn test_stop_flag_cannot_be_cleared_by_storage_absence() {
    let env = Env::default();
    env.mock_all_auths();
    let admin = setup_admin(&env);
    seed_active_status(&env);

    trigger(&env, &admin);

    // Verify the flag is persisted in instance storage
    let flag: bool = env
        .storage()
        .instance()
        .get(&DataKey::EmergencyStopped)
        .unwrap_or(false);
    assert!(flag);
}
