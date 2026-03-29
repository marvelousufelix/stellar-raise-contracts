# data_availability_layer

## Overview

`data_availability_layer` is a Soroban smart contract module that provides
gas-efficient, bounded chunked data storage for the crowdfund contract. It
stores fixed-size data chunk metadata in instance storage, validates inputs
before writing, and exposes a simple XOR checksum utility.

## Functions

| Function | Description |
|---|---|
| `store_chunk(env, index, size)` | Validates and stores a `DataChunk`. Returns `Err` if `size > MAX_CHUNK_SIZE` or `index >= MAX_CHUNKS`. |
| `get_chunk(env, index)` | Returns `Some(DataChunk)` if stored, `None` otherwise. |
| `chunk_count(env)` | Counts stored chunks across all valid indices. |
| `clear_chunks(env)` | Removes all stored chunks. |
| `compute_checksum(data)` | Pure XOR fold over a byte slice; returns 0 for empty input. |
| `chunk_storage_key(index)` | Maps index 0–15 to Symbol key strings `"c0"`–`"c15"`. |

### DataChunk

```rust
#[contracttype]
pub struct DataChunk {
    pub index: u32,
    pub size: u32,
    pub checksum: u32,  // size XOR index
}
```

## Security Assumptions

1. **Bounded writes** — `store_chunk` rejects `size > MAX_CHUNK_SIZE` and
   `index >= MAX_CHUNKS`, preventing unbounded storage growth.
2. **No auth required** — access control must be enforced by the caller.
3. **Deterministic checksums** — `compute_checksum` is a pure function with no
   side-effects; safe to call in read-only simulations.
4. **No cross-module side-effects** — only reads/writes Symbol keys `"c0"`–`"c15"`.

## Gas Efficiency Notes

- Each `store_chunk` / `get_chunk` call touches exactly one storage slot.
- `chunk_count` iterates all 16 slots in the worst case; call sparingly.
- `clear_chunks` issues exactly 16 `remove` operations regardless of how many
  chunks are actually stored.
- Chunk metadata (3 × u32) is small; storage fees are minimal per chunk.

## Constants

| Constant | Value | Description |
|---|---|---|
| `MAX_CHUNK_SIZE` | `256` | Maximum bytes per chunk |
| `MAX_CHUNKS` | `16` | Maximum number of chunks (indices 0–15) |

## Usage Example

```rust
use crate::data_availability_layer::{store_chunk, get_chunk, compute_checksum};

// Store a 128-byte chunk at index 0
let chunk = store_chunk(&env, 0, 128).expect("valid chunk");

// Retrieve it later
let retrieved = get_chunk(&env, 0).expect("chunk exists");
assert_eq!(retrieved.size, 128);

// Compute a checksum over raw bytes
let checksum = compute_checksum(&[0xDE, 0xAD, 0xBE, 0xEF]);
```

## Test Coverage

Tests are in `data_availability_layer.test.rs` and cover:

- `store_chunk` — valid storage, max size, zero size, checksum value
- `store_chunk` — rejection of oversized chunks and out-of-range indices
- `get_chunk` — None for missing and out-of-range indices
- `chunk_count` — initial zero, increment on store
- `clear_chunks` — removes all chunks, no-op on empty storage
- `compute_checksum` — empty slice, single byte, determinism, XOR fold
- Constant values

Target: **≥ 95% statement coverage**.
