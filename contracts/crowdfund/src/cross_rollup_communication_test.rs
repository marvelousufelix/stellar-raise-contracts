//! Tests for the `cross_rollup_communication` module.
//!
//! Covers:
//! - Registering and deregistering trusted contracts (happy path + auth guards)
//! - Allowlist capacity limit enforcement
//! - Idempotent registration
//! - `is_trusted` / `trusted_contracts` view helpers
//! - `invoke_external` dispatches to trusted contracts and emits audit events
//! - `invoke_external` panics on untrusted targets
//! - Deregistration removes the correct entry and leaves others intact

#![cfg(test)]

use soroban_sdk::{
    contract, contractimpl,
    symbol_short,
    testutils::{Address as _, Events},
    Address, Env, FromVal, Symbol, Val, Vec,
};

use crate::{
    cross_rollup_communication::{
        deregister_trusted_contract, invoke_external, is_trusted, register_trusted_contract,
        trusted_contracts, MAX_TRUSTED_CONTRACTS,
    },
    CrowdfundContract, CrowdfundContractClient,
};

// ── Minimal stub contract used as an "external" target ───────────────────────

#[contract]
struct StubContract;

#[contractimpl]
impl StubContract {
    /// Returns the constant 42 so tests can verify the return value.
    pub fn ping(_env: Env) -> u32 {
        42
    }
}

// ── Test helpers ──────────────────────────────────────────────────────────────

/// Spin up a fully-initialized crowdfund contract and return the env,
/// client, admin address, and a funded token address.
fn setup() -> (Env, CrowdfundContractClient<'static>, Address, Address) {
    let env = Env::default();
    env.mock_all_auths();

    let contract_id = env.register(CrowdfundContract, ());
    let client = CrowdfundContractClient::new(&env, &contract_id);

    let token_admin = Address::generate(&env);
    let token_id = env.register_stellar_asset_contract_v2(token_admin.clone());
    let token_address = token_id.address();

    let admin = Address::generate(&env);
    let creator = Address::generate(&env);

    let deadline = env.ledger().timestamp() + 1_000;
    client.initialize(
        &admin,
        &creator,
        &token_address,
        &1_000_i128,
        &deadline,
        &1_i128,
        &None,
        &None,
        &None,
    );

    (env, client, admin, token_address)
}

// ── register_trusted_contract ─────────────────────────────────────────────────

#[test]
fn test_register_trusted_contract_happy_path() {
    let (env, _client, admin, _token) = setup();
    let external = Address::generate(&env);

    env.as_contract(&_client.address, || {
        register_trusted_contract(&env, &admin, &external).unwrap();
        assert!(is_trusted(&env, &external));
    });
}

#[test]
fn test_register_trusted_contract_idempotent() {
    let (env, _client, admin, _token) = setup();
    let external = Address::generate(&env);

    env.as_contract(&_client.address, || {
        register_trusted_contract(&env, &admin, &external).unwrap();
        // Second call must not panic or duplicate the entry.
        register_trusted_contract(&env, &admin, &external).unwrap();
        assert_eq!(trusted_contracts(&env).len(), 1);
    });
}

#[test]
#[should_panic(expected = "not authorized")]
fn test_register_trusted_contract_non_admin_panics() {
    let (env, _client, _admin, _token) = setup();
    let attacker = Address::generate(&env);
    let external = Address::generate(&env);

    env.as_contract(&_client.address, || {
        register_trusted_contract(&env, &attacker, &external).unwrap();
    });
}

#[test]
#[should_panic(expected = "trusted contract limit reached")]
fn test_register_trusted_contract_limit_enforced() {
    let (env, _client, admin, _token) = setup();

    env.as_contract(&_client.address, || {
        for _ in 0..MAX_TRUSTED_CONTRACTS {
            let addr = Address::generate(&env);
            register_trusted_contract(&env, &admin, &addr).unwrap();
        }
        // One more must panic.
        let extra = Address::generate(&env);
        register_trusted_contract(&env, &admin, &extra).unwrap();
    });
}

// ── deregister_trusted_contract ───────────────────────────────────────────────

#[test]
fn test_deregister_trusted_contract_removes_entry() {
    let (env, _client, admin, _token) = setup();
    let a = Address::generate(&env);
    let b = Address::generate(&env);

    env.as_contract(&_client.address, || {
        register_trusted_contract(&env, &admin, &a).unwrap();
        register_trusted_contract(&env, &admin, &b).unwrap();

        deregister_trusted_contract(&env, &admin, &a).unwrap();

        assert!(!is_trusted(&env, &a));
        assert!(is_trusted(&env, &b));
        assert_eq!(trusted_contracts(&env).len(), 1);
    });
}

