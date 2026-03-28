use soroban_sdk::{Env, contracterror};

use crate::ContractError;

#[derive(Clone)]
#[contracttype]
pub enum ReentrancyStatus {
    Idle,
    InTransfer,
}

/// Storage key for reentrancy guard
#[derive(Clone)]
#[contracttype]
pub enum GuardKey {
    ReentrancyStatus,
}

/// Enter reentrancy-protected section
///
/// @notice Panics if already `InTransfer`
/// @dev Instance storage, cleared automatically by tx end
pub fn enter_transfer(env: &Env) {
    let status: ReentrancyStatus = env.storage().instance().get(&GuardKey::ReentrancyStatus).unwrap_or(ReentrancyStatus::Idle);
    if status == ReentrancyStatus::InTransfer {
        panic!("reentrancy detected");
    }
    env.storage().instance().set(&GuardKey::ReentrancyStatus, &ReentrancyStatus::InTransfer);
}

/// Exit reentrancy-protected section
pub fn exit_transfer(env: &Env) {
    env.storage().instance().set(&GuardKey::ReentrancyStatus, &ReentrancyStatus::Idle);
}

/// Protected wrapper for token transfers
pub fn protected_transfer<F>(env: &Env, transfer_fn: F) where F: FnOnce() {
    enter_transfer(env);
    transfer_fn();
    exit_transfer(env);
}

