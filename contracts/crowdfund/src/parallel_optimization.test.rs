#![cfg(test)]

//! Tests for parallel_optimization module.
//! Security: fail-fast, bounds, auth.

use soroban_sdk::{
    testutils::{Address as _, Ledger, MockAuth},
    token, Address, Env, Symbol, Vec,
};

use crate::{
    parallel_optimization::{batch_creator_withdraw, batch_refund, RefundEntry, WithdrawEntry, MAX_PARALLEL_BATCH},
    Crowdfund
