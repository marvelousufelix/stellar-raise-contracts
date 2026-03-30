//! # data_availability_layer
//!
//! @title   DataAvailabilityLayer — Gas-efficient chunked data storage for
//!          the crowdfund contract.
//!
//! @notice  Provides helpers to store, retrieve, and clear fixed-size data
//!          chunks in instance storage.  Each chunk is validated against
//!          `MAX_CHUNK_SIZE` and `MAX_CHUNKS` before writing, keeping
//!          per-operation gas costs predictable and bounded.
//!
//! @dev     Chunks are stored individually under Symbol keys `"c0"` – `"c15"`.
//!          This avoids encoding a variable-length collection and keeps each
//!          read/write to a single storage operation.
//!
//! ## Security Assumptions
//!
//! 1. **Bounded writes** — `store_chunk` rejects oversized or out-of-range
//!    inputs, preventing unbounded storage growth.
//! 2. **No auth required** — access control must be enforced by the caller;
//!    this module is a pure storage utility.
//! 3. **Deterministic checksums** — `compute_checksum` is a pure function with
//!    no side-effects; it can be called freely in simulations.
//! 4. **No cross-module side-effects** — this module only reads/writes its own
//!    Symbol keys and never calls token or NFT contracts.

#![allow(dead_code)]

use soroban_sdk::{contracttype, Env, Symbol};

// ── Constants ─────────────────────────────────────────────────────────────────

/// Maximum number of bytes allowed in a single data chunk.
pub const MAX_CHUNK_SIZE: u32 = 256;

/// Maximum number of chunks that can be stored (indices 0 – 15).
pub const MAX_CHUNKS: u32 = 16;

// ── Types ─────────────────────────────────────────────────────────────────────

/// Metadata for a stored data chunk.
///
/// @notice `checksum` is computed as `size XOR index` for fast integrity checks.
#[contracttype]
#[derive(Clone, PartialEq, Debug)]
pub struct DataChunk {
    pub index: u32,
    pub size: u32,
    pub checksum: u32,
}

// ── Storage key helpers ───────────────────────────────────────────────────────

/// Maps a chunk index to its Symbol storage key.
///
/// @dev Only indices 0–15 are valid; panics on out-of-range input.
pub fn chunk_storage_key(index: u32) -> &'static str {
    match index {
        0 => "c0",
        1 => "c1",
        2 => "c2",
        3 => "c3",
        4 => "c4",
        5 => "c5",
        6 => "c6",
        7 => "c7",
        8 => "c8",
        9 => "c9",
        10 => "c10",
        11 => "c11",
        12 => "c12",
        13 => "c13",
        14 => "c14",
        15 => "c15",
        _ => panic!("chunk index out of range"),
    }
}

// ── Public API ────────────────────────────────────────────────────────────────

/// Stores a data chunk at the given index.
///
/// @param env   The Soroban environment.
/// @param index Chunk index (0 – MAX_CHUNKS-1).
/// @param size  Byte size of the chunk (0 – MAX_CHUNK_SIZE).
/// @return      Ok(DataChunk) on success, or a static error string.
pub fn store_chunk(env: &Env, index: u32, size: u32) -> Result<DataChunk, &'static str> {
    if size > MAX_CHUNK_SIZE {
        return Err("chunk too large");
    }
    if index >= MAX_CHUNKS {
        return Err("index out of range");
    }
    let chunk = DataChunk {
        index,
        size,
        checksum: size ^ index,
    };
    let key = Symbol::new(env, chunk_storage_key(index));
    env.storage().instance().set(&key, &chunk);
    Ok(chunk)
}

/// Retrieves a stored data chunk by index.
///
/// @param env   The Soroban environment.
/// @param index Chunk index to retrieve.
/// @return      Some(DataChunk) if stored, None otherwise.
pub fn get_chunk(env: &Env, index: u32) -> Option<DataChunk> {
    if index >= MAX_CHUNKS {
        return None;
    }
    let key = Symbol::new(env, chunk_storage_key(index));
    env.storage().instance().get(&key)
}

/// Returns the number of chunks currently stored.
///
/// @param env The Soroban environment.
/// @return    Count of stored chunks across all valid indices.
pub fn chunk_count(env: &Env) -> u32 {
    (0..MAX_CHUNKS)
        .filter(|&i| get_chunk(env, i).is_some())
        .count() as u32
}

/// Removes all stored chunks.
///
/// @param env The Soroban environment.
pub fn clear_chunks(env: &Env) {
    for i in 0..MAX_CHUNKS {
        let key = Symbol::new(env, chunk_storage_key(i));
        env.storage().instance().remove(&key);
    }
}

/// Computes a simple XOR checksum over a byte slice.
///
/// @param data Byte slice to checksum.
/// @return     XOR fold of all bytes cast to u32; 0 for an empty slice.
pub fn compute_checksum(data: &[u8]) -> u32 {
    data.iter().fold(0u32, |acc, &b| acc ^ b as u32)
}