#[test]
fn test_deregister_trusted_contract_noop_when_not_registered() {
    let (env, _client, admin, _token) = setup();
    let unknown = Address::generate(&env);

    env.as_contract(&_client.address, || {
        // Should not panic even if address was never registered.
        deregister_trusted_contract(&env, &admin, &unknown).unwrap();
        assert_eq!(trusted_contracts(&env).len(), 0);
    });
}

#[test]
#[should_panic(expected = "not authorized")]
fn test_deregister_trusted_contract_non_admin_panics() {
    let (env, _client, admin, _token) = setup();
    let attacker = Address::generate(&env);
    let external = Address::generate(&env);

    env.as_contract(&_client.address, || {
        register_trusted_contract(&env, &admin, &external).unwrap();
        deregister_trusted_contract(&env, &attacker, &external).unwrap();
    });
}

// ── is_trusted / trusted_contracts ───────────────────────────────────────────

#[test]
fn test_is_trusted_returns_false_for_unknown() {
    let (env, _client, _admin, _token) = setup();
    let unknown = Address::generate(&env);

    env.as_contract(&_client.address, || {
        assert!(!is_trusted(&env, &unknown));
    });
}

#[test]
fn test_trusted_contracts_empty_by_default() {
    let (env, _client, _admin, _token) = setup();

    env.as_contract(&_client.address, || {
        assert_eq!(trusted_contracts(&env).len(), 0);
    });
}

// ── invoke_external ───────────────────────────────────────────────────────────

#[test]
fn test_invoke_external_dispatches_to_trusted_contract() {
    let (env, _client, admin, _token) = setup();

    // Register the stub contract.
    let stub_id = env.register(StubContract, ());

    env.as_contract(&_client.address, || {
        register_trusted_contract(&env, &admin, &stub_id).unwrap();

        let fn_name = Symbol::new(&env, "ping");
        let args: Vec<Val> = Vec::new(&env);
        let result: Val = invoke_external(&env, &stub_id, &fn_name, args);

        // The stub returns 42 as u32; verify via raw Val round-trip.
        let returned: u32 = soroban_sdk::FromVal::from_val(&env, &result);
        assert_eq!(returned, 42u32);
    });
}

#[test]
fn test_invoke_external_emits_audit_event() {
    let (env, _client, admin, _token) = setup();
    let stub_id = env.register(StubContract, ());

    env.as_contract(&_client.address, || {
        register_trusted_contract(&env, &admin, &stub_id).unwrap();

        let fn_name = Symbol::new(&env, "ping");
        let args: Vec<Val> = Vec::new(&env);
        invoke_external(&env, &stub_id, &fn_name, args);
    });

    // At least one event with topic "xc_call" must have been emitted.
    let events = env.events().all();
    let expected = symbol_short!("xc_call");
    let has_audit = events.iter().any(|(_, topics, _)| {
        topics.iter().any(|t| {
            Symbol::try_from_val(&env, &t)
                .map(|s| s == expected)
                .unwrap_or(false)
        })
    });
    assert!(has_audit, "expected xc_call audit event");
}

#[test]
#[should_panic(expected = "target contract is not trusted")]
fn test_invoke_external_panics_on_untrusted_target() {
    let (env, _client, _admin, _token) = setup();
    let untrusted = Address::generate(&env);

    env.as_contract(&_client.address, || {
        let fn_name = Symbol::new(&env, "ping");
        let args: Vec<Val> = Vec::new(&env);
        invoke_external(&env, &untrusted, &fn_name, args);
    });
}

// ── Event emission for register / deregister ─────────────────────────────────

#[test]
fn test_register_emits_event() {
    let (env, _client, admin, _token) = setup();
    let external = Address::generate(&env);

    env.as_contract(&_client.address, || {
        register_trusted_contract(&env, &admin, &external).unwrap();
    });

    let events = env.events().all();
    let expected = symbol_short!("xc_reg");
    let has_reg = events.iter().any(|(_, topics, _)| {
        topics.iter().any(|t| {
            Symbol::try_from_val(&env, &t)
                .map(|s| s == expected)
                .unwrap_or(false)
        })
    });
    assert!(has_reg, "expected xc_reg event after registration");
}

#[test]
fn test_deregister_emits_event() {
    let (env, _client, admin, _token) = setup();
    let external = Address::generate(&env);

    env.as_contract(&_client.address, || {
        register_trusted_contract(&env, &admin, &external).unwrap();
        deregister_trusted_contract(&env, &admin, &external).unwrap();
    });

    let events = env.events().all();
    let expected = symbol_short!("xc_dreg");
    let has_dreg = events.iter().any(|(_, topics, _)| {
        topics.iter().any(|t| {
            Symbol::try_from_val(&env, &t)
                .map(|s| s == expected)
                .unwrap_or(false)
        })
    });
    assert!(has_dreg, "expected xc_dreg event after deregistration");
}
