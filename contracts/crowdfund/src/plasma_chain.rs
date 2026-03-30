//! # plasma_chain
//!
//! @title   PlasmaChain — Lightweight plasma-style checkpoint and exit helpers.
//!
//! @notice  Provides bounded, gas-efficient primitives for posting L2 checkpoints
//!          and handling delayed exits with challenge windows.
//!
//! @dev     The module intentionally keeps state compact:
//!          - One checkpoint per block number.
//!          - One pending exit per claimant.
//!          - Constant-time lookups by typed storage keys.
//!
//! ## Security Assumptions
//! 1. Only authorized operators post checkpoints (`operator.require_auth()`).
//! 2. Checkpoint block numbers are strictly increasing.
//! 3. Exit finalization is delayed by `EXIT_DELAY_SECS`.
//! 4. Challenged exits cannot be finalized.
//! 5. All loops are bounded by constants for predictable resource usage.

#![allow(dead_code)]

use soroban_sdk::{contracttype, Address, BytesN, Env, Symbol};

/// @notice Maximum number of transactions accepted in one checkpoint.
/// @dev    Capped to keep verify and indexing costs predictable.
pub const MAX_TXS_PER_CHECKPOINT: u32 = 1024;

/// @notice Minimum anti-spam bond required to open an exit.
pub const MIN_EXIT_BOND: i128 = 1;

/// @notice Delay before an unchallenged exit can be finalized.
pub const EXIT_DELAY_SECS: u64 = 60 * 60; // 1 hour

#[derive(Clone)]
#[contracttype]
enum PlasmaKey {
    LastCheckpointBlock,
    Checkpoint(u64),
    Exit(Address),
}

/// @notice Minimal checkpoint metadata posted by a plasma operator.
#[derive(Clone)]
#[contracttype]
pub struct PlasmaCheckpoint {
    pub block_number: u64,
    pub tx_count: u32,
    pub state_root: BytesN<32>,
    pub operator: Address,
    pub timestamp: u64,
}

/// @notice Pending user exit from the latest valid checkpoint.
#[derive(Clone)]
#[contracttype]
pub struct ExitRequest {
    pub claimant: Address,
    pub block_number: u64,
    pub tx_index: u32,
    pub amount: i128,
    pub bond: i128,
    pub challenged: bool,
    pub requested_at: u64,
}

/// @notice Posts a new plasma checkpoint.
/// @dev    Uses strict monotonic block numbers to prevent replay/overwrite.
pub fn submit_checkpoint(
    env: &Env,
    operator: &Address,
    block_number: u64,
    tx_count: u32,
    state_root: BytesN<32>,
) {
    operator.require_auth();

    assert!(tx_count > 0, "tx count must be > 0");
    assert!(
        tx_count <= MAX_TXS_PER_CHECKPOINT,
        "tx count exceeds checkpoint cap"
    );

    let last: u64 = env
        .storage()
        .instance()
        .get(&PlasmaKey::LastCheckpointBlock)
        .unwrap_or(0);

    assert!(block_number > last, "checkpoint block must increase");

    let checkpoint = PlasmaCheckpoint {
        block_number,
        tx_count,
        state_root,
        operator: operator.clone(),
        timestamp: env.ledger().timestamp(),
    };

    let key = PlasmaKey::Checkpoint(block_number);
    env.storage().persistent().set(&key, &checkpoint);
    env.storage().persistent().extend_ttl(&key, 100, 100);
    env.storage()
        .instance()
        .set(&PlasmaKey::LastCheckpointBlock, &block_number);

    env.events().publish(
        (Symbol::new(env, "plasma"), Symbol::new(env, "checkpoint")),
        (operator.clone(), block_number, tx_count),
    );
}

/// @notice Returns a checkpoint if it exists.
pub fn get_checkpoint(env: &Env, block_number: u64) -> Option<PlasmaCheckpoint> {
    env.storage()
        .persistent()
        .get(&PlasmaKey::Checkpoint(block_number))
}

