//! Tests for contribute() error handling.
//!
//! Covers every error path in `contribute()`:
//!   - `AmountTooLow`  (code 9) — amount < min_contribution
//!   - `CampaignEnded` (code 2) — contribution after deadline
//!   - `Overflow`      (code 6) — error code constant correctness
//!   - happy-path sanity check
//!   - zero-amount contribution (AmountTooLow when min > 0)
//!   - exact-deadline boundary (accepted — strict > check)
//!   - `describe_error` / `is_retryable` helper coverage

use soroban_sdk::{
    testutils::{Address as _, Ledger},
    token, Address, Env,
};

use crate::{contribute_error_handling, ContractError, CrowdfundContract, CrowdfundContractClient};

// ── helpers ──────────────────────────────────────────────────────────────────

const GOAL: i128 = 1_000;
const MIN: i128 = 10;
const DEADLINE_OFFSET: u64 = 1_000;

fn setup() -> (Env, CrowdfundContractClient<'static>, Address, Address) {
    let env = Env::default();
    env.mock_all_auths();

    let contract_id = env.register(CrowdfundContract, ());
    let client = CrowdfundContractClient::new(&env, &contract_id);

    let token_admin = Address::generate(&env);
    let token_id = env.register_stellar_asset_contract_v2(token_admin.clone());
    let token_addr = token_id.address();
    let asset_client = token::StellarAssetClient::new(&env, &token_addr);

    let creator = Address::generate(&env);
    let contributor = Address::generate(&env);
    asset_client.mint(&contributor, &i128::MAX);

    let now = env.ledger().timestamp();
    client.initialize(
        &Address::generate(&env),
        &creator,
        &token_addr,
        &GOAL,
        &(now + DEADLINE_OFFSET),
        &MIN,
        &None,
        &None,
        &None,
    );

    (env, client, contributor, token_addr)
}

// ── happy path ────────────────────────────────────────────────────────────────

#[test]
fn contribute_happy_path() {
    let (env, client, contributor, _) = setup();
    env.ledger().set_timestamp(env.ledger().timestamp() + 1);
    client.contribute(&contributor, &MIN);
    assert_eq!(client.contribution(&contributor), MIN);
    assert_eq!(client.total_raised(), MIN);
}

// ── AmountTooLow (code 9) ─────────────────────────────────────────────────────

/// Test: amount one below minimum returns ContractError::AmountTooLow.
#[test]
fn contribute_below_minimum_returns_amount_too_low() {
    let (env, client, contributor, _) = setup();
    env.ledger().set_timestamp(env.ledger().timestamp() + 1);
    let result = client.try_contribute(&contributor, &(MIN - 1));
    assert_eq!(result.unwrap_err().unwrap(), ContractError::AmountTooLow);
}

/// Test: zero amount returns ContractError::AmountTooLow when min > 0.
#[test]
fn contribute_zero_amount_returns_amount_too_low() {
    let (env, client, contributor, _) = setup();
    env.ledger().set_timestamp(env.ledger().timestamp() + 1);
    let result = client.try_contribute(&contributor, &0);
    assert_eq!(result.unwrap_err().unwrap(), ContractError::AmountTooLow);
}

/// Test: negative amount returns ContractError::AmountTooLow.
#[test]
fn contribute_negative_amount_returns_amount_too_low() {
    let (env, client, contributor, _) = setup();
    env.ledger().set_timestamp(env.ledger().timestamp() + 1);
    let result = client.try_contribute(&contributor, &-1);
    assert_eq!(result.unwrap_err().unwrap(), ContractError::AmountTooLow);
}

// ── CampaignEnded (code 2) ────────────────────────────────────────────────────

/// Test: contribution after deadline returns ContractError::CampaignEnded.
#[test]
fn contribute_after_deadline_returns_campaign_ended() {
    let (env, client, contributor, _) = setup();
    env.ledger()
        .set_timestamp(env.ledger().timestamp() + DEADLINE_OFFSET + 1);
    let result = client.try_contribute(&contributor, &MIN);
    assert_eq!(result.unwrap_err().unwrap(), ContractError::CampaignEnded);
}

/// Test: contribution at exactly the deadline timestamp is accepted (strict >).
#[test]
fn contribute_exactly_at_deadline_is_accepted() {
    let (env, client, contributor, _) = setup();
    let deadline = client.deadline();
    env.ledger().set_timestamp(deadline);
    client.contribute(&contributor, &MIN);
    assert_eq!(client.total_raised(), MIN);
}

// ── Overflow (code 6) — constant correctness ──────────────────────────────────

/// Test: Overflow error code constant matches ContractError repr.
#[test]
fn overflow_error_code_matches_contract_error_repr() {
    assert_eq!(contribute_error_handling::error_codes::OVERFLOW, 6);
    assert_eq!(ContractError::Overflow as u32, 6);
}

// ── AmountTooLow constant correctness ─────────────────────────────────────────

/// Test: AmountTooLow error code constant matches ContractError repr.
#[test]
fn amount_too_low_error_code_matches_contract_error_repr() {
    assert_eq!(contribute_error_handling::error_codes::AMOUNT_TOO_LOW, 9);
    assert_eq!(ContractError::AmountTooLow as u32, 9);
}

// ── describe_error helpers ────────────────────────────────────────────────────

#[test]
fn describe_error_campaign_ended() {
    assert_eq!(
        contribute_error_handling::describe_error(
            contribute_error_handling::error_codes::CAMPAIGN_ENDED
        ),
        "Campaign has ended"
    );
}

#[test]
fn describe_error_overflow() {
    assert_eq!(
        contribute_error_handling::describe_error(contribute_error_handling::error_codes::OVERFLOW),
        "Arithmetic overflow — contribution amount too large"
    );
}

#[test]
fn describe_error_amount_too_low() {
    assert_eq!(
        contribute_error_handling::describe_error(
            contribute_error_handling::error_codes::AMOUNT_TOO_LOW
        ),
        "Contribution amount is below the campaign minimum"
    );
}

#[test]
fn describe_error_unknown() {
    assert_eq!(contribute_error_handling::describe_error(99), "Unknown error");
}

#[test]
fn is_retryable_returns_false_for_all_known_errors() {
    assert!(!contribute_error_handling::is_retryable(
        contribute_error_handling::error_codes::CAMPAIGN_ENDED
    ));
    assert!(!contribute_error_handling::is_retryable(
        contribute_error_handling::error_codes::OVERFLOW
    ));
    assert!(!contribute_error_handling::is_retryable(
        contribute_error_handling::error_codes::AMOUNT_TOO_LOW
    ));
}
