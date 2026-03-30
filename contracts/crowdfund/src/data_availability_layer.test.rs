//! # data_availability_layer tests
//!
//! @title   DataAvailabilityLayer Test Suite
//! @notice  Comprehensive tests for gas-efficient chunked data storage.
//!
//! ## Test output notes
//! Run with:
//!   cargo test -p crowdfund data_availability_layer -- --nocapture
//!
//! ## Security notes
//! - store_chunk rejects oversized chunks and out-of-range indices.
//! - clear_chunks verified to remove all stored state.
//! - compute_checksum is pure and deterministic.

#![cfg(test)]

use soroban_sdk::Env;

use crate::data_availability_layer::{
    chunk_count, clear_chunks, compute_checksum, get_chunk, store_chunk,
    DataChunk, MAX_CHUNK_SIZE, MAX_CHUNKS,
};

fn env() -> Env {
    Env::default()
}

// ── store_chunk — valid ───────────────────────────────────────────────────────

#[test]
fn test_store_chunk_valid_stored_and_retrievable() {
    let env = env();
    let result = store_chunk(&env, 0, 128);
    assert!(result.is_ok());
    let chunk = result.unwrap();
    assert_eq!(chunk.index, 0);
    assert_eq!(chunk.size, 128);
    let retrieved = get_chunk(&env, 0);
    assert_eq!(retrieved, Some(chunk));
}

#[test]
fn test_store_chunk_max_size_accepted() {
    let env = env();
    assert!(store_chunk(&env, 1, MAX_CHUNK_SIZE).is_ok());
}

#[test]
fn test_store_chunk_zero_size_accepted() {
    let env = env();
    assert!(store_chunk(&env, 2, 0).is_ok());
}

#[test]
fn test_store_chunk_checksum_is_size_xor_index() {
    let env = env();
    let chunk = store_chunk(&env, 3, 100).unwrap();
    assert_eq!(chunk.checksum, 100 ^ 3);
}

// ── store_chunk — invalid ─────────────────────────────────────────────────────

#[test]
fn test_store_chunk_rejects_oversized() {
    let env = env();
    let result = store_chunk(&env, 0, MAX_CHUNK_SIZE + 1);
    assert_eq!(result, Err("chunk too large"));
}

#[test]
fn test_store_chunk_rejects_out_of_range_index() {
    let env = env();
    let result = store_chunk(&env, MAX_CHUNKS, 10);
    assert_eq!(result, Err("index out of range"));
}

// ── get_chunk ─────────────────────────────────────────────────────────────────

#[test]
fn test_get_chunk_returns_none_for_missing() {
    let env = env();
    assert_eq!(get_chunk(&env, 5), None);
}

#[test]
fn test_get_chunk_returns_none_for_out_of_range_index() {
    let env = env();
    assert_eq!(get_chunk(&env, MAX_CHUNKS), None);
}

// ── chunk_count ───────────────────────────────────────────────────────────────

#[test]
fn test_chunk_count_zero_initially() {
    let env = env();
    assert_eq!(chunk_count(&env), 0);
}

#[test]
fn test_chunk_count_increments_on_store() {
    let env = env();
    store_chunk(&env, 0, 10).unwrap();
    assert_eq!(chunk_count(&env), 1);
    store_chunk(&env, 1, 20).unwrap();
    assert_eq!(chunk_count(&env), 2);
}

// ── clear_chunks ──────────────────────────────────────────────────────────────

#[test]
fn test_clear_chunks_removes_all() {
    let env = env();
    store_chunk(&env, 0, 10).unwrap();
    store_chunk(&env, 1, 20).unwrap();
    store_chunk(&env, 2, 30).unwrap();
    assert_eq!(chunk_count(&env), 3);
    clear_chunks(&env);
    assert_eq!(chunk_count(&env), 0);
}

#[test]
fn test_clear_chunks_on_empty_does_not_panic() {
    let env = env();
    clear_chunks(&env); // should not panic
    assert_eq!(chunk_count(&env), 0);
}

// ── compute_checksum ──────────────────────────────────────────────────────────

#[test]
fn test_compute_checksum_empty_slice_returns_zero() {
    assert_eq!(compute_checksum(&[]), 0);
}

#[test]
fn test_compute_checksum_single_byte() {
    assert_eq!(compute_checksum(&[42]), 42);
}

#[test]
fn test_compute_checksum_deterministic() {
    let data = [1u8, 2, 3, 4, 5];
    assert_eq!(compute_checksum(&data), compute_checksum(&data));
}

#[test]
fn test_compute_checksum_xor_fold() {
    // 1 ^ 2 ^ 3 = 0
    assert_eq!(compute_checksum(&[1, 2, 3]), 0);
}

// ── Constants ─────────────────────────────────────────────────────────────────

#[test]
fn test_max_chunk_size_value() {
    assert_eq!(MAX_CHUNK_SIZE, 256);
}

#[test]
fn test_max_chunks_value() {
    assert_eq!(MAX_CHUNKS, 16);
}