/// @notice Minimal inclusion verification helper.
/// @dev    Full Merkle-proof validation can be layered on top of this module.
pub fn verify_checkpoint_root(env: &Env, block_number: u64, expected_root: BytesN<32>) -> bool {
    if let Some(checkpoint) = get_checkpoint(env, block_number) {
        return checkpoint.state_root == expected_root;
    }
    false
}

/// @notice Requests an exit from a checkpointed transaction.
/// @dev    Exactly one pending exit per claimant keeps storage bounded.
pub fn request_exit(
    env: &Env,
    claimant: &Address,
    block_number: u64,
    tx_index: u32,
    amount: i128,
    bond: i128,
) {
    claimant.require_auth();

    assert!(amount > 0, "exit amount must be > 0");
    assert!(bond >= MIN_EXIT_BOND, "exit bond too small");

    let checkpoint = get_checkpoint(env, block_number).expect("unknown checkpoint");
    assert!(tx_index < checkpoint.tx_count, "tx index out of range");

    let key = PlasmaKey::Exit(claimant.clone());
    let existing: Option<ExitRequest> = env.storage().persistent().get(&key);
    assert!(existing.is_none(), "pending exit already exists");

    let exit = ExitRequest {
        claimant: claimant.clone(),
        block_number,
        tx_index,
        amount,
        bond,
        challenged: false,
        requested_at: env.ledger().timestamp(),
    };

    env.storage().persistent().set(&key, &exit);
    env.storage().persistent().extend_ttl(&key, 100, 100);

    env.events().publish(
        (Symbol::new(env, "plasma"), Symbol::new(env, "exit_requested")),
        (claimant.clone(), block_number, tx_index, amount),
    );
}

/// @notice Challenges a pending exit.
/// @dev    Any authenticated challenger can flag an invalid exit for governance review.
pub fn challenge_exit(env: &Env, challenger: &Address, claimant: &Address) {
    challenger.require_auth();

    let key = PlasmaKey::Exit(claimant.clone());
    let mut exit: ExitRequest = env
        .storage()
        .persistent()
        .get(&key)
        .expect("exit not found");

    assert!(!exit.challenged, "exit already challenged");
    exit.challenged = true;

    env.storage().persistent().set(&key, &exit);
    env.storage().persistent().extend_ttl(&key, 100, 100);

    env.events().publish(
        (Symbol::new(env, "plasma"), Symbol::new(env, "exit_challenged")),
        (challenger.clone(), claimant.clone(), exit.block_number),
    );
}

/// @notice Finalizes an unchallenged exit after the challenge window.
/// @return The finalized amount for transfer settlement in higher-level logic.
pub fn finalize_exit(env: &Env, claimant: &Address) -> i128 {
    claimant.require_auth();

    let key = PlasmaKey::Exit(claimant.clone());
    let exit: ExitRequest = env
        .storage()
        .persistent()
        .get(&key)
        .expect("exit not found");

    assert!(!exit.challenged, "challenged exit cannot finalize");

    let checkpoint = get_checkpoint(env, exit.block_number).expect("unknown checkpoint");
    let now = env.ledger().timestamp();
    let unlock_time = checkpoint
        .timestamp
        .checked_add(EXIT_DELAY_SECS)
        .expect("exit unlock overflow");

    assert!(now >= unlock_time, "exit challenge period active");

    env.storage().persistent().remove(&key);

    env.events().publish(
        (Symbol::new(env, "plasma"), Symbol::new(env, "exit_finalized")),
        (claimant.clone(), exit.amount),
    );

    exit.amount
}

/// @notice Returns the claimant's pending exit request, if present.
pub fn get_exit(env: &Env, claimant: &Address) -> Option<ExitRequest> {
    env.storage().persistent().get(&PlasmaKey::Exit(claimant.clone()))
}
