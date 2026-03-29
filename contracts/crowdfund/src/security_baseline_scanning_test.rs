//! Tests for the `security_baseline_scanning` module.
//!
//! Covers:
//! - `run_baseline_scan` passes on a correctly initialised contract
//! - Each individual check returns the correct `ScanError` when its invariant
//!   is violated
//! - `check_deadline_valid` fails after the deadline has passed
//! - `check_contributions_non_negative` passes with multiple contributors
//! - `check_contributions_non_negative` passes with no contributors

#![cfg(test)]

use soroban_sdk::{
    testutils::{Address as _, Ledger},
    token, Address, Env,
};

use crate::{
    security_baseline_scanning::{
        check_admin_set, check_contributions_non_negative, check_creator_set,
        check_deadline_valid, check_goal_positive, check_min_contribution_valid,
        check_status_set, check_total_raised_non_negative, run_baseline_scan, ScanError,
    },
    CrowdfundContract, CrowdfundContractClient, DataKey,
};

// ── Helper ────────────────────────────────────────────────────────────────────

fn setup() -> (Env, CrowdfundContractClient<'static>, Address, Address, Address) {
    let env = Env::default();
    env.mock_all_auths();

    let contract_id = env.register(CrowdfundContract, ());
    let client = CrowdfundContractClient::new(&env, &contract_id);

    let token_admin = Address::generate(&env);
    let token_id = env.register_stellar_asset_contract_v2(token_admin.clone());
    let token_address = token_id.address();
    let token_client = token::StellarAssetClient::new(&env, &token_address);

    let admin = Address::generate(&env);
    let creator = Address::generate(&env);
    token_client.mint(&creator, &10_000_000);

    let deadline = env.ledger().timestamp() + 10_000;
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

    (env, client, admin, creator, token_address)
}

// ── run_baseline_scan ─────────────────────────────────────────────────────────

#[test]
fn test_full_scan_passes_on_valid_contract() {
    let (env, client, _, _, _) = setup();
    env.as_contract(&client.address, || {
        run_baseline_scan(&env).unwrap();
    });
}

// ── check_admin_set ───────────────────────────────────────────────────────────

#[test]
fn test_check_admin_set_passes() {
    let (env, client, _, _, _) = setup();
    env.as_contract(&client.address, || {
        assert!(check_admin_set(&env).is_ok());
    });
}

#[test]
fn test_check_admin_set_fails_when_missing() {
    let env = Env::default();
    let contract_id = env.register(CrowdfundContract, ());
    // Contract not initialised — Admin key absent.
    env.as_contract(&contract_id, || {
        assert_eq!(check_admin_set(&env), Err(ScanError::AdminNotSet));
    });
}

// ── check_creator_set ─────────────────────────────────────────────────────────

#[test]
fn test_check_creator_set_passes() {
    let (env, client, _, _, _) = setup();
    env.as_contract(&client.address, || {
        assert!(check_creator_set(&env).is_ok());
    });
}

#[test]
fn test_check_creator_set_fails_when_missing() {
    let env = Env::default();
    let contract_id = env.register(CrowdfundContract, ());
    env.as_contract(&contract_id, || {
        assert_eq!(check_creator_set(&env), Err(ScanError::CreatorNotSet));
    });
}

// ── check_goal_positive ───────────────────────────────────────────────────────

#[test]
fn test_check_goal_positive_passes() {
    let (env, client, _, _, _) = setup();
    env.as_contract(&client.address, || {
        assert!(check_goal_positive(&env).is_ok());
    });
}

#[test]
fn test_check_goal_positive_fails_when_zero() {
    let env = Env::default();
    let contract_id = env.register(CrowdfundContract, ());
    env.as_contract(&contract_id, || {
        env.storage().instance().set(&DataKey::Goal, &0i128);
        assert_eq!(check_goal_positive(&env), Err(ScanError::GoalInvalid));
    });
}

#[test]
fn test_check_goal_positive_fails_when_missing() {
    let env = Env::default();
    let contract_id = env.register(CrowdfundContract, ());
    env.as_contract(&contract_id, || {
        assert_eq!(check_goal_positive(&env), Err(ScanError::GoalInvalid));
    });
}

// ── check_deadline_valid ──────────────────────────────────────────────────────

#[test]
fn test_check_deadline_valid_passes_during_active_campaign() {
    let (env, client, _, _, _) = setup();
    env.as_contract(&client.address, || {
        assert!(check_deadline_valid(&env).is_ok());
    });
}

#[test]
fn test_check_deadline_valid_fails_after_deadline() {
    let (env, client, _, _, _) = setup();
    // Advance ledger past the deadline.
    env.ledger().set_timestamp(env.ledger().timestamp() + 20_000);
    env.as_contract(&client.address, || {
        assert_eq!(check_deadline_valid(&env), Err(ScanError::DeadlineInvalid));
    });
}

#[test]
fn test_check_deadline_valid_fails_when_missing() {
    let env = Env::default();
    let contract_id = env.register(CrowdfundContract, ());
    env.as_contract(&contract_id, || {
        assert_eq!(check_deadline_valid(&env), Err(ScanError::DeadlineInvalid));
    });
}

// ── check_min_contribution_valid ──────────────────────────────────────────────

#[test]
fn test_check_min_contribution_valid_passes() {
    let (env, client, _, _, _) = setup();
    env.as_contract(&client.address, || {
        assert!(check_min_contribution_valid(&env).is_ok());
    });
}

#[test]
fn test_check_min_contribution_valid_fails_when_missing() {
    let env = Env::default();
    let contract_id = env.register(CrowdfundContract, ());
    env.as_contract(&contract_id, || {
        assert_eq!(
            check_min_contribution_valid(&env),
            Err(ScanError::MinContributionInvalid)
        );
    });
}

// ── check_total_raised_non_negative ───────────────────────────────────────────

#[test]
fn test_check_total_raised_non_negative_passes() {
    let (env, client, _, _, _) = setup();
    env.as_contract(&client.address, || {
        assert!(check_total_raised_non_negative(&env).is_ok());
    });
}

#[test]
fn test_check_total_raised_non_negative_passes_when_missing() {
    // Missing key defaults to 0, which is valid.
    let env = Env::default();
    let contract_id = env.register(CrowdfundContract, ());
    env.as_contract(&contract_id, || {
        assert!(check_total_raised_non_negative(&env).is_ok());
    });
}

// ── check_status_set ──────────────────────────────────────────────────────────

#[test]
fn test_check_status_set_passes() {
    let (env, client, _, _, _) = setup();
    env.as_contract(&client.address, || {
        assert!(check_status_set(&env).is_ok());
    });
}

#[test]
fn test_check_status_set_fails_when_missing() {
    let env = Env::default();
    let contract_id = env.register(CrowdfundContract, ());
    env.as_contract(&contract_id, || {
        assert_eq!(check_status_set(&env), Err(ScanError::StatusNotSet));
    });
}

// ── check_contributions_non_negative ─────────────────────────────────────────

#[test]
fn test_check_contributions_non_negative_passes_with_no_contributors() {
    let (env, client, _, _, _) = setup();
    env.as_contract(&client.address, || {
        assert!(check_contributions_non_negative(&env).is_ok());
    });
}

#[test]
fn test_check_contributions_non_negative_passes_with_contributors() {
    let (env, client, _, creator, token_address) = setup();
    let contributor = creator.clone();
    client.contribute(&contributor, &100_i128);

    env.as_contract(&client.address, || {
        assert!(check_contributions_non_negative(&env).is_ok());
    });
}
