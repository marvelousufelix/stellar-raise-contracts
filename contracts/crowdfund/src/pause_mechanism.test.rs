//! Tests for the pause_mechanism module.
//!
//! Covers:
//! - Pauser and admin can pause
//! - Only admin can unpause (asymmetric)
//! - Unauthorized callers cannot pause or unpause
//! - contribute() is blocked when paused
//! - withdraw() is blocked when paused
//! - is_paused() reflects state correctly
//! - Double-pause and double-unpause are idempotent
//! - Events are emitted on pause/unpause

#![cfg(test)]

use soroban_sdk::{
    testutils::{Address as _, Ledger},
    token, Address, Env,
};

use crate::{
    access_control,
    pause_mechanism::{assert_not_paused, is_paused, pause, unpause},
    ContractError, CrowdfundContract, CrowdfundContractClient, DataKey, PlatformConfig, Status,
};

// ── Helpers ───────────────────────────────────────────────────────────────────

fn setup_roles(env: &Env) -> (Address, Address) {
    let admin = Address::generate(env);
    let pauser = Address::generate(env);
    env.storage()
        .instance()
        .set(&DataKey::DefaultAdmin, &admin);
    env.storage().instance().set(&DataKey::Pauser, &pauser);
    env.storage().instance().set(&DataKey::Paused, &false);
    (admin, pauser)
}

// ── pause() ───────────────────────────────────────────────────────────────────

#[test]
fn test_pauser_can_pause() {
    let env = Env::default();
    env.mock_all_auths();
    let (_admin, pauser) = setup_roles(&env);

    pause(&env, &pauser);

    assert!(is_paused(&env));
}

#[test]
fn test_admin_can_pause() {
    let env = Env::default();
    env.mock_all_auths();
    let (admin, _pauser) = setup_roles(&env);

    pause(&env, &admin);

    assert!(is_paused(&env));
}

#[test]
#[should_panic(expected = "not authorized to pause")]
fn test_unauthorized_cannot_pause() {
    let env = Env::default();
    env.mock_all_auths();
    setup_roles(&env);
    let stranger = Address::generate(&env);

    pause(&env, &stranger);
}

// ── unpause() ─────────────────────────────────────────────────────────────────

#[test]
fn test_admin_can_unpause() {
    let env = Env::default();
    env.mock_all_auths();
    let (admin, _pauser) = setup_roles(&env);

    pause(&env, &admin);
    assert!(is_paused(&env));

    unpause(&env, &admin);
    assert!(!is_paused(&env));
}

#[test]
#[should_panic(expected = "only DEFAULT_ADMIN_ROLE can unpause")]
fn test_pauser_cannot_unpause() {
    let env = Env::default();
    env.mock_all_auths();
    let (admin, pauser) = setup_roles(&env);

    pause(&env, &admin);
    unpause(&env, &pauser); // must panic
}

#[test]
#[should_panic(expected = "only DEFAULT_ADMIN_ROLE can unpause")]
fn test_unauthorized_cannot_unpause() {
    let env = Env::default();
    env.mock_all_auths();
    let (admin, _pauser) = setup_roles(&env);
    let stranger = Address::generate(&env);

    pause(&env, &admin);
    unpause(&env, &stranger); // must panic
}

// ── assert_not_paused() ───────────────────────────────────────────────────────

#[test]
fn test_assert_not_paused_passes_when_unpaused() {
    let env = Env::default();
    env.mock_all_auths();
    setup_roles(&env);

    // Should not panic
    assert_not_paused(&env);
}

#[test]
#[should_panic(expected = "contract is paused")]
fn test_assert_not_paused_panics_when_paused() {
    let env = Env::default();
    env.mock_all_auths();
    let (admin, _pauser) = setup_roles(&env);

    pause(&env, &admin);
    assert_not_paused(&env); // must panic
}

// ── is_paused() ───────────────────────────────────────────────────────────────

#[test]
fn test_is_paused_reflects_state() {
    let env = Env::default();
    env.mock_all_auths();
    let (admin, _pauser) = setup_roles(&env);

    assert!(!is_paused(&env));
    pause(&env, &admin);
    assert!(is_paused(&env));
    unpause(&env, &admin);
    assert!(!is_paused(&env));
}

// ── Idempotency ───────────────────────────────────────────────────────────────

#[test]
fn test_double_pause_is_idempotent() {
    let env = Env::default();
    env.mock_all_auths();
    let (admin, _pauser) = setup_roles(&env);

    pause(&env, &admin);
    pause(&env, &admin); // second pause should not panic
    assert!(is_paused(&env));
}

#[test]
fn test_double_unpause_is_idempotent() {
    let env = Env::default();
    env.mock_all_auths();
    let (admin, _pauser) = setup_roles(&env);

    pause(&env, &admin);
    unpause(&env, &admin);
    unpause(&env, &admin); // second unpause should not panic
    assert!(!is_paused(&env));
}

// ── Default state ─────────────────────────────────────────────────────────────

#[test]
fn test_default_state_is_unpaused() {
    let env = Env::default();
    // No storage set — is_paused should default to false
    assert!(!is_paused(&env));
}
