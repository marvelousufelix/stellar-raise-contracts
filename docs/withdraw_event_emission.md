# withdraw_event_emission

Validated event helpers for the `withdraw()` function in the Stellar Raise crowdfunding contract.

## Overview

`withdraw_event_emission.rs` centralises all `env.events().publish()` calls for `withdraw()`.
The module prevents silent emission of zero-fee or zero-payout events that would mislead
off-chain indexers, and provides typed return values so unit tests can assert on emitted
data without scanning `env.events()`.

## Performance

The original implementation emitted one `nft_minted` event per contributor (O(n)).
This module replaces that with a single `nft_batch_minted` summary event (O(1)),
capping gas consumption regardless of contributor count.

## Events

| Topic 2 | Data shape | Condition |
|---------|-----------|-----------|
| `fee_transferred` | `(Address, i128, u32)` — platform, fee, fee_bps | Platform fee > 0 |
| `nft_batch_minted` | `u32` — minted count | NFT contract set and minted_count > 0 |
| `withdrawn` | `(Address, i128, u32)` — creator, payout, nft_count | Always on successful withdraw |

The `fee_bps` field in `fee_transferred` lets off-chain indexers verify the fee rate
without an additional storage read.

## Public API

### `emit_fee_transferred(env, platform, fee, fee_bps) -> FeeTransferredPayload`

Emits `("campaign", "fee_transferred")`. Panics if `fee <= 0`.

```rust
let payload = emit_fee_transferred(&env, &platform_addr, 50_000, 500);
assert_eq!(payload.fee, 50_000);
assert_eq!(payload.fee_bps, 500);
```

### `emit_nft_batch_minted(env, minted_count) -> u32`

Emits `("campaign", "nft_batch_minted")`. Panics if `minted_count == 0`.

```rust
let count = emit_nft_batch_minted(&env, 10);
assert_eq!(count, 10);
```

### `emit_withdrawn(env, creator, creator_payout, nft_minted_count) -> WithdrawnPayload`

Emits `("campaign", "withdrawn")`. Panics if `creator_payout <= 0`.

```rust
let payload = emit_withdrawn(&env, &creator, 950_000, 5);
assert_eq!(payload.creator_payout, 950_000);
assert_eq!(payload.nft_minted_count, 5);
```

### `mint_nfts_in_batch(env, nft_contract) -> u32`

Mints NFTs to eligible contributors up to `MAX_NFT_MINT_BATCH` (50).
Returns the number minted. Emits `nft_batch_minted` if minted > 0.

## Return Types

### `FeeTransferredPayload`

```rust
pub struct FeeTransferredPayload {
    pub platform: Address,
    pub fee: i128,
    pub fee_bps: u32,
}
```

### `WithdrawnPayload`

```rust
pub struct WithdrawnPayload {
    pub creator: Address,
    pub creator_payout: i128,
    pub nft_minted_count: u32,
}
```

## Security Assumptions

1. **No storage writes** — helpers only call `env.events().publish()`.
2. **Input validation** — all helpers panic on invalid inputs with descriptive messages.
3. **Overflow-safe** — NFT batch loop uses a hard cap (`MAX_NFT_MINT_BATCH = 50`).
4. **Bounded** — `mint_nfts_in_batch` iterates at most `MAX_NFT_MINT_BATCH` times (O(1)).
5. **CEI compliant** — events are emitted after transfers complete.

## Developer Experience Improvements

| Before | After |
|--------|-------|
| `emit_fee_transferred` returned `()` | Returns `FeeTransferredPayload` — assert without scanning events |
| `fee_transferred` event had no `fee_bps` | `fee_bps` included — off-chain verification without storage read |
| `emit_withdrawn` returned `()` | Returns `WithdrawnPayload` — assert without scanning events |
| Duplicate withdraw logic in lib.rs | Single clean implementation |

## Running Tests

```bash
cargo test -p crowdfund withdraw_event_emission
```

Test coverage target: ≥ 95% of all branches (35+ test cases).
