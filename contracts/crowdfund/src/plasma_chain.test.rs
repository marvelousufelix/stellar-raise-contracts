//! Tests for plasma_chain.
//!
//! Coverage:
//! - checkpoint submission rules and bounds
//! - root verification
//! - exit request validation
//! - challenge and finalize paths
//! - challenge window edge cases

#![cfg(test)]

use soroban_sdk::{
    testutils::{Address as _, Ledger},
    Address, BytesN, Env,
};

use crate::plasma_chain::{
    challenge_exit, finalize_exit, get_exit, request_exit, submit_checkpoint, verify_checkpoint_root,
    EXIT_DELAY_SECS, MAX_TXS_PER_CHECKPOINT,
};

fn root(env: &Env, fill: u8) -> BytesN<32> {
    BytesN::from_array(env, &[fill; 32])
}

#[test]
fn submit_checkpoint_stores_and_verifies_root() {
    let env = Env::default();
    env.mock_all_auths();

    let operator = Address::generate(&env);
    let r = root(&env, 7);

    submit_checkpoint(&env, &operator, 1, 10, r.clone());

    assert!(verify_checkpoint_root(&env, 1, r));
}

#[test]
#[should_panic(expected = "checkpoint block must increase")]
fn submit_checkpoint_requires_increasing_block_number() {
    let env = Env::default();
    env.mock_all_auths();

    let operator = Address::generate(&env);
    submit_checkpoint(&env, &operator, 2, 10, root(&env, 1));
    submit_checkpoint(&env, &operator, 2, 11, root(&env, 2));
}

#[test]
#[should_panic(expected = "tx count exceeds checkpoint cap")]
fn submit_checkpoint_rejects_oversized_batch() {
    let env = Env::default();
    env.mock_all_auths();

    let operator = Address::generate(&env);
    submit_checkpoint(
        &env,
        &operator,
        1,
        MAX_TXS_PER_CHECKPOINT + 1,
        root(&env, 9),
    );
}

#[test]
fn request_exit_creates_pending_exit() {
    let env = Env::default();
    env.mock_all_auths();

    let operator = Address::generate(&env);
    let claimant = Address::generate(&env);
    submit_checkpoint(&env, &operator, 1, 3, root(&env, 3));

    request_exit(&env, &claimant, 1, 2, 500, 1);

    let exit = get_exit(&env, &claimant).expect("exit must exist");
    assert_eq!(exit.amount, 500);
    assert!(!exit.challenged);
}

#[test]
#[should_panic(expected = "pending exit already exists")]
fn request_exit_rejects_duplicate_pending_exit() {
    let env = Env::default();
    env.mock_all_auths();

    let operator = Address::generate(&env);
    let claimant = Address::generate(&env);
    submit_checkpoint(&env, &operator, 1, 5, root(&env, 4));

    request_exit(&env, &claimant, 1, 0, 100, 1);
    request_exit(&env, &claimant, 1, 1, 200, 1);
}

#[test]
#[should_panic(expected = "tx index out of range")]
fn request_exit_rejects_out_of_range_index() {
    let env = Env::default();
    env.mock_all_auths();

    let operator = Address::generate(&env);
    let claimant = Address::generate(&env);
    submit_checkpoint(&env, &operator, 1, 1, root(&env, 5));

    request_exit(&env, &claimant, 1, 1, 100, 1);
}

#[test]
fn challenge_marks_exit_and_blocks_finalize() {
    let env = Env::default();
    env.mock_all_auths();

    let operator = Address::generate(&env);
    let claimant = Address::generate(&env);
    let challenger = Address::generate(&env);

    submit_checkpoint(&env, &operator, 1, 2, root(&env, 8));
    request_exit(&env, &claimant, 1, 0, 100, 1);
    challenge_exit(&env, &challenger, &claimant);

    let exit = get_exit(&env, &claimant).expect("exit must exist");
    assert!(exit.challenged);
}

#[test]
#[should_panic(expected = "challenged exit cannot finalize")]
fn challenged_exit_cannot_finalize() {
    let env = Env::default();
    env.mock_all_auths();

    let operator = Address::generate(&env);
    let claimant = Address::generate(&env);
    let challenger = Address::generate(&env);

    submit_checkpoint(&env, &operator, 1, 2, root(&env, 6));
    request_exit(&env, &claimant, 1, 0, 250, 1);
    challenge_exit(&env, &challenger, &claimant);

    finalize_exit(&env, &claimant);
}

#[test]
#[should_panic(expected = "exit challenge period active")]
fn finalize_requires_challenge_window_to_elapse() {
    let env = Env::default();
    env.mock_all_auths();

    let operator = Address::generate(&env);
    let claimant = Address::generate(&env);

    submit_checkpoint(&env, &operator, 1, 2, root(&env, 12));
    request_exit(&env, &claimant, 1, 1, 700, 1);

    finalize_exit(&env, &claimant);
}

#[test]
fn finalize_succeeds_after_delay_and_clears_state() {
    let env = Env::default();
    env.mock_all_auths();

    let operator = Address::generate(&env);
    let claimant = Address::generate(&env);

    let start = env.ledger().timestamp();
    submit_checkpoint(&env, &operator, 1, 2, root(&env, 15));
    request_exit(&env, &claimant, 1, 1, 900, 1);

    env.ledger().set_timestamp(start + EXIT_DELAY_SECS + 1);
    let amount = finalize_exit(&env, &claimant);

    assert_eq!(amount, 900);
    assert!(get_exit(&env, &claimant).is_none());
}
