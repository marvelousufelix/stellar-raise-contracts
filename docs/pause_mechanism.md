# pause_mechanism

Emergency pause/unpause control for the Stellar Raise crowdfund contract.

## Overview

The pause mechanism provides a two-role system for halting critical contract operations during a security incident or discovered vulnerability. When paused, `contribute()` and `withdraw()` are blocked. All read-only functions remain available.

## Roles

| Role | Can Pause | Can Unpause | Notes |
|:-----|:---------:|:-----------:|:------|
| `DEFAULT_ADMIN_ROLE` | ✅ | ✅ | Should be a hardware wallet or multisig |
| `PAUSER_ROLE` | ✅ | ❌ | Low-privilege hot key for fast emergency response |
| Anyone else | ❌ | ❌ | Panics with `"not authorized to pause"` |

The asymmetry is intentional: a compromised `PAUSER_ROLE` key can freeze the contract but cannot unfreeze it, limiting blast radius.

## Contract Entry Points

```rust
// Pause — callable by PAUSER_ROLE or DEFAULT_ADMIN_ROLE
fn pause(env, caller);

// Unpause — callable by DEFAULT_ADMIN_ROLE only
fn unpause(env, caller);

// View: returns true if currently paused
fn paused(env) -> bool;
```

## Storage

Uses `DataKey::Paused` (bool) in instance storage. Defaults to `false` if never set.

## Events

| Event | Payload | Emitted when |
|:------|:--------|:-------------|
| `(access, paused)` | `caller: Address` | Contract is paused |
| `(access, unpaused)` | `caller: Address` | Contract is unpaused |

## Affected Functions

When paused, the following entry points panic with `"contract is paused"`:

- `contribute()`
- `withdraw()`

## Security Assumptions

1. `PAUSER_ROLE` is a low-privilege hot key — it can freeze but not unfreeze.
2. `DEFAULT_ADMIN_ROLE` should be a hardware wallet or multisig.
3. Pause state persists across ledger closes until explicitly unpaused by the admin.
4. Every pause/unpause emits an on-chain event for off-chain monitoring.
5. The pause check runs before any state mutation or token transfer.

## CLI Usage

```bash
# Pause the contract (as pauser or admin)
stellar contract invoke \
  --id <CONTRACT_ID> \
  --network testnet \
  --source <PAUSER_OR_ADMIN_SECRET_KEY> \
  -- pause \
  --caller <PAUSER_OR_ADMIN_ADDRESS>

# Unpause the contract (admin only)
stellar contract invoke \
  --id <CONTRACT_ID> \
  --network testnet \
  --source <ADMIN_SECRET_KEY> \
  -- unpause \
  --caller <ADMIN_ADDRESS>

# Check pause state
stellar contract invoke \
  --id <CONTRACT_ID> \
  --network testnet \
  --source <ANY_KEY> \
  -- paused
```

## Implementation Notes

`pause_mechanism.rs` is a focused facade over `access_control.rs`. All storage and event logic lives in `access_control` to avoid duplication. The facade exists to provide a clear, discoverable entry point for the pause feature with full NatSpec documentation.
