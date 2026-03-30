//! Additional tests for two-step access control flows.

#![cfg(test)]

use soroban_sdk::{testutils::Address as _, Address, Env};

use crate::{
    access_control::{
        accept_default_admin_role, cancel_default_admin_transfer, get_default_admin,
        get_pending_default_admin, propose_default_admin_transfer,
    },
    DataKey,
};

fn setup_roles(env: &Env) -> (Address, Address) {
    let admin = Address::generate(env);
    let governance = Address::generate(env);
    env.storage().instance().set(&DataKey::DefaultAdmin, &admin);
    env.storage().instance().set(&DataKey::GovernanceAddress, &governance);
    (admin, governance)
}

#[test]
fn admin_can_propose_and_pending_can_accept() {
    let env = Env::default();
    env.mock_all_auths();

    let (admin, _gov) = setup_roles(&env);
    let pending = Address::generate(&env);

    propose_default_admin_transfer(&env, &admin, &pending);
    assert_eq!(get_pending_default_admin(&env), Some(pending.clone()));

    accept_default_admin_role(&env, &pending);
    assert_eq!(get_default_admin(&env), pending);
    assert_eq!(get_pending_default_admin(&env), None);
}

#[test]
#[should_panic(expected = "only DEFAULT_ADMIN_ROLE can propose admin transfer")]
fn non_admin_cannot_propose_transfer() {
    let env = Env::default();
    env.mock_all_auths();

    let (_admin, _gov) = setup_roles(&env);
    let attacker = Address::generate(&env);
    let pending = Address::generate(&env);

    propose_default_admin_transfer(&env, &attacker, &pending);
}

#[test]
#[should_panic(expected = "only pending admin can accept")]
fn non_pending_cannot_accept_transfer() {
    let env = Env::default();
    env.mock_all_auths();

    let (admin, _gov) = setup_roles(&env);
    let pending = Address::generate(&env);
    let not_pending = Address::generate(&env);

    propose_default_admin_transfer(&env, &admin, &pending);
    accept_default_admin_role(&env, &not_pending);
}

#[test]
fn admin_can_cancel_pending_transfer() {
    let env = Env::default();
    env.mock_all_auths();

    let (admin, _gov) = setup_roles(&env);
    let pending = Address::generate(&env);

    propose_default_admin_transfer(&env, &admin, &pending);
    assert!(get_pending_default_admin(&env).is_some());

    cancel_default_admin_transfer(&env, &admin);
    assert_eq!(get_pending_default_admin(&env), None);
}

#[test]
#[should_panic(expected = "only DEFAULT_ADMIN_ROLE can cancel admin transfer")]
fn non_admin_cannot_cancel_transfer() {
    let env = Env::default();
    env.mock_all_auths();

    let (admin, _gov) = setup_roles(&env);
    let pending = Address::generate(&env);
    let attacker = Address::generate(&env);

    propose_default_admin_transfer(&env, &admin, &pending);
    cancel_default_admin_transfer(&env, &attacker);
}
