//! # Cross-Contract Communication
//!
//! This module provides gas-efficient, secure cross-contract communication
//! primitives for the Stellar Raise crowdfund contract.
//!
//! On Stellar/Soroban there are no rollups — the equivalent of "cross-rollup"
//! communication is **cross-contract invocation**: calling external contracts
//! (e.g. token contracts, NFT contracts, factory contracts, or third-party
//! protocol adapters) from within this contract.
//!
//! ## Design Goals
//!
//! | Goal | Mechanism |
//! |------|-----------|
//! | Gas efficiency | Batch calls; avoid redundant storage reads |
//! | Security | Allowlist of trusted contract addresses; auth checks |
//! | Interoperability | Generic `invoke_external` for arbitrary contracts |
//! | Auditability | Events emitted for every external call |
//!
//! ## Security Assumptions
//!
//! 1. Only the campaign **admin** can register or remove trusted contracts.
//! 2. `invoke_external` only dispatches to allowlisted addresses.
//! 3. All state mutations happen **before** external calls (CEI pattern).
//! 4. The trusted-contract list is bounded to [`MAX_TRUSTED_CONTRACTS`] entries
//!    to prevent unbounded storage growth.

#![allow(missing_docs)]

use soroban_sdk::{contracttype, symbol_short, Address, Env, Symbol, Val, Vec};

use crate::{ContractError, DataKey};

// ── Constants ─────────────────────────────────────────────────────────────────

/// Maximum number of contracts that may be registered in the trusted allowlist.
pub const MAX_TRUSTED_CONTRACTS: u32 = 20;

// ── Storage key ───────────────────────────────────────────────────────────────

/// Storage key for the trusted-contract allowlist.
///
/// Stored separately from the main [`DataKey`] enum so this module can be
/// compiled and tested independently.
#[derive(Clone)]
#[contracttype]
pub enum CrossRollupKey {
    /// Vec<Address> — the allowlisted external contract addresses.
    TrustedContracts,
}

// ── Public API ────────────────────────────────────────────────────────────────

/// Register an external contract address in the trusted allowlist.
///
/// @notice Only the admin may call this function.
/// @dev    Silently no-ops if the address is already registered.
/// @param env Soroban environment.
/// @param admin The admin address (must match stored admin; auth required).
/// @param contract_address The external contract to trust.
/// @return `Ok(())` on success, `Err(ContractError)` on failure.
pub fn register_trusted_contract(
    env: &Env,
    admin: &Address,
    contract_address: &Address,
) -> Result<(), ContractError> {
    // Verify caller is the stored admin.
    let stored_admin: Address = env.storage().instance().get(&DataKey::Admin).unwrap();
    if admin != &stored_admin {
        panic!("not authorized");
    }
    admin.require_auth();

    let mut trusted = load_trusted_contracts(env);

    // Idempotent — skip if already registered.
    if trusted.contains(contract_address) {
        return Ok(());
    }

    if trusted.len() >= MAX_TRUSTED_CONTRACTS {
        panic!("trusted contract limit reached");
    }

    trusted.push_back(contract_address.clone());
    save_trusted_contracts(env, &trusted);

    env.events().publish(
        (symbol_short!("xc_reg"), contract_address.clone()),
        contract_address.clone(),
    );

    Ok(())
}

/// Remove an external contract address from the trusted allowlist.
///
/// @notice Only the admin may call this function.
/// @param env Soroban environment.
/// @param admin The admin address (must match stored admin; auth required).
/// @param contract_address The external contract to remove.
/// @return `Ok(())` on success (including when address was not registered).
pub fn deregister_trusted_contract(
    env: &Env,
    admin: &Address,
    contract_address: &Address,
) -> Result<(), ContractError> {
    let stored_admin: Address = env.storage().instance().get(&DataKey::Admin).unwrap();
    if admin != &stored_admin {
        panic!("not authorized");
    }
    admin.require_auth();

    let trusted = load_trusted_contracts(env);
    let mut updated: Vec<Address> = Vec::new(env);
    for addr in trusted.iter() {
        if &addr != contract_address {
            updated.push_back(addr);
        }
    }
    save_trusted_contracts(env, &updated);

    env.events().publish(
        (symbol_short!("xc_dreg"), contract_address.clone()),
        contract_address.clone(),
    );

    Ok(())
}

/// Invoke a function on a trusted external contract.
///
/// This is the primary cross-contract dispatch primitive. It:
/// 1. Verifies `target` is in the trusted allowlist.
/// 2. Invokes `function` with `args` on `target`.
/// 3. Emits an audit event.
///
/// @notice The caller is responsible for any auth required by the target contract.
/// @param env Soroban environment.
/// @param target The external contract address to call.
/// @param function The function name to invoke.
/// @param args Arguments to pass to the function.
/// @return The raw return value from the external contract.
///
/// # Panics
/// Panics if `target` is not in the trusted allowlist.
pub fn invoke_external(
    env: &Env,
    target: &Address,
    function: &Symbol,
    args: Vec<Val>,
) -> Val {
    assert_trusted(env, target);

    let result: Val = env.invoke_contract(target, function, args);

    env.events().publish(
        (symbol_short!("xc_call"), target.clone()),
        function.clone(),
    );

    result
}

/// Returns the current list of trusted contract addresses.
///
/// @param env Soroban environment.
/// @return Vec of trusted [`Address`] values.
pub fn trusted_contracts(env: &Env) -> Vec<Address> {
    load_trusted_contracts(env)
}

/// Returns `true` if `contract_address` is in the trusted allowlist.
///
/// @param env Soroban environment.
/// @param contract_address Address to check.
pub fn is_trusted(env: &Env, contract_address: &Address) -> bool {
    load_trusted_contracts(env).contains(contract_address)
}

// ── Internal helpers ──────────────────────────────────────────────────────────

fn load_trusted_contracts(env: &Env) -> Vec<Address> {
    env.storage()
        .instance()
        .get(&CrossRollupKey::TrustedContracts)
        .unwrap_or_else(|| Vec::new(env))
}

fn save_trusted_contracts(env: &Env, list: &Vec<Address>) {
    env.storage()
        .instance()
        .set(&CrossRollupKey::TrustedContracts, list);
}

/// Panics if `target` is not in the trusted allowlist.
fn assert_trusted(env: &Env, target: &Address) {
    if !is_trusted(env, target) {
        panic!("target contract is not trusted");
    }
}
